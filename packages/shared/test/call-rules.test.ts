import { describe, expect, it } from 'vitest';
import { isAnonymous, isBlocked, isQuietTime, localMinutes } from '../src/call-rules.js';
import { DEFAULT_QUIET_HOURS, parseSettings, defaultSettings } from '../src/settings.js';

const quiet = { ...DEFAULT_QUIET_HOURS, enabled: true }; // 22:00 to 07:30 Zurich

describe('quiet hours', () => {
  it('reads local time in the configured zone', () => {
    // 21:30 UTC in November is 22:30 in Zurich
    expect(localMinutes(new Date('2026-11-19T21:30:00Z'), 'Europe/Zurich')).toBe(22 * 60 + 30);
  });

  it.each([
    ['2026-11-19T21:30:00Z', true], // 22:30
    ['2026-11-19T05:00:00Z', true], // 06:00
    ['2026-11-19T06:30:00Z', false], // 07:30, end is exclusive
    ['2026-11-19T12:00:00Z', false], // 13:00
  ])('%s quiet=%s', (iso, expected) => {
    expect(isQuietTime(new Date(iso), quiet)).toBe(expected);
  });

  it('handles windows that do not wrap midnight', () => {
    const lunch = { ...quiet, from: '12:00', to: '13:00' };
    expect(isQuietTime(new Date('2026-11-19T11:30:00Z'), lunch)).toBe(true);
    expect(isQuietTime(new Date('2026-11-19T12:30:00Z'), lunch)).toBe(false);
  });

  it('follows the time zone when travelling', () => {
    // 20:00 UTC is 23:00 in Istanbul but 21:00 in Zurich
    const now = new Date('2026-11-19T20:00:00Z');
    expect(isQuietTime(now, { ...quiet, timeZone: 'Europe/Istanbul' })).toBe(true);
    expect(isQuietTime(now, quiet)).toBe(false);
  });

  it('is off when disabled or empty', () => {
    expect(isQuietTime(new Date('2026-11-19T21:30:00Z'), { ...quiet, enabled: false })).toBe(false);
    expect(isQuietTime(new Date(), { ...quiet, from: '10:00', to: '10:00' })).toBe(false);
  });
});

describe('screening helpers', () => {
  it.each(['anonymous', 'Restricted', '', undefined, '+266696687', '266696687'])(
    'treats %s as anonymous',
    (from) => expect(isAnonymous(from)).toBe(true),
  );
  it('treats real numbers as known', () => expect(isAnonymous('+41791234567')).toBe(false));

  it('matches blocked numbers and prefixes', () => {
    expect(isBlocked('+41900123456', ['+41900'])).toBe(true);
    expect(isBlocked('+41791234567', ['+41791234567'])).toBe(true);
    expect(isBlocked('+41791234568', ['+41791234567'])).toBe(false);
  });
});

describe('settings migration', () => {
  it('fills new fields into documents written before they existed', () => {
    const s = defaultSettings({
      ownerMobile: '+41791234567',
      sipAddress: 'sip:me@x.sip.twilio.com',
      notifyEmail: null,
      allowedPrefixes: ['+41'],
    });
    const old = JSON.parse(JSON.stringify(s));
    delete old.quietHours;
    delete old.screening;
    delete old.voicemail.notify.missedCalls;
    const parsed = parseSettings(old);
    expect(parsed?.quietHours.enabled).toBe(false);
    expect(parsed?.screening).toEqual({ blocked: [], anonymous: 'ring' });
    expect(parsed?.voicemail.notify.missedCalls).toBe(true);
  });

  it('rejects bad time zones and times', () => {
    const s = defaultSettings({
      ownerMobile: '+41791234567',
      sipAddress: 'sip:me@x.sip.twilio.com',
      notifyEmail: null,
      allowedPrefixes: ['+41'],
    });
    expect(
      parseSettings({ ...s, quietHours: { ...s.quietHours, timeZone: 'Mars/Base' } }),
    ).toBeNull();
    expect(parseSettings({ ...s, quietHours: { ...s.quietHours, from: '25:00' } })).toBeNull();
  });
});
