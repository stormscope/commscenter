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

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, e.g. 22:00');

const timeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Unknown time zone, use e.g. Europe/Zurich');

export const DEFAULT_QUIET_HOURS = {
  enabled: false,
  from: '22:00',
  to: '07:30',
  timeZone: 'Europe/Zurich',
};

export const DEFAULT_SCREENING = { blocked: [] as string[], anonymous: 'ring' as const };

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
      /** Also tell Fabian about calls that ended without an answer or a message. */
      missedCalls: z.boolean().default(true),
    }),
  }),
  /** Straight to voicemail in these hours (local time of `timeZone`, can wrap midnight). */
  quietHours: z
    .object({ enabled: z.boolean(), from: hhmm, to: hhmm, timeZone })
    .default(DEFAULT_QUIET_HOURS),
  screening: z
    .object({
      /** E.164 numbers or prefixes (e.g. +4190) that are rejected with a busy signal. */
      blocked: z.array(z.string().regex(/^\+\d{2,15}$/, 'Use +41... format')).max(500),
      /** What to do with calls that hide their number. */
      anonymous: z.enum(['ring', 'voicemail', 'reject']),
    })
    .default(DEFAULT_SCREENING),
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
      notify: { email: input.notifyEmail, sms: false, missedCalls: true },
    },
    quietHours: DEFAULT_QUIET_HOURS,
    screening: DEFAULT_SCREENING,
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
