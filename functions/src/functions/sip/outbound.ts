import { asyncHandler } from '../../lib/handler.js';
import { loadSettings } from '../../lib/settings.js';
import { sipOutbound } from '../../lib/twiml.js';

/** Voice URL of the SIP Domain: the app dialled a number. */
export const handler = asyncHandler(async (context, event, callback) => {
  const settings = await loadSettings(context);
  callback(
    null,
    sipOutbound(settings, event, {
      twilioNumber: context.TWILIO_NUMBER ?? settings.owner.mobile,
      defaultCountryCode: context.DEFAULT_COUNTRY_CODE,
    }),
  );
});
