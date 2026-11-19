import { asyncHandler } from '../../lib/handler.js';
import { loadSettings } from '../../lib/settings.js';
import { afterDial } from '../../lib/twiml.js';

export const handler = asyncHandler(async (context, event, callback) => {
  const settings = await loadSettings(context);
  callback(null, afterDial(settings, event));
});
