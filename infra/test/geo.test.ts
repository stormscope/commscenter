import { describe, expect, it } from 'vitest';
import { planGeoUpdates } from '../src/resources/geo';

describe('planGeoUpdates', () => {
  it('enables wanted countries and disables the rest in strict mode', () => {
    const updates = planGeoUpdates(['US', 'CA', 'CH'], ['CH', 'SE'], true);
    expect(updates.map((u) => [u.iso_code, u.low_risk_numbers_enabled])).toEqual([
      ['CA', 'false'],
      ['CH', 'true'],
      ['SE', 'true'],
      ['US', 'false'],
    ]);
    expect(updates.every((u) => u.high_risk_tollfraud_numbers_enabled === 'false')).toBe(true);
  });

  it('only enables in non-strict mode', () => {
    expect(planGeoUpdates(['US'], ['SE'], false).map((u) => u.iso_code)).toEqual(['SE']);
  });
});
