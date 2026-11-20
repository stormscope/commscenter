import { fail } from '@sveltejs/kit';
import { isAnonymous } from '@commscentral/shared';
import { client, readSettings, writeSettings } from '$lib/server/twilio';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const calls = await client().calls.list({ limit: 100 });
  return {
    calls: calls.map((c) => ({
      sid: c.sid,
      parent: c.parentCallSid,
      start: c.startTime?.toISOString() ?? null,
      from: c.from,
      to: c.to,
      direction: c.direction,
      status: c.status,
      duration: Number(c.duration ?? 0),
      price: c.price ? Math.abs(Number(c.price)) : null,
      unit: c.priceUnit,
    })),
  };
};

export const actions: Actions = {
  /** Add a caller to the blocked list. */
  block: async ({ request }) => {
    const number = String((await request.formData()).get('number') ?? '');
    if (!/^\+\d{6,15}$/.test(number) || isAnonymous(number)) {
      return fail(400, { error: 'Only real numbers can be blocked' });
    }
    const { settings } = await readSettings();
    if (!settings) return fail(500, { error: 'Stored settings are invalid' });
    if (!settings.screening.blocked.includes(number)) {
      settings.screening.blocked.push(number);
      await writeSettings(settings);
    }
    return { blocked: number };
  },
};
