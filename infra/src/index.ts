import * as pulumi from '@pulumi/pulumi';
import { defaultSettings, isoCodesForPrefixes, sipAddressFor } from '@commscentral/shared';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readConfig } from './config';
import { loadFunctionBundle } from './functions';
import { GeoPermissions } from './resources/geo';
import { NumberWebhooks } from './resources/number';
import { ServerlessDeployment } from './resources/serverless';
import { SipDomain } from './resources/sip';
import { SyncSettings } from './resources/sync';
import { SpendAlerts } from './resources/usage';

const config = readConfig();
const creds = pulumi.secret({ accountSid: config.accountSid, authToken: config.authToken });
const sipAddress = sipAddressFor(config.sipUsername, config.sipDomainPrefix);
// Shared secret for the public /alerts/usage function, derived so it needs no extra config.
const alertsToken = pulumi.secret(
  config.authToken.apply((t) =>
    createHash('sha256').update(`commscentral-alerts:${t}`).digest('hex').slice(0, 32),
  ),
);

// 1. Runtime settings, edited later in the admin UI.
const settings = new SyncSettings('settings', {
  creds,
  friendlyName: 'CommsCentral',
  documentName: 'settings',
  initialData: defaultSettings({
    ownerMobile: config.ownerMobile,
    sipAddress,
    notifyEmail: config.notifyEmail || null,
    allowedPrefixes: config.allowedPrefixes,
    outboundCallerId: config.outboundCallerId,
  }),
});

// 2. Functions (call logic).
const bundle = loadFunctionBundle(join(__dirname, '..', '..', 'functions', 'dist'));
const functions = new ServerlessDeployment('functions', {
  creds,
  serviceName: 'commscentral',
  environment: 'prod',
  runtime: bundle.runtime,
  dependencies: bundle.dependencies,
  functions: bundle.functions,
  env: {
    SYNC_SERVICE_SID: settings.serviceSid,
    TWILIO_NUMBER: config.twilioNumber,
    OWNER_MOBILE: config.ownerMobile,
    SIP_ADDRESS: sipAddress,
    ALLOWED_PREFIXES: config.allowedPrefixes.join(','),
    NOTIFY_EMAIL: config.notifyEmail,
    EMAIL_FROM: config.emailFrom,
    RESEND_API_KEY: config.resendApiKey,
    DEFAULT_COUNTRY_CODE: config.defaultCountryCode,
    ALERTS_TOKEN: alertsToken,
  },
});

const baseUrl = pulumi.interpolate`https://${functions.domain}`;

// 3. SIP Domain for the phone app.
const sip = new SipDomain('sip', {
  creds,
  domainPrefix: config.sipDomainPrefix,
  friendlyName: 'CommsCentral',
  voiceUrl: pulumi.interpolate`${baseUrl}/sip/outbound`,
  username: config.sipUsername,
  password: config.sipPassword,
  secure: config.sipSecure,
});

// 4. The phone number rings CommsCentral.
const number = new NumberWebhooks('number', {
  creds,
  phoneNumber: config.twilioNumber,
  voiceUrl: pulumi.interpolate`${baseUrl}/voice/inbound`,
  statusCallback: pulumi.interpolate`${baseUrl}/voice/call-status`,
});

// 5. Guardrails.
new GeoPermissions('geo', {
  creds,
  isoCodes: isoCodesForPrefixes(config.allowedPrefixes),
  strict: config.geoStrict,
});

new SpendAlerts('spend-alerts', {
  creds,
  callbackUrl: pulumi.secret(pulumi.interpolate`${baseUrl}/alerts/usage?token=${alertsToken}`),
  thresholdsUsd: config.spendAlertsUsd,
});

export const functionsDomain = functions.domain;
export const syncServiceSid = settings.serviceSid;
export const numberSid = number.numberSid;
export const phoneNumber = config.twilioNumber;
export const sipDomain = sip.domainName;
export const sipUsername = config.sipUsername;
export const sipPassword = config.sipPassword;
export const sipTransport = config.sipSecure ? 'TLS (port 5061), SRTP' : 'UDP/TCP (port 5060)';
