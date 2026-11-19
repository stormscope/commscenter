import type { Settings } from './settings.js';

/** Minutes since midnight of `now` in the given IANA time zone. */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return get('hour') * 60 + get('minute');
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** True when `now` falls in the quiet hours window. Windows may wrap midnight (22:00 to 07:30). */
export function isQuietTime(now: Date, quiet: Settings['quietHours']): boolean {
  if (!quiet.enabled) return false;
  const from = toMinutes(quiet.from);
  const to = toMinutes(quiet.to);
  if (from === to) return false;
  const t = localMinutes(now, quiet.timeZone);
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/**
 * Twilio reports hidden numbers as text ("anonymous", "Restricted", "Unknown") or
 * as one of a few fixed placeholder numbers.
 */
const ANONYMOUS_PLACEHOLDERS = new Set(['+266696687', '+7378742833', '+2562533', '+8656696']);

export function isAnonymous(from: string | undefined): boolean {
  if (!from) return true;
  const value = from.trim();
  if (!/^\+?\d+$/.test(value)) return true;
  return ANONYMOUS_PLACEHOLDERS.has(value.startsWith('+') ? value : `+${value}`);
}

/** True when the caller matches a blocked number or prefix. */
export function isBlocked(from: string | undefined, blocked: readonly string[]): boolean {
  if (!from) return false;
  return blocked.some((entry) => from === entry || from.startsWith(entry));
}
