import { defaultSettings, parseSettings, type Settings } from '@commscentral/shared';
import type { FunctionContext } from './types.js';

export const SETTINGS_DOC = 'settings';

/** Settings derived from environment variables, used when Sync is unavailable or invalid. */
export function fallbackSettings(env: FunctionContext): Settings {
  return defaultSettings({
    ownerMobile: env.OWNER_MOBILE ?? '+41000000000',
    sipAddress: env.SIP_ADDRESS ?? 'sip:unset@unset.sip.twilio.com',
    notifyEmail: env.NOTIFY_EMAIL || null,
    allowedPrefixes: (env.ALLOWED_PREFIXES ?? '+41')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  });
}

/**
 * Load runtime settings from the Sync document. Never throws: a broken or
 * missing document falls back to the environment so calls still get handled.
 */
export async function loadSettings(context: FunctionContext): Promise<Settings> {
  if (context.SYNC_SERVICE_SID) {
    try {
      const doc = await context
        .getTwilioClient()
        .sync.v1.services(context.SYNC_SERVICE_SID)
        .documents(SETTINGS_DOC)
        .fetch();
      const parsed = parseSettings(doc.data);
      if (parsed) return parsed;
      console.error('Settings document is invalid, using fallback settings');
    } catch (error) {
      console.error('Could not load settings, using fallback settings', error);
    }
  }
  return fallbackSettings(context);
}
