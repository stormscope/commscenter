import * as pulumi from '@pulumi/pulumi';
import type { Twilio } from 'twilio';
import { changedKeys, twilioClient, type TwilioCreds } from './twilio';

export interface SyncSettingsInputs {
  creds: TwilioCreds;
  friendlyName: string;
  documentName: string;
  /** Written once on create. Afterwards the admin UI owns the document's data. */
  initialData: Record<string, unknown>;
}

export interface SyncSettingsOutputs extends SyncSettingsInputs {
  serviceSid: string;
  documentSid: string;
}

export async function createSyncSettings(
  client: Twilio,
  inputs: SyncSettingsInputs,
): Promise<{ serviceSid: string; documentSid: string }> {
  const service = await client.sync.v1.services.create({ friendlyName: inputs.friendlyName });
  const doc = await client.sync.v1
    .services(service.sid)
    .documents.create({ uniqueName: inputs.documentName, data: inputs.initialData });
  return { serviceSid: service.sid, documentSid: doc.sid };
}

/** Make sure the document exists (it may have been deleted by hand); never overwrite it. */
export async function ensureSyncDocument(
  client: Twilio,
  serviceSid: string,
  inputs: SyncSettingsInputs,
): Promise<string> {
  const docs = client.sync.v1.services(serviceSid).documents;
  try {
    return (await docs(inputs.documentName).fetch()).sid;
  } catch {
    return (await docs.create({ uniqueName: inputs.documentName, data: inputs.initialData })).sid;
  }
}

export const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: SyncSettingsInputs) {
    const ids = await createSyncSettings(twilioClient(inputs.creds), inputs);
    return { id: ids.serviceSid, outs: { ...inputs, ...ids } };
  },
  async diff(id: string, olds: SyncSettingsOutputs, news: SyncSettingsInputs) {
    // initialData only matters on create; changing it must not touch live settings.
    const changes = changedKeys(olds, news, ['creds', 'initialData', 'serviceSid', 'documentSid']);
    return {
      changes: changes.length > 0,
      replaces: changes.includes('documentName') ? ['documentName'] : [],
      deleteBeforeReplace: true,
    };
  },
  async update(id: string, olds: SyncSettingsOutputs, news: SyncSettingsInputs) {
    const client = twilioClient(news.creds);
    await client.sync.v1.services(id).update({ friendlyName: news.friendlyName });
    const documentSid = await ensureSyncDocument(client, id, news);
    return { outs: { ...news, serviceSid: id, documentSid } };
  },
  async delete(id: string, props: SyncSettingsOutputs) {
    await twilioClient(props.creds).sync.v1.services(id).remove();
  },
};

/** A Sync service holding the `settings` document read by the Functions and the admin UI. */
export class SyncSettings extends pulumi.dynamic.Resource {
  declare public readonly serviceSid: pulumi.Output<string>;
  declare public readonly documentSid: pulumi.Output<string>;

  constructor(
    name: string,
    args: { [K in keyof SyncSettingsInputs]: pulumi.Input<SyncSettingsInputs[K]> },
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(provider, name, { serviceSid: undefined, documentSid: undefined, ...args }, opts);
  }
}
