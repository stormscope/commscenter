import * as pulumi from '@pulumi/pulumi';
import type { Twilio } from 'twilio';
import { twilioClient, type TwilioCreds } from './twilio';

export interface SpendAlertsInputs {
  creds: TwilioCreds;
  callbackUrl: string;
  thresholdsUsd: number[];
}

export interface SpendAlertsOutputs extends SpendAlertsInputs {
  triggerSids: string[];
}

export async function createTriggers(client: Twilio, inputs: SpendAlertsInputs): Promise<string[]> {
  const sids: string[] = [];
  for (const usd of inputs.thresholdsUsd) {
    const trigger = await client.usage.triggers.create({
      friendlyName: `CommsCentral spend ${usd} USD`,
      callbackUrl: inputs.callbackUrl,
      callbackMethod: 'POST',
      triggerValue: String(usd),
      usageCategory: 'totalprice',
      triggerBy: 'price',
      recurring: 'monthly',
    });
    sids.push(trigger.sid);
  }
  return sids;
}

export async function removeTriggers(client: Twilio, sids: readonly string[]): Promise<void> {
  for (const sid of sids) {
    try {
      await client.usage.triggers(sid).remove();
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
  }
}

export const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: SpendAlertsInputs) {
    const triggerSids = await createTriggers(twilioClient(inputs.creds), inputs);
    return { id: 'spend-alerts', outs: { ...inputs, triggerSids } };
  },
  async diff(id: string, olds: SpendAlertsOutputs, news: SpendAlertsInputs) {
    const changes =
      olds.callbackUrl !== news.callbackUrl ||
      JSON.stringify(olds.thresholdsUsd) !== JSON.stringify(news.thresholdsUsd);
    return { changes };
  },
  async update(id: string, olds: SpendAlertsOutputs, news: SpendAlertsInputs) {
    const client = twilioClient(news.creds);
    await removeTriggers(client, olds.triggerSids);
    const triggerSids = await createTriggers(client, news);
    return { outs: { ...news, triggerSids } };
  },
  async delete(id: string, props: SpendAlertsOutputs) {
    await removeTriggers(twilioClient(props.creds), props.triggerSids);
  },
};

/** Monthly spend alerts (Twilio usage triggers) that call the /alerts/usage function. */
export class SpendAlerts extends pulumi.dynamic.Resource {
  declare public readonly triggerSids: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: { [K in keyof SpendAlertsInputs]: pulumi.Input<SpendAlertsInputs[K]> },
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(provider, name, { triggerSids: undefined, ...args }, opts);
  }
}
