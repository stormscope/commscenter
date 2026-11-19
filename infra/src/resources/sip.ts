import * as pulumi from '@pulumi/pulumi';
import type { Twilio } from 'twilio';
import { changedKeys, twilioClient, type TwilioCreds } from './twilio';

export interface SipDomainInputs {
  creds: TwilioCreds;
  /** Prefix only: `commscentral-ab12cd` becomes `commscentral-ab12cd.sip.twilio.com`. */
  domainPrefix: string;
  friendlyName: string;
  voiceUrl: string;
  username: string;
  password: string;
  secure: boolean;
}

export interface SipDomainOutputs extends SipDomainInputs {
  domainSid: string;
  credentialListSid: string;
  credentialSid: string;
  domainName: string;
}

export async function createSipDomain(client: Twilio, inputs: SipDomainInputs) {
  const list = await client.sip.credentialLists.create({
    friendlyName: `${inputs.friendlyName} users`,
  });
  const credential = await client.sip
    .credentialLists(list.sid)
    .credentials.create({ username: inputs.username, password: inputs.password });
  const domainName = `${inputs.domainPrefix}.sip.twilio.com`;
  const domain = await client.sip.domains.create({
    domainName,
    friendlyName: inputs.friendlyName,
    voiceUrl: inputs.voiceUrl,
    voiceMethod: 'POST',
    sipRegistration: true,
    secure: inputs.secure,
  });
  const auth = client.sip.domains(domain.sid).auth;
  await auth.calls.credentialListMappings.create({ credentialListSid: list.sid });
  await auth.registrations.credentialListMappings.create({ credentialListSid: list.sid });
  return {
    domainSid: domain.sid,
    credentialListSid: list.sid,
    credentialSid: credential.sid,
    domainName,
  };
}

export async function updateSipDomain(
  client: Twilio,
  olds: SipDomainOutputs,
  news: SipDomainInputs,
): Promise<string> {
  await client.sip.domains(olds.domainSid).update({
    friendlyName: news.friendlyName,
    voiceUrl: news.voiceUrl,
    voiceMethod: 'POST',
    sipRegistration: true,
    secure: news.secure,
  });
  const credentials = client.sip.credentialLists(olds.credentialListSid).credentials;
  if (olds.username !== news.username) {
    await credentials(olds.credentialSid).remove();
    const created = await credentials.create({ username: news.username, password: news.password });
    return created.sid;
  }
  if (olds.password !== news.password) {
    await credentials(olds.credentialSid).update({ password: news.password });
  }
  return olds.credentialSid;
}

export const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: SipDomainInputs) {
    const ids = await createSipDomain(twilioClient(inputs.creds), inputs);
    return { id: ids.domainSid, outs: { ...inputs, ...ids } };
  },
  async diff(id: string, olds: SipDomainOutputs, news: SipDomainInputs) {
    const changes = changedKeys(olds, news, [
      'creds',
      'domainSid',
      'credentialListSid',
      'credentialSid',
      'domainName',
    ]);
    return {
      changes: changes.length > 0,
      replaces: changes.includes('domainPrefix') ? ['domainPrefix'] : [],
      deleteBeforeReplace: true,
    };
  },
  async update(id: string, olds: SipDomainOutputs, news: SipDomainInputs) {
    const credentialSid = await updateSipDomain(twilioClient(news.creds), olds, news);
    return {
      outs: {
        ...news,
        domainSid: olds.domainSid,
        credentialListSid: olds.credentialListSid,
        credentialSid,
        domainName: olds.domainName,
      },
    };
  },
  async delete(id: string, props: SipDomainOutputs) {
    const client = twilioClient(props.creds);
    await client.sip.domains(id).remove();
    await client.sip.credentialLists(props.credentialListSid).remove();
  },
};

/** SIP Domain with registration enabled and one user, for the phone app. */
export class SipDomain extends pulumi.dynamic.Resource {
  declare public readonly domainName: pulumi.Output<string>;
  declare public readonly domainSid: pulumi.Output<string>;

  constructor(
    name: string,
    args: { [K in keyof SipDomainInputs]: pulumi.Input<SipDomainInputs[K]> },
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      provider,
      name,
      {
        domainSid: undefined,
        credentialListSid: undefined,
        credentialSid: undefined,
        domainName: undefined,
        ...args,
      },
      { ...opts, additionalSecretOutputs: ['password'] },
    );
  }
}
