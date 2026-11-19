/**
 * Phone number helpers. Everything inside CommsCentral uses E.164 (+41791234567).
 */

export const DEFAULT_COUNTRY_CODE = '41';

/** Destinations that are never dialled, whatever the allow-list says (premium rate). */
export const BLOCKED_PREFIXES = ['+41900', '+41901', '+41906'] as const;

export type NormalizeResult =
  { ok: true; e164: string } | { ok: false; reason: 'empty' | 'short-number' | 'invalid' };

/**
 * Extract the dialled number from a SIP URI such as
 * `sip:0046701234567@commscentral.sip.twilio.com;user=phone`.
 * Returns the raw user part, or the input unchanged when it is not a SIP URI.
 */
export function userPartOfSipUri(value: string): string {
  const match = /^sips?:([^@;]+)@/i.exec(value.trim());
  return match?.[1] ? decodeURIComponent(match[1]) : value.trim();
}

/**
 * Normalize whatever a person typed into E.164.
 *
 * - `+46 70 123 45 67`  -> +46701234567
 * - `0046701234567`     -> +46701234567
 * - `079 123 45 67`     -> +41791234567 (national format, default country)
 * - `112`, `1818`       -> short-number (emergency and service numbers belong on the mobile network)
 */
export function normalizeNumber(
  raw: string,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE,
): NormalizeResult {
  const trimmed = userPartOfSipUri(raw);
  if (!trimmed) return { ok: false, reason: 'empty' };

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return { ok: false, reason: 'empty' };

  let international: string;
  if (hasPlus) {
    international = digits;
  } else if (digits.startsWith('00')) {
    international = digits.slice(2);
  } else if (digits.startsWith('0')) {
    international = defaultCountryCode + digits.slice(1);
  } else if (digits.length <= 6) {
    return { ok: false, reason: 'short-number' };
  } else {
    // Bare digits without a prefix: treat as already international (e.g. 41791234567).
    international = digits;
  }

  if (!/^[1-9]\d{7,14}$/.test(international)) return { ok: false, reason: 'invalid' };
  return { ok: true, e164: `+${international}` };
}

export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export type DestinationCheck =
  { allowed: true } | { allowed: false; reason: 'blocked-premium' | 'country-not-allowed' };

export function checkDestination(
  e164: string,
  allowedPrefixes: readonly string[],
): DestinationCheck {
  if (BLOCKED_PREFIXES.some((p) => e164.startsWith(p))) {
    return { allowed: false, reason: 'blocked-premium' };
  }
  if (!allowedPrefixes.some((p) => e164.startsWith(p))) {
    return { allowed: false, reason: 'country-not-allowed' };
  }
  return { allowed: true };
}

/**
 * Map from dialling prefix to ISO country code, for the countries most likely
 * to be used. Used to keep Twilio voice geo permissions in sync with the allow-list.
 */
export const PREFIX_TO_ISO: Record<string, string> = {
  '+41': 'CH',
  '+423': 'LI',
  '+46': 'SE',
  '+90': 'TR',
  '+49': 'DE',
  '+43': 'AT',
  '+33': 'FR',
  '+39': 'IT',
  '+44': 'GB',
  '+45': 'DK',
  '+47': 'NO',
  '+358': 'FI',
  '+31': 'NL',
  '+32': 'BE',
  '+34': 'ES',
  '+351': 'PT',
  '+1': 'US',
};

export function isoCodesForPrefixes(prefixes: readonly string[]): string[] {
  const iso = new Set<string>();
  for (const p of prefixes) {
    const code = PREFIX_TO_ISO[p];
    if (code) iso.add(code);
  }
  return [...iso].sort();
}
