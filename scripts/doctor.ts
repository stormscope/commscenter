/**
 * pnpm doctor
 *
 * Checks the deployed setup end to end against the Twilio API and prints what is
 * wrong and how to fix it. Read-only: it never changes anything.
 */
import twilio from 'twilio';
import { isoCodesForPrefixes, parseSettings, type Settings } from '@commscentral/shared';
import { getConfig, selectStack, stackOutputs } from './lib/pulumi.js';

type Level = 'ok' | 'warn' | 'fail';
const marks: Record<Level, string> = { ok: '✓', warn: '!', fail: '✗' };
const counts: Record<Level, number> = { ok: 0, warn: 0, fail: 0 };

function report(level: Level, text: string, hint?: string) {
  counts[level]++;
  console.log(`${marks[level]} ${text}`);
  if (hint && level !== 'ok') console.log(`    ${hint}`);
}

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    report('fail', `${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

selectStack();
const outputs = stackOutputs();
const accountSid = getConfig('twilioAccountSid');
const authToken = getConfig('twilioAuthToken');
if (!outputs || !accountSid || !authToken) {
  console.error('Nothing deployed yet. Run "pnpm bootstrap" first.');
  process.exit(1);
}
const client = twilio(accountSid, authToken);
const domain = String(outputs.functionsDomain ?? '');
const base = `https://${domain}`;
const number = String(outputs.phoneNumber ?? '');
const sipDomain = String(outputs.sipDomain ?? '');
let settings: Settings | null = null;

await check('Account', async () => {
  const account = await client.api.v2010.accounts(accountSid).fetch();
  if (account.status !== 'active') report('fail', `Account is ${account.status}`);
  else if (account.type === 'Trial')
    report(
      'warn',
      'Account is a trial account',
      'Upgrade it in the Twilio console; trials can only call verified numbers.',
    );
  else report('ok', `Account "${account.friendlyName}" is active`);
  const balance = await client.balance.fetch();
  const amount = Number(balance.balance);
  report(
    amount < 5 ? 'warn' : 'ok',
    `Balance ${amount.toFixed(2)} ${balance.currency}`,
    'Top up or enable auto-recharge in the console.',
  );
});

await check('Functions', async () => {
  // Protected functions answer 401/403 to unsigned requests: proves they are deployed and locked.
  const res = await fetch(`${base}/voice/inbound`, { method: 'POST' });
  if (res.status === 401 || res.status === 403)
    report('ok', `Functions deployed and protected (${domain})`);
  else if (res.status === 404) report('fail', 'Functions not found', 'Run "pnpm infra:up".');
  else
    report(
      'warn',
      `/voice/inbound answered ${res.status} to an unsigned request`,
      'It should be 401: check the function is "protected".',
    );
});

await check('Phone number', async () => {
  const [n] = await client.incomingPhoneNumbers.list({ phoneNumber: number, limit: 1 });
  if (!n) return report('fail', `${number} is not in this account`, 'Run "pnpm bootstrap".');
  const expected = `${base}/voice/inbound`;
  if (n.voiceUrl === expected) report('ok', `${number} rings CommsCentral`);
  else
    report(
      'fail',
      `${number} voice URL is "${n.voiceUrl}"`,
      `Expected ${expected}. Run "pnpm infra:up".`,
    );
  if (n.statusCallback !== `${base}/voice/call-status`)
    report('warn', 'Missed-call notifications are not wired up', 'Run "pnpm infra:up".');
});

await check('SIP domain', async () => {
  const [d] = await client.sip.domains
    .list({ limit: 50 })
    .then((all) => all.filter((x) => x.domainName === sipDomain));
  if (!d) return report('fail', `SIP domain ${sipDomain} not found`, 'Run "pnpm infra:up".');
  const problems: string[] = [];
  if (d.voiceUrl !== `${base}/sip/outbound`) problems.push(`voice URL is ${d.voiceUrl}`);
  if (!d.sipRegistration) problems.push('registration is off');
  const auth = client.sip.domains(d.sid).auth;
  if ((await auth.calls.credentialListMappings.list()).length === 0)
    problems.push('no credentials for calls');
  if ((await auth.registrations.credentialListMappings.list()).length === 0)
    problems.push('no credentials for registration');
  if (problems.length) report('fail', `SIP domain: ${problems.join(', ')}`, 'Run "pnpm infra:up".');
  else report('ok', `SIP domain ${sipDomain} ready (secure: ${d.secure})`);
});

await check('Settings', async () => {
  const doc = await client.sync.v1
    .services(String(outputs.syncServiceSid))
    .documents('settings')
    .fetch();
  settings = parseSettings(doc.data);
  if (!settings)
    report(
      'fail',
      'Settings document is invalid; calls use fallback settings',
      'Save the settings once in the admin UI.',
    );
  else
    report(
      'ok',
      `Settings valid (incoming: ${settings.inbound.mode}, ring ${settings.inbound.ringTimeoutSec} s)`,
    );
});

await check('Caller ID', async () => {
  if (!settings) return;
  if (settings.owner.outboundCallerId !== 'mobile')
    return report('ok', 'Outbound calls show the CommsCentral number');
  const verified = await client.outgoingCallerIds.list({
    phoneNumber: settings.owner.mobile,
    limit: 1,
  });
  if (verified.length)
    report('ok', `Outbound calls show your mobile ${settings.owner.mobile} (verified)`);
  else
    report(
      'fail',
      `${settings.owner.mobile} is not a verified caller ID; outbound calls will fail`,
      'Re-run "pnpm bootstrap" to verify it, or switch caller ID in the admin UI.',
    );
});

await check('Geo permissions', async () => {
  const enabled = (
    await client.voice.v1.dialingPermissions.countries.list({ lowRiskNumbersEnabled: true })
  ).map((c) => c.isoCode);
  const prefixes =
    settings?.outbound.allowedPrefixes ?? JSON.parse(getConfig('allowedPrefixes') ?? '["+41"]');
  const wanted = isoCodesForPrefixes(prefixes);
  const missing = wanted.filter((iso) => !enabled.includes(iso));
  const extra = enabled.filter((iso) => !wanted.includes(iso));
  if (missing.length)
    report(
      'fail',
      `Calls to ${missing.join(', ')} are allowed in settings but blocked by Twilio`,
      'Add the country in "pnpm bootstrap".',
    );
  else report('ok', `Twilio allows calls to ${wanted.join(', ')}`);
  if (extra.length)
    report(
      'warn',
      `Twilio also allows ${extra.join(', ')}`,
      'Run "pnpm infra:up" with geoStrict to close them.',
    );
});

await check('Spend alerts', async () => {
  const triggers = (await client.usage.triggers.list({ limit: 50 })).filter((t) =>
    t.callbackUrl.startsWith(`${base}/alerts/usage`),
  );
  if (triggers.length)
    report('ok', `Spend alerts at ${triggers.map((t) => `${t.triggerValue} USD`).join(', ')}`);
  else report('warn', 'No spend alerts', 'Run "pnpm infra:up".');
});

await check('Notifications', async () => {
  const email = settings?.voicemail.notify.email;
  const key = getConfig('resendApiKey');
  if (!email) return report('ok', 'Voicemails are sent by SMS (no email set)');
  if (!key)
    return report(
      'fail',
      `Email ${email} is set but there is no Resend API key`,
      'Add it with "pnpm bootstrap".',
    );
  const res = await fetch('https://api.resend.com/api-keys', {
    headers: { Authorization: `Bearer ${key}` },
  });
  // Sending-only keys can't list keys (401 with a specific message) but are still valid.
  const body = res.ok ? '' : await res.text();
  if (res.ok || /restricted/i.test(body)) report('ok', `Voicemails are emailed to ${email}`);
  else
    report(
      'fail',
      `Resend rejected the API key (${res.status})`,
      'Create a new key at https://resend.com/api-keys and re-run "pnpm bootstrap".',
    );
});

await check('Recent errors', async () => {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const alerts = await client.monitor.v1.alerts.list({ startDate: since, limit: 20 });
  const errors = alerts.filter((a) => a.logLevel === 'error');
  if (!errors.length) return report('ok', 'No Twilio errors in the last 24 hours');
  report('warn', `${errors.length} Twilio error(s) in the last 24 hours:`);
  for (const a of errors.slice(0, 5)) {
    console.log(
      `    ${a.dateCreated.toISOString()}  ${a.errorCode}  ${a.alertText?.slice(0, 120) ?? ''}`,
    );
    console.log(`      https://www.twilio.com/docs/errors/${a.errorCode}`);
  }
});

console.log(`\n${counts.ok} ok, ${counts.warn} warning(s), ${counts.fail} problem(s).`);
process.exit(counts.fail ? 1 : 0);
