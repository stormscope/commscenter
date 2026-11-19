import { describe, expect, it } from 'vitest';
import {
  checkDestination,
  isoCodesForPrefixes,
  normalizeNumber,
  userPartOfSipUri,
} from '../src/phone.js';

describe('normalizeNumber', () => {
  it.each([
    ['+46 70 123 45 67', '+46701234567'],
    ['0046701234567', '+46701234567'],
    ['079 123 45 67', '+41791234567'],
    ['044-123.45.67', '+41441234567'],
    ['41791234567', '+41791234567'],
    ['sip:0046701234567@cc.sip.twilio.com;user=phone', '+46701234567'],
    ['sip:%2B41791234567@cc.sip.twilio.com', '+41791234567'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeNumber(input)).toEqual({ ok: true, e164: expected });
  });

  it('rejects short and emergency numbers', () => {
    expect(normalizeNumber('112')).toEqual({ ok: false, reason: 'short-number' });
    expect(normalizeNumber('sip:1818@cc.sip.twilio.com')).toEqual({
      ok: false,
      reason: 'short-number',
    });
  });

  it('rejects empty and malformed input', () => {
    expect(normalizeNumber('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeNumber('+0123456789')).toEqual({ ok: false, reason: 'invalid' });
    expect(normalizeNumber('+1234567890123456')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('uses the given default country', () => {
    expect(normalizeNumber('0701234567', '46')).toEqual({ ok: true, e164: '+46701234567' });
  });
});

describe('userPartOfSipUri', () => {
  it('returns non-SIP values unchanged', () => {
    expect(userPartOfSipUri(' +41791234567 ')).toBe('+41791234567');
  });
});

describe('checkDestination', () => {
  const allowed = ['+41', '+46'];
  it('allows listed prefixes', () => {
    expect(checkDestination('+46701234567', allowed)).toEqual({ allowed: true });
  });
  it('refuses other countries', () => {
    expect(checkDestination('+905321234567', allowed)).toEqual({
      allowed: false,
      reason: 'country-not-allowed',
    });
  });
  it('always refuses Swiss premium-rate numbers', () => {
    expect(checkDestination('+41900123456', allowed)).toEqual({
      allowed: false,
      reason: 'blocked-premium',
    });
  });
});

describe('isoCodesForPrefixes', () => {
  it('maps and deduplicates', () => {
    expect(isoCodesForPrefixes(['+46', '+41', '+41', '+999'])).toEqual(['CH', 'SE']);
  });
});
