import { settingsSchema, type Settings } from '@commscentral/shared';

/** Turn the flat settings form into a Settings object. Returns field errors on failure. */
export function settingsFromForm(
  form: FormData,
  current: Settings,
): { ok: true; settings: Settings } | { ok: false; errors: string[] } {
  const str = (k: string) => String(form.get(k) ?? '').trim();
  const on = (k: string) => form.get(k) === 'on';
  const num = (k: string) => Number(str(k));

  const sipTargets = current.inbound.targets.filter((t) => t.kind === 'sip');
  const targets = [
    ...sipTargets.map((t) => ({ ...t, enabled: on('ringApp') })),
    { kind: 'pstn' as const, address: current.owner.mobile, enabled: on('ringMobile') },
  ].filter((t) => t.kind === 'sip' || t.enabled);

  const candidate = {
    version: 1,
    owner: {
      mobile: current.owner.mobile,
      outboundCallerId: str('outboundCallerId'),
    },
    inbound: {
      mode: str('mode'),
      targets,
      ringTimeoutSec: num('ringTimeoutSec'),
    },
    voicemail: {
      greeting: {
        kind: 'tts',
        text: str('greetingText'),
        language: str('greetingLanguage'),
        voice: str('greetingVoice'),
      },
      maxLengthSec: num('maxLengthSec'),
      notify: {
        email: str('notifyEmail') || null,
        sms: on('notifySms'),
        missedCalls: on('notifyMissed'),
      },
    },
    quietHours: {
      enabled: on('quietEnabled'),
      from: str('quietFrom'),
      to: str('quietTo'),
      timeZone: str('quietTimeZone'),
    },
    screening: {
      blocked: str('blocked')
        .split(/[\n,]+/)
        .map((n) => n.replace(/[\s.\-()/]/g, ''))
        .filter(Boolean),
      anonymous: str('anonymous'),
    },
    outbound: {
      allowedPrefixes: str('allowedPrefixes')
        .split(/[,\s]+/)
        .map((p) => p.trim())
        .filter(Boolean),
    },
  };

  const result = settingsSchema.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  return { ok: true, settings: result.data };
}
