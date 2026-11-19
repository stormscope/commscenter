import * as pulumi from '@pulumi/pulumi';
import type { Twilio } from 'twilio';
import { twilioClient, type TwilioCreds } from './twilio';

export interface GeoPermissionsInputs {
  creds: TwilioCreds;
  /** ISO codes of countries that may be called (low-risk numbers only). */
  isoCodes: string[];
  /** Also disable every other country that is currently enabled. */
  strict: boolean;
}

export interface CountryUpdate {
  iso_code: string;
  low_risk_numbers_enabled: 'true' | 'false';
  high_risk_special_numbers_enabled: 'false';
  high_risk_tollfraud_numbers_enabled: 'false';
}

/** Pure: the updates needed to go from the currently enabled set to the wanted set. */
export function planGeoUpdates(
  currentlyEnabled: readonly string[],
  wanted: readonly string[],
  strict: boolean,
): CountryUpdate[] {
  const updates = new Map<string, CountryUpdate>();
  const row = (iso: string, on: boolean): CountryUpdate => ({
    iso_code: iso,
    low_risk_numbers_enabled: on ? 'true' : 'false',
    high_risk_special_numbers_enabled: 'false',
    high_risk_tollfraud_numbers_enabled: 'false',
  });
  for (const iso of wanted) updates.set(iso, row(iso, true));
  if (strict) {
    for (const iso of currentlyEnabled)
      if (!wanted.includes(iso)) updates.set(iso, row(iso, false));
  }
  return [...updates.values()].sort((a, b) => a.iso_code.localeCompare(b.iso_code));
}

export async function applyGeoPermissions(client: Twilio, inputs: GeoPermissionsInputs) {
  const permissions = client.voice.v1.dialingPermissions;
  const enabled = inputs.strict
    ? (await permissions.countries.list({ lowRiskNumbersEnabled: true })).map((c) => c.isoCode)
    : [];
  const updates = planGeoUpdates(enabled, inputs.isoCodes, inputs.strict);
  // The API takes at most 100 countries per request.
  for (let i = 0; i < updates.length; i += 100) {
    await permissions.bulkCountryUpdates.create({
      updateRequest: JSON.stringify(updates.slice(i, i + 100)),
    });
  }
  return updates.length;
}

export const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: GeoPermissionsInputs) {
    await applyGeoPermissions(twilioClient(inputs.creds), inputs);
    return { id: 'voice-geo-permissions', outs: inputs };
  },
  async diff(id: string, olds: GeoPermissionsInputs, news: GeoPermissionsInputs) {
    const changes =
      JSON.stringify([...olds.isoCodes].sort()) !== JSON.stringify([...news.isoCodes].sort()) ||
      olds.strict !== news.strict;
    return { changes };
  },
  async update(id: string, olds: GeoPermissionsInputs, news: GeoPermissionsInputs) {
    await applyGeoPermissions(twilioClient(news.creds), news);
    return { outs: news };
  },
  async delete() {
    // Leave permissions as they are: opening up countries on destroy would be unsafe.
  },
};

/** Voice dialing geo permissions: only the countries CommsCentral needs. */
export class GeoPermissions extends pulumi.dynamic.Resource {
  constructor(
    name: string,
    args: { [K in keyof GeoPermissionsInputs]: pulumi.Input<GeoPermissionsInputs[K]> },
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(provider, name, args, opts);
  }
}
