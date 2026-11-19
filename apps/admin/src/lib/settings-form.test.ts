import { defaultSettings } from '@commscentral/shared';
import { describe, expect, it } from 'vitest';
import { settingsFromForm } from './settings-form';

const current = defaultSettings({
  ownerMobile: '+41791234567',
  sipAddress: 'sip:me@cc.sip.twilio.com',
  notifyEmail: 'me@example.com',
  allowedPrefixes: ['+41'],
});

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const base = {
  mode: 'ring',
  ringApp: 'on',
  ringTimeoutSec: '30',
  outboundCallerId: 'mobile',
  greetingText: 'Hi',
  greetingLanguage: 'de-CH',
  greetingVoice: 'Polly.Marlene',
  maxLengthSec: '90',
  notifyEmail: 'me@example.com',
  allowedPrefixes: '+41, +46 +90',
};

describe('settingsFromForm', () => {
  it('builds settings from the form', () => {
    const r = settingsFromForm(form(base), current);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.settings.outbound.allowedPrefixes).toEqual(['+41', '+46', '+90']);
    expect(r.settings.inbound.targets).toEqual([
      { kind: 'sip', address: 'sip:me@cc.sip.twilio.com', enabled: true },
    ]);
    expect(r.settings.voicemail.notify).toEqual({ email: 'me@example.com', sms: false });
  });

  it('adds the mobile SIM as a target when asked', () => {
    const r = settingsFromForm(form({ ...base, ringMobile: 'on' }), current);
    expect(r.ok && r.settings.inbound.targets[1]).toEqual({
      kind: 'pstn',
      address: '+41791234567',
      enabled: true,
    });
  });

  it('reports invalid fields', () => {
    const r = settingsFromForm(
      form({ ...base, ringTimeoutSec: '2', allowedPrefixes: '' }),
      current,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toMatch(/ringTimeoutSec/);
    expect(r.errors.join('\n')).toMatch(/allowedPrefixes/);
  });
});
