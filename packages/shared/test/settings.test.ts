import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings, sipAddressFor } from '../src/settings.js';

const base = {
  ownerMobile: '+41791234567',
  sipAddress: sipAddressFor('me', 'commscentral-abc'),
  notifyEmail: 'me@example.com',
  allowedPrefixes: ['+41', '+46'],
};

describe('settings', () => {
  it('builds valid defaults', () => {
    const s = defaultSettings(base);
    expect(s.inbound.targets).toEqual([
      { kind: 'sip', address: 'sip:me@commscentral-abc.sip.twilio.com', enabled: true },
    ]);
    expect(s.owner.outboundCallerId).toBe('twilio');
    expect(parseSettings(s)).toEqual(s);
  });

  it('rejects invalid stored data', () => {
    const s = defaultSettings(base);
    expect(parseSettings({ ...s, owner: { ...s.owner, mobile: '0791234567' } })).toBeNull();
    expect(parseSettings(null)).toBeNull();
  });

  it('rejects bad defaults loudly', () => {
    expect(() => defaultSettings({ ...base, allowedPrefixes: [] })).toThrow();
  });
});
