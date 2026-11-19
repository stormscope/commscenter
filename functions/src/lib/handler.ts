import type { FunctionCallback, Handler } from './types.js';

/** Wrap an async handler so any error is reported to Twilio instead of hanging the request. */
export function asyncHandler(fn: Handler): Handler {
  return async (context, event, callback: FunctionCallback) => {
    try {
      await fn(context, event, callback);
    } catch (error) {
      console.error(error);
      callback(error);
    }
  };
}
