import { isBlocked } from '@commscentral/shared';
import { asyncHandler } from '../../lib/handler.js';
import { notifyOwner } from '../../lib/notify.js';
import { loadSettings } from '../../lib/settings.js';

const FINAL = new Set(['completed', 'busy', 'no-answer', 'canceled', 'failed']);

/**
 * Status callback of the CommsCentral number. When an inbound call ends without
 * being answered and without a voicemail (the caller hung up while it rang or
 * during the greeting), tell Fabian about the missed call.
 */
export const handler = asyncHandler(async (context, event, callback) => {
  const done = (result: string) => callback(null, { result });
  if (!event.CallSid || !event.CallStatus || !FINAL.has(event.CallStatus)) return done('not final');
  if (event.Direction && event.Direction !== 'inbound') return done('not inbound');

  const settings = await loadSettings(context);
  if (!settings.voicemail.notify.missedCalls) return done('disabled');
  if (event.From === settings.owner.mobile) return done('owner');
  if (isBlocked(event.From, settings.screening.blocked)) return done('blocked');

  const client = context.getTwilioClient();
  const legs = await client.calls.list({ parentCallSid: event.CallSid, limit: 20 });
  if (legs.some((leg) => leg.status === 'completed' && Number(leg.duration ?? 0) > 0)) {
    return done('answered');
  }
  const recordings = await client.recordings.list({ callSid: event.CallSid, limit: 1 });
  if (recordings.length > 0) return done('voicemail');

  const caller = event.From || 'a hidden number';
  const when = new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' });
  const via = event.ForwardedFrom ? ' (forwarded from your mobile)' : '';
  const text = `Missed call from ${caller}${via} at ${when} (Zurich time). No message was left.`;
  await notifyOwner(
    context,
    settings,
    { subject: `Missed call from ${caller}`, text },
    `CommsCentral: ${text}`,
  );
  return done('notified');
});
