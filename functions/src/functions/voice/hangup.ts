import { asyncHandler } from '../../lib/handler.js';
import { hangup } from '../../lib/twiml.js';

export const handler = asyncHandler((_context, _event, callback) => {
  callback(null, hangup());
});
