import { asyncHandler } from '../../lib/handler.js';
import { notifyOwner } from '../../lib/notify.js';
import { loadSettings } from '../../lib/settings.js';

/** Callback of a Twilio usage trigger (spend alert). */
export const handler = asyncHandler(async (context, event, callback) => {
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
