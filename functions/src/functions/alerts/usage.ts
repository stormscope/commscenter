import { asyncHandler } from '../../lib/handler.js';
import { tokenMatches } from '../../lib/token.js';
import { notifyOwner } from '../../lib/notify.js';
import { loadSettings } from '../../lib/settings.js';

/**
 * Callback of a Twilio usage trigger (spend alert). Public, so it checks the
 * `token` query parameter that Pulumi puts into the trigger's callback URL.
 */
export const handler = asyncHandler(async (context, event, callback) => {
  if (!tokenMatches(event.token, context.ALERTS_TOKEN)) {
    callback(null, { ignored: 'bad token' });
    return;
  }
  const settings = await loadSettings(context);
  const current = Number(event.CurrentValue ?? '0').toFixed(2);
  const threshold = event.TriggerValue ?? '?';
  const text = `CommsCentral spend this month has reached ${current} USD (alert at ${threshold} USD).`;
  const sent = await notifyOwner(
    context,
    settings,
    { subject: `CommsCentral spend alert: ${current} USD`, text },
    text,
  );
  callback(null, { sent });
});
