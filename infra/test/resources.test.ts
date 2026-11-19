import { describe, expect, it, vi } from 'vitest';
import { changedKeys } from '../src/resources/twilio';
import { createSipDomain, updateSipDomain, type SipDomainOutputs } from '../src/resources/sip';
import { createSyncSettings, ensureSyncDocument } from '../src/resources/sync';
import { createTriggers, removeTriggers } from '../src/resources/usage';
import { findNumberSid } from '../src/resources/number';

const creds = { accountSid: 'AC1', authToken: 't' };

describe('changedKeys', () => {
  it('ignores credentials', () => {
    expect(changedKeys({ creds: 1, a: 1, b: [1] }, { creds: 2, a: 1, b: [2] }, ['creds'])).toEqual([
      'b',
    ]);
  });
});

function sipClient() {
  const calls: string[] = [];
  const credentialsFn = Object.assign(
    (sid: string) => ({
      remove: vi.fn(async () => calls.push(`remove ${sid}`)),
      update: vi.fn(async (p: unknown) => calls.push(`update ${sid} ${JSON.stringify(p)}`)),
    }),
    {
      create: vi.fn(
        async (p: { username: string }) => (calls.push(`cred ${p.username}`), { sid: 'CR2' }),
      ),
    },
  );
  const client = {
    sip: {
      credentialLists: Object.assign(() => ({ credentials: credentialsFn }), {
        create: vi.fn(async () => ({ sid: 'CL1' })),
      }),
      domains: Object.assign(
        (sid: string) => ({
          update: vi.fn(async () => calls.push(`domain update ${sid}`)),
          auth: {
            calls: {
              credentialListMappings: { create: vi.fn(async () => calls.push('map calls')) },
            },
            registrations: {
              credentialListMappings: {
                create: vi.fn(async () => calls.push('map registrations')),
              },
            },
          },
        }),
        {
          create: vi.fn(async (p: { domainName: string; secure: boolean }) => {
            calls.push(`domain ${p.domainName} secure=${p.secure}`);
            return { sid: 'SD1' };
          }),
        },
      ),
    },
  };
  return { client: client as never, calls };
}

describe('SIP domain', () => {
  const inputs = {
    creds,
    domainPrefix: 'commscentral-x',
    friendlyName: 'CC',
    voiceUrl: 'https://f.twil.io/sip/outbound',
    username: 'me',
    password: 'pw',
    secure: true,
  };

  it('creates list, user, domain and both auth mappings', async () => {
    const { client, calls } = sipClient();
    const ids = await createSipDomain(client, inputs);
    expect(ids).toEqual({
      domainSid: 'SD1',
      credentialListSid: 'CL1',
      credentialSid: 'CR2',
      domainName: 'commscentral-x.sip.twilio.com',
    });
    expect(calls).toEqual([
      'cred me',
      'domain commscentral-x.sip.twilio.com secure=true',
      'map calls',
      'map registrations',
    ]);
  });

  it('rotates the password in place and recreates the user on rename', async () => {
    const olds: SipDomainOutputs = {
      ...inputs,
      domainSid: 'SD1',
      credentialListSid: 'CL1',
      credentialSid: 'CR1',
      domainName: 'commscentral-x.sip.twilio.com',
    };
    let s = sipClient();
    expect(await updateSipDomain(s.client, olds, { ...inputs, password: 'new' })).toBe('CR1');
    expect(s.calls).toContain('update CR1 {"password":"new"}');

    s = sipClient();
    expect(await updateSipDomain(s.client, olds, { ...inputs, username: 'fab' })).toBe('CR2');
    expect(s.calls).toEqual(['domain update SD1', 'remove CR1', 'cred fab']);
  });
});

describe('Sync settings', () => {
  it('creates the service and the document', async () => {
    const docCreate = vi.fn(async () => ({ sid: 'ET1' }));
    const client = {
      sync: {
        v1: {
          services: Object.assign(() => ({ documents: { create: docCreate } }), {
            create: vi.fn(async () => ({ sid: 'IS1' })),
          }),
        },
      },
    };
    const ids = await createSyncSettings(client as never, {
      creds,
      friendlyName: 'CC',
      documentName: 'settings',
      initialData: { a: 1 },
    });
    expect(ids).toEqual({ serviceSid: 'IS1', documentSid: 'ET1' });
    expect(docCreate).toHaveBeenCalledWith({ uniqueName: 'settings', data: { a: 1 } });
  });

  it('recreates a deleted document but never overwrites one', async () => {
    const create = vi.fn(async () => ({ sid: 'ET2' }));
    const docs = (exists: boolean) =>
      Object.assign(
        () => ({ fetch: async () => (exists ? { sid: 'ET1' } : Promise.reject(new Error('404'))) }),
        { create },
      );
    const client = (exists: boolean) =>
      ({ sync: { v1: { services: () => ({ documents: docs(exists) }) } } }) as never;
    const inputs = { creds, friendlyName: 'CC', documentName: 'settings', initialData: {} };
    expect(await ensureSyncDocument(client(true), 'IS1', inputs)).toBe('ET1');
    expect(create).not.toHaveBeenCalled();
    expect(await ensureSyncDocument(client(false), 'IS1', inputs)).toBe('ET2');
  });
});

describe('spend alerts', () => {
  it('creates one monthly price trigger per threshold', async () => {
    const create = vi.fn(async (p: { triggerValue: string }) => ({ sid: `UT${p.triggerValue}` }));
    const client = { usage: { triggers: Object.assign(() => ({}), { create }) } };
    const sids = await createTriggers(client as never, {
      creds,
      callbackUrl: 'https://f.twil.io/alerts/usage',
      thresholdsUsd: [20, 50],
    });
    expect(sids).toEqual(['UT20', 'UT50']);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      usageCategory: 'totalprice',
      triggerBy: 'price',
      recurring: 'monthly',
    });
  });

  it('ignores triggers that are already gone', async () => {
    const remove = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { status: 404 });
    });
    const client = { usage: { triggers: () => ({ remove }) } };
    await expect(removeTriggers(client as never, ['UT1'])).resolves.toBeUndefined();
  });
});

describe('number lookup', () => {
  it('explains what to do when the number is not in the account', async () => {
    const client = { incomingPhoneNumbers: { list: async () => [] } };
    await expect(findNumberSid(client as never, '+41445550000')).rejects.toThrow(/pnpm bootstrap/);
  });
});
