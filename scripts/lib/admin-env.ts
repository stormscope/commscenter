import twilio from 'twilio';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, getConfig, readLocalState, stackOutputs, writeLocalState } from './pulumi.js';

/**
 * Write apps/admin/.env from the stack outputs. Creates a dedicated Twilio API key
 * for the admin UI (once), so the account auth token never sits in that file.
 */
export async function writeAdminEnv(): Promise<string> {
  const outputs = stackOutputs();
  if (!outputs) throw new Error('No deployed stack yet. Run "pnpm bootstrap" first.');
  const accountSid = getConfig('twilioAccountSid');
  const authToken = getConfig('twilioAuthToken');
  if (!accountSid || !authToken)
    throw new Error('Twilio credentials missing from the stack config.');

  const client = twilio(accountSid, authToken);
  const state = readLocalState();
  if (state.adminApiKeySid) {
    try {
      await client.keys(state.adminApiKeySid).remove();
    } catch {
      // already gone
    }
  }
  const key = await client.newKeys.create({ friendlyName: 'CommsCentral admin UI' });
  writeLocalState({ ...state, adminApiKeySid: key.sid });

  const env = {
    TWILIO_ACCOUNT_SID: accountSid,
    TWILIO_API_KEY: key.sid,
    TWILIO_API_SECRET: key.secret,
    SYNC_SERVICE_SID: String(outputs.syncServiceSid ?? ''),
    TWILIO_NUMBER: String(outputs.phoneNumber ?? ''),
    SIP_DOMAIN: String(outputs.sipDomain ?? ''),
    SIP_USERNAME: String(outputs.sipUsername ?? ''),
    FUNCTIONS_DOMAIN: String(outputs.functionsDomain ?? ''),
    ADMIN_HOST: '127.0.0.1',
    ADMIN_PORT: '5170',
  };
  const path = join(ROOT, 'apps', 'admin', '.env');
  writeFileSync(
    path,
    '# Written by `pnpm infra:env`. Do not commit.\n' +
      Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') +
      '\n',
    { mode: 0o600 },
  );
  return path;
}
