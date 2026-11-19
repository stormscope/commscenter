import { asyncHandler } from '../../lib/handler.js';
import { loadSettings } from '../../lib/settings.js';
import { inbound } from '../../lib/twiml.js';

/** Voice webhook of the CommsCentral number. */
export const handler = asyncHandler(async (context, event, callback) => {
  const settings = await loadSettings(context);
  callback(null, inbound(settings, event));
});
