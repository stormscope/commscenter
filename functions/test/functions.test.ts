import { describe, expect, it, vi } from 'vitest';
import { handler as inboundHandler } from '../src/functions/voice/inbound.js';
import { handler as voicemailDone } from '../src/functions/voice/voicemail-done.js';
import { handler as usage } from '../src/functions/alerts/usage.js';
import { loadSettings } from '../src/lib/settings.js';
import { OWNER, SIP, fakeContext, run, settings } from './helpers.js';

describe('loadSettings', () => {
  it('uses the Sync document when valid', async () => {
    const doc = settings((s) => (s.inbound.ringTimeoutSec = 40));
    const s = await loadSettings(fakeContext({ doc }));
    expect(s.inbound.ringTimeoutSec).toBe(40);
  });

  it('falls back to env when Sync fails', async () => {
    const s = await loadSettings(fakeContext({ fetchFails: true }));
    expect(s.inbound.targets[0]?.address).toBe(SIP);
    expect(s.outbound.allowedPrefixes).toEqual(['+41', '+46']);
  });

  it('falls back to env when the document is invalid', async () => {
    const s = await loadSettings(fakeContext({ doc: { version: 99 } }));
    expect(s.owner.mobile).toBe(OWNER);
  });
});

describe('usage alert token', () => {
  it('ignores calls without the right token', async () => {
    const messages: unknown[] = [];
    const ctx = fakeContext({ doc: settings(), messages, env: { ALERTS_TOKEN: 'secret-token' } });
    expect(await run(usage, ctx, { CurrentValue: '99', token: 'nope' })).toEqual({
      ignored: 'bad token',
    });
    expect(await run(usage, ctx, { CurrentValue: '99' })).toEqual({ ignored: 'bad token' });
    expect(messages).toHaveLength(0);
  });
});

describe('handlers', () => {
  it('inbound returns TwiML', async () => {
    const res = await run(inboundHandler, fakeContext({ doc: settings() }), {
      From: '+41449999999',
    });
    expect(String(res)).toContain('<Sip>');
  });

  it('voicemail-done emails the recording via Resend', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      if (String(url).endsWith('.mp3')) return new Response(new Uint8Array([1, 2, 3]));
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const messages: unknown[] = [];
      const ctx = fakeContext({
        doc: settings(),
        messages,
        env: { RESEND_API_KEY: 're_test', ACCOUNT_SID: 'AC1', AUTH_TOKEN: 'tok' },
      });
      const res = await run(voicemailDone, ctx, {
        RecordingStatus: 'completed',
        RecordingDuration: '42',
        RecordingUrl: 'https://api.twilio.com/rec/RE1',
        RecordingSid: 'RE1',
        CallSid: 'CA1',
      });
      expect(res).toEqual({ sent: { email: true, sms: false } });
      const resendCall = fetchMock.mock.calls.find(([u]) => String(u).includes('resend'));
      const body = JSON.parse(String(resendCall?.[1]?.body));
      expect(body.subject).toBe('Voicemail from +46701234567 (0:42)');
      expect(body.attachments[0].filename).toBe('voicemail-RE1.mp3');
      expect(messages).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to SMS when no email is configured', async () => {
    const messages: unknown[] = [];
    const ctx = fakeContext({ doc: settings((s) => (s.voicemail.notify.email = null)), messages });
    ctx.ALERTS_TOKEN = 'secret-token';
    const res = await run(usage, ctx, {
      CurrentValue: '21.5',
      TriggerValue: '20',
      token: 'secret-token',
    });
    expect(res).toEqual({ sent: { email: false, sms: true } });
    expect(messages[0]).toMatchObject({ to: OWNER, body: expect.stringContaining('21.50 USD') });
  });
});
