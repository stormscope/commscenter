import { describe, expect, it } from 'vitest';
import { handler } from '../src/functions/voice/call-status.js';
import { OWNER, run, settings } from './helpers.js';
import type { FunctionContext } from '../src/lib/types.js';

function ctx(opts: {
  legs?: Array<{ status: string; duration: string }>;
  recordings?: number;
  doc?: unknown;
}) {
  const messages: unknown[] = [];
  const context: FunctionContext = {
    getTwilioClient: () =>
      ({
        sync: {
          v1: {
            services: () => ({
              documents: () => ({
                fetch: async () => ({
                  data: opts.doc ?? settings((s) => (s.voicemail.notify.email = null)),
                }),
              }),
            }),
          },
        },
        calls: { list: async () => opts.legs ?? [] },
        recordings: { list: async () => Array.from({ length: opts.recordings ?? 0 }, () => ({})) },
        messages: { create: async (m: unknown) => (messages.push(m), {}) },
      }) as never,
    SYNC_SERVICE_SID: 'IS1',
    TWILIO_NUMBER: '+41445550000',
    OWNER_MOBILE: OWNER,
  };
  return { context, messages };
}

const ended = {
  CallSid: 'CA1',
  CallStatus: 'completed',
  Direction: 'inbound',
  From: '+41449999999',
};

describe('missed call notifications', () => {
  it('notifies when nobody answered and no message was left', async () => {
    const { context, messages } = ctx({ legs: [{ status: 'no-answer', duration: '0' }] });
    expect(await run(handler, context, ended)).toEqual({ result: 'notified' });
    expect(messages[0]).toMatchObject({
      body: expect.stringContaining('Missed call from +41449999999'),
    });
  });

  it('stays quiet when the call was answered', async () => {
    const { context, messages } = ctx({ legs: [{ status: 'completed', duration: '42' }] });
    expect(await run(handler, context, ended)).toEqual({ result: 'answered' });
    expect(messages).toHaveLength(0);
  });

  it('stays quiet when a voicemail was left (that has its own notification)', async () => {
    const { context } = ctx({ recordings: 1 });
    expect(await run(handler, context, ended)).toEqual({ result: 'voicemail' });
  });

  it('ignores non-final updates, the owner, blocked callers and the disabled setting', async () => {
    expect(await run(handler, ctx({}).context, { ...ended, CallStatus: 'ringing' })).toEqual({
      result: 'not final',
    });
    expect(await run(handler, ctx({}).context, { ...ended, From: OWNER })).toEqual({
      result: 'owner',
    });
    const blocked = settings((s) => (s.screening.blocked = ['+4144']));
    expect(await run(handler, ctx({ doc: blocked }).context, ended)).toEqual({ result: 'blocked' });
    const off = settings((s) => (s.voicemail.notify.missedCalls = false));
    expect(await run(handler, ctx({ doc: off }).context, ended)).toEqual({ result: 'disabled' });
  });
});
