import { asyncHandler } from '../../lib/handler.js';
import { screenResult } from '../../lib/twiml.js';

export const handler = asyncHandler((_context, event, callback) => {
  callback(null, screenResult(event));
});
