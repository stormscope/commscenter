import * as pulumi from '@pulumi/pulumi';
import type { Twilio } from 'twilio';
import { changedKeys, twilioClient, type TwilioCreds } from './twilio';

export interface NumberWebhooksInputs {
  creds: TwilioCreds;
  phoneNumber: string;
  voiceUrl: string;
  /** Called when a call ends; used for missed-call notifications. */
  statusCallback: string;
}

export interface NumberWebhooksOutputs extends NumberWebhooksInputs {
  numberSid: string;
}

export async function findNumberSid(client: Twilio, phoneNumber: string): Promise<string> {
  const [match] = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (!match) {
    throw new Error(
      `${phoneNumber} is not a phone number in this Twilio account. Run "pnpm bootstrap" to buy or pick one.`,
    );
  }
  return match.sid;
}

export const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: NumberWebhooksInputs) {
    const client = twilioClient(inputs.creds);
    const numberSid = await findNumberSid(client, inputs.phoneNumber);
    await client.incomingPhoneNumbers(numberSid).update({
      voiceUrl: inputs.voiceUrl,
      voiceMethod: 'POST',
      voiceApplicationSid: '',
      statusCallback: inputs.statusCallback,
      statusCallbackMethod: 'POST',
    });
    return { id: numberSid, outs: { ...inputs, numberSid } };
  },
  async diff(id: string, olds: NumberWebhooksOutputs, news: NumberWebhooksInputs) {
    const changes = changedKeys(olds, news, ['creds', 'numberSid']);
    return {
      changes: changes.length > 0,
      replaces: changes.includes('phoneNumber') ? ['phoneNumber'] : [],
      deleteBeforeReplace: true,
    };
  },
  async update(id: string, olds: NumberWebhooksOutputs, news: NumberWebhooksInputs) {
    await twilioClient(news.creds).incomingPhoneNumbers(id).update({
      voiceUrl: news.voiceUrl,
      voiceMethod: 'POST',
      statusCallback: news.statusCallback,
      statusCallbackMethod: 'POST',
    });
    return { outs: { ...news, numberSid: id } };
  },
  async delete(id: string, props: NumberWebhooksOutputs) {
    // The number itself is kept (it costs money to buy and needs regulatory approval).
    await twilioClient(props.creds)
      .incomingPhoneNumbers(id)
      .update({ voiceUrl: '', statusCallback: '' });
  },
};

/** Points an existing Twilio number's voice webhook at CommsCentral. */
export class NumberWebhooks extends pulumi.dynamic.Resource {
  declare public readonly numberSid: pulumi.Output<string>;

  constructor(
    name: string,
    args: { [K in keyof NumberWebhooksInputs]: pulumi.Input<NumberWebhooksInputs[K]> },
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(provider, name, { numberSid: undefined, ...args }, opts);
  }
}
