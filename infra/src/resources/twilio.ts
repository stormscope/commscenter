import type { Twilio } from 'twilio';

/** Credentials passed to every dynamic resource. Stored encrypted in Pulumi state. */
export interface TwilioCreds {
  accountSid: string;
  authToken: string;
}

/**
 * Create a Twilio client. Called inside dynamic provider methods, so the module is
 * required at run time rather than captured by Pulumi's closure serialization.
 */
export function twilioClient(creds: TwilioCreds): Twilio {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require('twilio') as typeof import('twilio');
  return twilio(creds.accountSid, creds.authToken);
}

/**
 * Shallow compare of inputs, ignoring the given keys (always pass 'creds': a rotated
 * auth token must not trigger an update). Returns the names of changed keys.
 * Keep this free of module-level references: Pulumi serializes it into the state.
 */
export function changedKeys(
  oldInputs: object,
  newInputs: object,
  ignore: readonly string[],
): string[] {
  const olds = oldInputs as Record<string, unknown>;
  const news = newInputs as Record<string, unknown>;
  const keys = new Set([...Object.keys(olds), ...Object.keys(news)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (ignore.includes(key) || key === '__provider') continue;
    if (JSON.stringify(olds[key]) !== JSON.stringify(news[key])) changed.push(key);
  }
  return changed;
}
