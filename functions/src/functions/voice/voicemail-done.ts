import { asyncHandler } from '../../lib/handler.js';
import { downloadRecording, formatDuration, notifyOwner } from '../../lib/notify.js';
import { loadSettings } from '../../lib/settings.js';

/** Recording status callback: tell Fabian about the new voicemail. */
export const handler = asyncHandler(async (context, event, callback) => {
  if (event.RecordingStatus && event.RecordingStatus !== 'completed') {
    callback(null, { ignored: event.RecordingStatus });
    return;
  }
  const settings = await loadSettings(context);
  const duration = Number(event.RecordingDuration ?? '0');

  let caller = 'unknown caller';
  let forwardedFrom: string | undefined;
  if (event.CallSid) {
    try {
      const call = await context.getTwilioClient().calls(event.CallSid).fetch();
      caller = call.from || caller;
      forwardedFrom = call.forwardedFrom || undefined;
    } catch (error) {
      console.error('Could not fetch call details', error);
    }
  }

  const audio = event.RecordingUrl ? await downloadRecording(context, event.RecordingUrl) : null;
  const when = new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' });
  const lines = [
    `New voicemail from ${caller}`,
    `Length: ${formatDuration(duration)}`,
    `Received: ${when} (Zurich time)`,
    forwardedFrom ? `Forwarded from: ${forwardedFrom}` : null,
    event.RecordingSid ? `Recording: ${event.RecordingSid}` : null,
    audio ? 'The recording is attached.' : 'Open the admin UI to play the recording.',
  ].filter(Boolean);

  const sent = await notifyOwner(
    context,
    settings,
    {
      subject: `Voicemail from ${caller} (${formatDuration(duration)})`,
      text: lines.join('\n'),
      attachments: audio
        ? [{ filename: `voicemail-${event.RecordingSid ?? 'recording'}.mp3`, content: audio }]
        : undefined,
    },
    `CommsCentral: voicemail from ${caller}, ${formatDuration(duration)}`,
  );
  callback(null, { sent });
});
