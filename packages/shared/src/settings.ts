import { z } from 'zod';

const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +41791234567');
const prefix = z.string().regex(/^\+[1-9]\d{0,3}$/, 'Use a dialling prefix such as +46');

export const ringTargetSchema = z.object({
  kind: z.enum(['sip', 'pstn']),
  address: z.string().min(3),
  enabled: z.boolean(),
});

export const greetingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tts'),
    text: z.string().min(1).max(500),
    language: z.string().min(2),
    voice: z.string().min(1),
  }),
  z.object({ kind: z.literal('url'), url: z.url() }),
]);

export const settingsSchema = z.object({
  version: z.literal(1),
  owner: z.object({
    mobile: e164,
    outboundCallerId: z.enum(['mobile', 'twilio']),
  }),
  inbound: z.object({
    mode: z.enum(['ring', 'voicemail']),
    targets: z.array(ringTargetSchema).max(10),
    ringTimeoutSec: z.number().int().min(5).max(120),
  }),
  voicemail: z.object({
    greeting: greetingSchema,
    maxLengthSec: z.number().int().min(10).max(600),
    notify: z.object({
      email: z.email().nullable(),
      sms: z.boolean(),
    }),
  }),
  outbound: z.object({
    allowedPrefixes: z.array(prefix).min(1),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;
export type RingTarget = z.infer<typeof ringTargetSchema>;

export interface DefaultSettingsInput {
  ownerMobile: string;
  sipAddress: string;
  notifyEmail: string | null;
  allowedPrefixes: string[];
  outboundCallerId?: 'mobile' | 'twilio';
}

export function defaultSettings(input: DefaultSettingsInput): Settings {
  return settingsSchema.parse({
    version: 1,
    owner: { mobile: input.ownerMobile, outboundCallerId: input.outboundCallerId ?? 'twilio' },
    inbound: {
      mode: 'ring',
      targets: [{ kind: 'sip', address: input.sipAddress, enabled: true }],
      ringTimeoutSec: 25,
    },
    voicemail: {
      greeting: {
        kind: 'tts',
        text: 'Hello, you have reached Fabian. Please leave a message after the tone.',
        language: 'en-GB',
        voice: 'Polly.Amy',
      },
      maxLengthSec: 120,
      notify: { email: input.notifyEmail, sms: false },
    },
    outbound: { allowedPrefixes: input.allowedPrefixes },
  } satisfies Settings);
}

/** Parse settings from storage. Returns null when the stored value is not valid. */
export function parseSettings(value: unknown): Settings | null {
  const result = settingsSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** The SIP URI for a registered user on a Twilio SIP Domain. */
export function sipAddressFor(user: string, domainName: string): string {
  return `sip:${user}@${domainName}.sip.twilio.com`;
}
