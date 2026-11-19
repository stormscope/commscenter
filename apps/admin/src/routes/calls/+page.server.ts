import { client } from '$lib/server/twilio';
import type { PageServerLoad } from './$types';

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
