/**
 * pnpm bootstrap
 *
 * The one command to set CommsCentral up (and to change its configuration later).
 * Asks for the Twilio credentials and a few choices, picks or buys the phone number,
 * stores everything in the Pulumi stack config (secrets encrypted), deploys, and
 * prints the phone app settings. Safe to re-run: previous answers are the defaults.
 */
import { checkbox, confirm, input, password, select } from '@inquirer/prompts';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import twilio from 'twilio';
import { PREFIX_TO_ISO, normalizeNumber } from '@commscentral/shared';
import { writeAdminEnv } from './lib/admin-env.js';
import { phoneSetupText } from './lib/phone-setup.js';
import {
  ROOT,
  getConfig,
  hasCommand,
  pulumi,
  readLocalState,
  removeConfig,
  selectStack,
  setConfig,
  stackOutputs,
  writeLocalState,
} from './lib/pulumi.js';

type Client = ReturnType<typeof twilio>;

const BUNDLES_URL =
  'https://console.twilio.com/us1/develop/phone-numbers/regulatory-compliance/bundles';
const DEFAULT_PREFIXES = ['+41', '+423', '+46', '+90'];

function step(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

function checkTools() {
  step('Checking tools');
  const [major] = process.versions.node.split('.').map(Number);
  if ((major ?? 0) < 22)
    throw new Error(`Node 22 or newer is needed (found ${process.versions.node}).`);
  if (!hasCommand('pnpm')) throw new Error('pnpm is missing: https://pnpm.io/installation');
  if (!hasCommand('pulumi', ['version'])) {
    throw new Error(
      'The Pulumi CLI is missing. Install it with "brew install pulumi/tap/pulumi" or\n' +
        '"curl -fsSL https://get.pulumi.com | sh", then run "pnpm bootstrap" again.',
    );
  }
  console.log('Node, pnpm and Pulumi found.');
}

async function askSecret(label: string, existing: string | null, required = true) {
  if (existing && (await confirm({ message: `Keep the saved ${label}?`, default: true }))) {
    return existing;
  }
  return password({
    message: `${label}${required ? '' : ' (leave empty to skip)'}:`,
    mask: '*',
    validate: (v) => (!required || v.trim() ? true : 'Required'),
  });
}

async function twilioCredentials(): Promise<{
  accountSid: string;
  authToken: string;
  client: Client;
}> {
  step('Twilio account');
  console.log('Find these on https://console.twilio.com (Account Info).');
  for (;;) {
    const accountSid = await input({
      message: 'Account SID:',
      default: getConfig('twilioAccountSid') ?? undefined,
      validate: (v) => /^AC[0-9a-f]{32}$/.test(v.trim()) || 'Starts with AC, 34 characters',
    });
    const authToken = await askSecret('Auth Token', getConfig('twilioAuthToken'));
    const client = twilio(accountSid.trim(), authToken.trim());
    try {
      const account = await client.api.v2010.accounts(accountSid.trim()).fetch();
      console.log(`Connected to "${account.friendlyName}" (${account.type}, ${account.status}).`);
      if (account.type === 'Trial') {
        console.log(
          'Note: trial accounts can only call verified numbers. Upgrade before real use.',
        );
      }
      return { accountSid: accountSid.trim(), authToken: authToken.trim(), client };
    } catch {
      console.log('Those credentials did not work. Try again.');
    }
  }
}

async function buyNumber(client: Client): Promise<string | null> {
  const country = await input({ message: 'Country (ISO code):', default: 'CH' });
  const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list({
    status: 'twilio-approved',
    limit: 20,
  });
  const addresses = await client.addresses.list({ limit: 20 });
  let bundleSid: string | undefined;
  let addressSid: string | undefined;
  if (country === 'CH' || bundles.length > 0) {
    if (bundles.length === 0 || addresses.length === 0) {
      console.log(
        `\nSwiss numbers need an approved regulatory bundle (your address and ID).\n` +
          `Create one once at ${BUNDLES_URL}\n` +
          `(type: Local, Individual). Approval usually takes 1 to 3 business days.\n` +
          `Then run "pnpm bootstrap" again.`,
      );
      return null;
    }
    bundleSid = await select({
      message: 'Regulatory bundle:',
      choices: bundles.map((b) => ({ name: `${b.friendlyName} (${b.sid})`, value: b.sid })),
    });
    addressSid = await select({
      message: 'Address:',
      choices: addresses.map((a) => ({
        name: `${a.street}, ${a.city} (${a.sid})`,
        value: a.sid,
      })),
    });
  }
  const available = await client.availablePhoneNumbers(country).local.list({
    voiceEnabled: true,
    limit: 15,
  });
  if (available.length === 0) {
    console.log('No local numbers available right now. Try again later or another country.');
    return null;
  }
  const phoneNumber = await select({
    message: 'Pick a number:',
    choices: available.map((n) => ({
      name: `${n.friendlyName}  ${n.locality ?? ''}`,
      value: n.phoneNumber,
    })),
  });
  const ok = await confirm({
    message: `Buy ${phoneNumber}? It is billed monthly (about 1.15 USD for a Swiss local number).`,
    default: false,
  });
  if (!ok) return null;
  const bought = await client.incomingPhoneNumbers.create({
    phoneNumber,
    bundleSid,
    addressSid,
    friendlyName: 'CommsCentral',
  });
  console.log(`Bought ${bought.phoneNumber}.`);
  return bought.phoneNumber;
}

async function phoneNumber(client: Client): Promise<string | null> {
  step('CommsCentral phone number');
  const owned = await client.incomingPhoneNumbers.list({ limit: 50 });
  const saved = getConfig('twilioNumber');
  const choice = await select({
    message: 'Which number should CommsCentral use?',
    default: saved ?? undefined,
    choices: [
      ...owned.map((n) => ({ name: `${n.phoneNumber} (${n.friendlyName})`, value: n.phoneNumber })),
      { name: 'Buy a new number', value: '__buy' },
    ],
  });
  return choice === '__buy' ? buyNumber(client) : choice;
}

async function ownerMobile(): Promise<string> {
  step('Your mobile');
  const answer = await input({
    message: 'Your normal mobile number:',
    default: getConfig('ownerMobile') ?? undefined,
    validate: (v) => normalizeNumber(v).ok || 'Not a valid number',
  });
  const n = normalizeNumber(answer);
  if (!n.ok) throw new Error('unreachable');
  return n.e164;
}

async function callerId(client: Client, mobile: string): Promise<'mobile' | 'twilio'> {
  step('Caller ID on outbound calls');
  const verified = await client.outgoingCallerIds.list({ phoneNumber: mobile, limit: 1 });
  const wantMobile = await confirm({
    message: `Show your mobile (${mobile}) as caller ID, so people see your usual number?`,
    default: (getConfig('outboundCallerId') ?? 'mobile') === 'mobile',
  });
  if (!wantMobile) return 'twilio';
  if (verified.length > 0) {
    console.log('Your mobile is already verified with Twilio.');
    return 'mobile';
  }
  const req = await client.validationRequests.create({
    phoneNumber: mobile,
    friendlyName: 'CommsCentral owner mobile',
  });
  console.log(
    `\nTwilio is calling ${mobile} now. When asked, enter this code: ${req.validationCode}\n`,
  );
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const done = await client.outgoingCallerIds.list({ phoneNumber: mobile, limit: 1 });
    if (done.length > 0) {
      console.log('Verified.');
      return 'mobile';
    }
  }
  console.log(
    'Not verified yet. Using the CommsCentral number for now; re-run bootstrap to retry.',
  );
  return 'twilio';
}

async function countries(): Promise<string[]> {
  step('Countries you can call');
  const saved = getConfig('allowedPrefixes');
  const current = saved ? (JSON.parse(saved) as string[]) : DEFAULT_PREFIXES;
  const chosen = await checkbox({
    message: 'Allow outbound calls to (space to toggle, enter to confirm):',
    choices: Object.entries(PREFIX_TO_ISO).map(([prefix, iso]) => ({
      name: `${iso} (${prefix})`,
      value: prefix,
      checked: current.includes(prefix),
    })),
    validate: (v) => v.length > 0 || 'Pick at least one',
  });
  console.log('Every other country is blocked in Twilio (geo permissions).');
  return chosen;
}

async function notifications() {
  step('Voicemail notifications');
  const email = await input({
    message: 'Email for voicemails and spend alerts (empty = SMS to your mobile instead):',
    default: getConfig('notifyEmail') ?? undefined,
  });
  let resendKey = '';
  let emailFrom = getConfig('emailFrom') ?? '';
  if (email.trim()) {
    console.log(
      'Emails are sent with Resend (free for this volume): https://resend.com/api-keys\n' +
        'Without your own domain, Resend can only send to the email of your Resend account.',
    );
    resendKey = await askSecret('Resend API key', getConfig('resendApiKey'), false);
    emailFrom = await input({
      message: 'Sender address:',
      default: emailFrom || 'CommsCentral <onboarding@resend.dev>',
    });
  }
  const alerts = await input({
    message: 'Monthly spend alerts in USD (comma separated):',
    default: (JSON.parse(getConfig('spendAlertsUsd') ?? '[20,50]') as number[]).join(','),
    validate: (v) =>
      v.split(',').every((x) => Number(x.trim()) > 0) || 'Numbers separated by commas',
  });
  return {
    email: email.trim(),
    resendKey: resendKey.trim(),
    emailFrom,
    alerts: alerts.split(',').map((x) => Number(x.trim())),
  };
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

async function main() {
  console.log('CommsCentral bootstrap. Re-run any time; your previous answers are the defaults.');
  checkTools();
  selectStack();

  const { accountSid, authToken, client } = await twilioCredentials();
  setConfig('twilioAccountSid', accountSid);
  setConfig('twilioAuthToken', authToken, true);

  const number = await phoneNumber(client);
  if (!number) {
    console.log('\nNo number yet. Nothing was deployed. Re-run "pnpm bootstrap" when ready.');
    return;
  }
  const mobile = await ownerMobile();
  const outboundCallerId = await callerId(client, mobile);
  const prefixes = await countries();
  const notify = await notifications();

  step('Phone app account');
  const state = readLocalState();
  const sipDomainPrefix =
    getConfig('sipDomainPrefix') ??
    state.sipDomainPrefix ??
    `commscentral-${randomBytes(3).toString('hex')}`;
  const sipUsername = await input({
    message: 'Username for the phone app:',
    default: getConfig('sipUsername') ?? 'me',
    validate: (v) => /^[a-z0-9._-]{2,32}$/i.test(v) || 'Letters, digits, dot, dash, underscore',
  });
  const sipPassword =
    getConfig('sipPassword') ??
    // Twilio requires 12+ characters with a digit and mixed case.
    `Cc1${randomBytes(18).toString('base64url')}`;
  writeLocalState({ ...state, sipDomainPrefix });

  setConfig('twilioNumber', number);
  setConfig('ownerMobile', mobile);
  setConfig('outboundCallerId', outboundCallerId);
  setConfig('allowedPrefixes', JSON.stringify(prefixes));
  setConfig('spendAlertsUsd', JSON.stringify(notify.alerts));
  setConfig('sipDomainPrefix', sipDomainPrefix);
  setConfig('sipUsername', sipUsername);
  setConfig('sipPassword', sipPassword, true);
  if (notify.email) setConfig('notifyEmail', notify.email);
  else removeConfig('notifyEmail');
  if (notify.emailFrom) setConfig('emailFrom', notify.emailFrom);
  if (notify.resendKey) setConfig('resendApiKey', notify.resendKey, true);
  else removeConfig('resendApiKey');

  step('Build and deploy');
  run('pnpm', ['install', '--frozen-lockfile']);
  run('pnpm', ['build']);
  pulumi(['up', '--stack', 'prod']);

  step('Admin UI');
  const envPath = await writeAdminEnv();
  console.log(`Wrote ${envPath}. Start the UI with "pnpm admin" (http://127.0.0.1:5170).`);

  const o = stackOutputs(true) ?? {};
  step('Done');
  console.log(
    phoneSetupText({
      sipDomain: String(o.sipDomain),
      sipUsername: String(o.sipUsername),
      sipPassword: String(o.sipPassword),
      sipTransport: String(o.sipTransport),
      phoneNumber: number,
    }),
  );
  console.log('Test it: call the number from another phone; your app should ring.');
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    console.log('\nCancelled.');
    process.exit(130);
  }
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
