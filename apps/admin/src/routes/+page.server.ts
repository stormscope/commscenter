import { client, info, readSettings } from '$lib/server/twilio';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const c = client();
  const [settingsResult, usage, recordings, calls] = await Promise.allSettled([
    readSettings(),
    c.usage.records.thisMonth.list({ category: 'totalprice', limit: 1 }),
    c.recordings.list({ limit: 20 }),
    c.calls.list({ limit: 10 }),
  ]);
  const today = new Date().toDateString();
  return {
    info: info(),
    settings: settingsResult.status === 'fulfilled' ? settingsResult.value.settings : null,
    settingsError: settingsResult.status === 'rejected' ? String(settingsResult.reason) : null,
    spend:
      usage.status === 'fulfilled' && usage.value[0]
        ? { amount: Number(usage.value[0].price), unit: usage.value[0].priceUnit }
        : null,
    voicemailsToday:
      recordings.status === 'fulfilled'
        ? recordings.value.filter((r) => r.dateCreated.toDateString() === today).length
        : null,
    recentCalls:
      calls.status === 'fulfilled'
        ? calls.value.map((call) => ({
            sid: call.sid,
            from: call.from,
            to: call.to,
            status: call.status,
            start: call.startTime?.toISOString() ?? null,
          }))
        : [],
  };
};
