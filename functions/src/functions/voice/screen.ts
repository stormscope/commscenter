import { asyncHandler } from '../../lib/handler.js';
import { loadSettings } from '../../lib/settings.js';
import { screen } from '../../lib/twiml.js';

export const handler = asyncHandler(async (context, event, callback) => {
  const settings = await loadSettings(context);
  callback(null, screen(settings, event));
});
