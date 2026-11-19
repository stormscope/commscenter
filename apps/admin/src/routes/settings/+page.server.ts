import { fail } from '@sveltejs/kit';
import { readSettings, writeSettings } from '$lib/server/twilio';
import { settingsFromForm } from '$lib/settings-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const { settings, raw } = await readSettings();
  return { settings, raw: settings ? null : JSON.stringify(raw, null, 2) };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const { settings: current } = await readSettings();
    if (!current)
      return fail(500, { errors: ['Stored settings are invalid; fix them in Twilio Sync.'] });
    const result = settingsFromForm(await request.formData(), current);
    if (!result.ok) return fail(400, { errors: result.errors });
    await writeSettings(result.settings);
    return { saved: true };
  },
};
