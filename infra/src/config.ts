import * as pulumi from '@pulumi/pulumi';

/** Stack configuration. `pnpm bootstrap` writes all of it. */
export function readConfig() {
  const cfg = new pulumi.Config('commscentral');
  return {
    accountSid: cfg.require('twilioAccountSid'),
    authToken: cfg.requireSecret('twilioAuthToken'),
    twilioNumber: cfg.require('twilioNumber'),
    ownerMobile: cfg.require('ownerMobile'),
    outboundCallerId: (cfg.get('outboundCallerId') ?? 'twilio') as 'mobile' | 'twilio',
    sipDomainPrefix: cfg.require('sipDomainPrefix'),
    sipUsername: cfg.get('sipUsername') ?? 'me',
    sipPassword: cfg.requireSecret('sipPassword'),
    sipSecure: cfg.getBoolean('sipSecure') ?? true,
    notifyEmail: cfg.get('notifyEmail') ?? '',
    emailFrom: cfg.get('emailFrom') ?? '',
    resendApiKey: cfg.getSecret('resendApiKey') ?? pulumi.output(''),
    allowedPrefixes: cfg.getObject<string[]>('allowedPrefixes') ?? ['+41'],
    spendAlertsUsd: cfg.getObject<number[]>('spendAlertsUsd') ?? [20, 50],
    geoStrict: cfg.getBoolean('geoStrict') ?? true,
    defaultCountryCode: cfg.get('defaultCountryCode') ?? '41',
  };
}

export type CommsConfig = ReturnType<typeof readConfig>;
