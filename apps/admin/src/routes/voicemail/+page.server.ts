import { fail } from '@sveltejs/kit';
import { client } from '$lib/server/twilio';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const c = client();
  const [recordings, calls] = await Promise.all([
    c.recordings.list({ limit: 50 }),
    c.calls.list({ limit: 200 }),
  ]);
  const fromBySid = new Map(calls.map((call) => [call.sid, call.from]));
  return {
    voicemails: recordings.map((r) => ({
      sid: r.sid,
      date: r.dateCreated.toISOString(),
      duration: Number(r.duration ?? 0),
      from: fromBySid.get(r.callSid) ?? 'unknown',
    })),
  };
};

export const actions: Actions = {
  delete: async ({ request }) => {
    const sid = String((await request.formData()).get('sid') ?? '');
    if (!/^RE[0-9a-f]{32}$/.test(sid)) return fail(400, { error: 'Bad recording id' });
    await client().recordings(sid).remove();
    return { deleted: sid };
  },
};
