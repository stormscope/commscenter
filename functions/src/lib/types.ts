import type { Twilio } from 'twilio';

/** Environment variables set on the Twilio Serverless environment by Pulumi. */
export interface CommsEnv {
  SYNC_SERVICE_SID?: string;
  TWILIO_NUMBER?: string;
  OWNER_MOBILE?: string;
  SIP_ADDRESS?: string;
  ALLOWED_PREFIXES?: string;
  NOTIFY_EMAIL?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  DEFAULT_COUNTRY_CODE?: string;
  ALERTS_TOKEN?: string;
}

/** The subset of the Twilio Functions context that CommsCentral uses. */
export interface FunctionContext extends CommsEnv {
  getTwilioClient(): Twilio;
  ACCOUNT_SID?: string;
  AUTH_TOKEN?: string;
  DOMAIN_NAME?: string;
}

export type FunctionEvent = Record<string, string | undefined>;

export type FunctionCallback = (error: unknown, response?: unknown) => void;

export type Handler = (
  context: FunctionContext,
  event: FunctionEvent,
  callback: FunctionCallback,
) => void | Promise<void>;
