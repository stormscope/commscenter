import { env } from '$env/dynamic/private';
import { parseSettings, type Settings } from '@commscentral/shared';
import twilio from 'twilio';

function required(name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set. Run "pnpm infra:env".`);
  return value;
}

let cached: ReturnType<typeof twilio> | undefined;

export function client() {
  cached ??= twilio(required('TWILIO_API_KEY'), required('TWILIO_API_SECRET'), {
    accountSid: required('TWILIO_ACCOUNT_SID'),
  });
  return cached;
}

export const info = () => ({
  number: env.TWILIO_NUMBER ?? '',
  sipDomain: env.SIP_DOMAIN ?? '',
  sipUsername: env.SIP_USERNAME ?? '',
  functionsDomain: env.FUNCTIONS_DOMAIN ?? '',
});

const settingsDoc = () =>
  client().sync.v1.services(required('SYNC_SERVICE_SID')).documents('settings');

export async function readSettings(): Promise<{ settings: Settings | null; raw: unknown }> {
  const doc = await settingsDoc().fetch();
  return { settings: parseSettings(doc.data), raw: doc.data };
}

export async function writeSettings(settings: Settings): Promise<void> {
  await settingsDoc().update({ data: settings });
}

/** Authenticated download of a recording, for playback in the browser. */
export async function fetchRecordingMp3(sid: string): Promise<Response> {
  if (!/^RE[0-9a-f]{32}$/.test(sid)) return new Response('Not found', { status: 404 });
  const auth = Buffer.from(
    `${required('TWILIO_API_KEY')}:${required('TWILIO_API_SECRET')}`,
  ).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${required('TWILIO_ACCOUNT_SID')}/Recordings/${sid}.mp3`;
  return fetch(url, { headers: { Authorization: `Basic ${auth}` } });
}
