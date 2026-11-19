import type { Settings } from '@commscentral/shared';
import type { FunctionContext } from './types.js';

export interface EmailAttachment {
  filename: string;
  /** base64 encoded content */
  content: string;
}

export interface Notification {
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail(
  apiKey: string,
  message: { from: string; to: string } & Notification,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      attachments: message.attachments,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
  }
}

/**
 * Send a notification by every configured channel. Failures are logged, not thrown,
 * so one broken channel never blocks the other.
 */
export async function notifyOwner(
  context: FunctionContext,
  settings: Settings,
  notification: Notification,
  smsText: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ email: boolean; sms: boolean }> {
  const sent = { email: false, sms: false };
  const email = settings.voicemail.notify.email;

  if (email && context.RESEND_API_KEY) {
    try {
      await sendEmail(
        context.RESEND_API_KEY,
        {
          from: context.EMAIL_FROM || 'CommsCentral <onboarding@resend.dev>',
          to: email,
          ...notification,
        },
        fetchImpl,
      );
      sent.email = true;
    } catch (error) {
      console.error('Email notification failed', error);
    }
  }

  const wantSms = settings.voicemail.notify.sms || !sent.email;
  if (wantSms && context.TWILIO_NUMBER) {
    try {
      await context.getTwilioClient().messages.create({
        from: context.TWILIO_NUMBER,
        to: settings.owner.mobile,
        body: smsText,
      });
      sent.sms = true;
    } catch (error) {
      console.error('SMS notification failed', error);
    }
  }
  return sent;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Download a recording as MP3 using the account credentials. */
export async function downloadRecording(
  context: FunctionContext,
  recordingUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!context.ACCOUNT_SID || !context.AUTH_TOKEN) return null;
  const auth = Buffer.from(`${context.ACCOUNT_SID}:${context.AUTH_TOKEN}`).toString('base64');
  const res = await fetchImpl(`${recordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}
