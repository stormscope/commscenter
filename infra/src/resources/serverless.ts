import * as pulumi from '@pulumi/pulumi';
import { changedKeys, type TwilioCreds } from './twilio';

export interface FunctionSource {
  path: string;
  access: 'protected' | 'public' | 'private';
  content: string;
}

export interface ServerlessInputs {
  creds: TwilioCreds;
  serviceName: string;
  environment: string;
  runtime: string;
  dependencies: Record<string, string>;
  functions: FunctionSource[];
  env: Record<string, string>;
}

export interface ServerlessOutputs extends ServerlessInputs {
  serviceSid: string;
  environmentSid: string;
  buildSid: string;
  domain: string;
}

async function deploy(inputs: ServerlessInputs, serviceSid?: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TwilioServerlessApiClient } =
    require('@twilio-labs/serverless-api') as typeof import('@twilio-labs/serverless-api');
  const client = new TwilioServerlessApiClient({
    accountSid: inputs.creds.accountSid,
    authToken: inputs.creds.authToken,
  });
  // Empty values would be rejected by the API; leave them out.
  const env = Object.fromEntries(Object.entries(inputs.env).filter(([, v]) => v !== ''));
  const result = await client.deployProject({
    accountSid: inputs.creds.accountSid,
    authToken: inputs.creds.authToken,
    serviceSid,
    serviceName: inputs.serviceName,
    functionsEnv: inputs.environment,
    runtime: inputs.runtime,
    overrideExistingService: true,
    env,
    pkgJson: { dependencies: inputs.dependencies },
    functions: inputs.functions.map((f) => ({
      name: f.path.replace(/^\//, ''),
      path: f.path,
      access: f.access,
      content: f.content,
    })),
    assets: [],
  });
  return {
    serviceSid: result.serviceSid,
    environmentSid: result.environmentSid,
    buildSid: result.buildSid,
    domain: result.domain,
  };
}

export const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ServerlessInputs) {
    const ids = await deploy(inputs);
    return { id: ids.serviceSid, outs: { ...inputs, ...ids } };
  },
  async diff(id: string, olds: ServerlessOutputs, news: ServerlessInputs) {
    const changes = changedKeys(olds, news, [
      'creds',
      'serviceSid',
      'environmentSid',
      'buildSid',
      'domain',
    ]);
    return {
      changes: changes.length > 0,
      replaces: changes.filter((k) => k === 'serviceName' || k === 'environment'),
      deleteBeforeReplace: true,
    };
  },
  async update(id: string, olds: ServerlessOutputs, news: ServerlessInputs) {
    const ids = await deploy(news, id);
    return { outs: { ...news, ...ids } };
  },
  async delete(id: string, props: ServerlessOutputs) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require('twilio') as typeof import('twilio');
    await twilio(props.creds.accountSid, props.creds.authToken).serverless.v1.services(id).remove();
  },
};

/** Builds and deploys the Twilio Functions, and returns their domain. */
export class ServerlessDeployment extends pulumi.dynamic.Resource {
  declare public readonly serviceSid: pulumi.Output<string>;
  declare public readonly domain: pulumi.Output<string>;
  declare public readonly buildSid: pulumi.Output<string>;

  constructor(
    name: string,
    args: {
      [K in keyof Omit<ServerlessInputs, 'env'>]: pulumi.Input<ServerlessInputs[K]>;
    } & { env: Record<string, pulumi.Input<string>> },
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      provider,
      name,
      {
        serviceSid: undefined,
        environmentSid: undefined,
        buildSid: undefined,
        domain: undefined,
        ...args,
      },
      opts,
    );
  }
}
