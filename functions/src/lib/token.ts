import { timingSafeEqual } from 'node:crypto';

/** Constant-time comparison of a shared secret from a URL against the expected value. */
export function tokenMatches(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
