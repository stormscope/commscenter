import { defaultSettings, type Settings } from '@commscentral/shared';
import type { FunctionContext } from '../src/lib/types.js';

export const OWNER = '+41791234567';
export const NUMBER = '+41445550000';
export const SIP = 'sip:me@commscentral-test.sip.twilio.com';

export function settings(overrides: (s: Settings) => void = () => {}): Settings {
  const s = defaultSettings({
    ownerMobile: OWNER,
    sipAddress: SIP,
    notifyEmail: 'me@example.com',
    allowedPrefixes: ['+41', '+46'],
  });
  overrides(s);
  return s;
}

export function fakeContext(opts: {
  doc?: unknown;
  fetchFails?: boolean;
  env?: Partial<FunctionContext>;
  messages?: unknown[];
  call?: Record<string, unknown>;
}): FunctionContext {
  const client = {
    sync: {
      v1: {
        services: () => ({
          documents: () => ({
            fetch: async () => {
              if (opts.fetchFails) throw new Error('boom');
              return { data: opts.doc };
            },
          }),
        }),
      },
    },
    messages: {
      create: async (m: unknown) => {
        opts.messages?.push(m);
        return {};
      },
    },
    calls: () => ({
      fetch: async () => opts.call ?? { from: '+46701234567', forwardedFrom: null },
    }),
  };
  return {
    getTwilioClient: () => client as never,
    SYNC_SERVICE_SID: 'IS123',
    TWILIO_NUMBER: NUMBER,
    OWNER_MOBILE: OWNER,
    SIP_ADDRESS: SIP,
    ALLOWED_PREFIXES: '+41,+46',
    ...opts.env,
  };
}

export function run(
  handler: (
    c: FunctionContext,
    e: Record<string, string>,
    cb: (err: unknown, r?: unknown) => void,
  ) => unknown,
  context: FunctionContext,
  event: Record<string, string>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    void handler(context, event, (err, res) => (err ? reject(err) : resolve(res)));
  });
}
