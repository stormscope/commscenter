import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const INFRA_DIR = join(ROOT, 'infra');
export const STACK = 'prod';
export const STATE_DIR = join(homedir(), '.commscentral');
const PASSPHRASE_FILE = join(STATE_DIR, 'passphrase');

/**
 * Environment for every Pulumi call: local state backend (from Pulumi.yaml) and a
 * passphrase file for secrets, created on first use. An existing
 * PULUMI_CONFIG_PASSPHRASE(_FILE) in the environment wins.
 */
export function pulumiEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PULUMI_SKIP_UPDATE_CHECK: 'true' };
  if (env.PULUMI_CONFIG_PASSPHRASE || env.PULUMI_CONFIG_PASSPHRASE_FILE) return env;
  if (!existsSync(PASSPHRASE_FILE)) {
    mkdirSync(join(STATE_DIR, 'pulumi-state'), { recursive: true });
    writeFileSync(PASSPHRASE_FILE, randomBytes(32).toString('base64url') + '\n', { mode: 0o600 });
    chmodSync(PASSPHRASE_FILE, 0o600);
    console.log(`Created a Pulumi secrets passphrase in ${PASSPHRASE_FILE}. Back it up.`);
  }
  mkdirSync(join(STATE_DIR, 'pulumi-state'), { recursive: true });
  return { ...env, PULUMI_CONFIG_PASSPHRASE_FILE: PASSPHRASE_FILE };
}

export function hasCommand(cmd: string, args: string[] = ['--version']): boolean {
  const r = spawnSync(cmd, args, { stdio: 'ignore' });
  return r.status === 0;
}

/** Run pulumi in infra/ with output shown, throwing on failure. */
export function pulumi(args: string[], opts: SpawnSyncOptions = {}): void {
  const r = spawnSync('pulumi', args, {
    cwd: INFRA_DIR,
    env: pulumiEnv(),
    stdio: 'inherit',
    ...opts,
  });
  if (r.status !== 0) throw new Error(`pulumi ${args[0]} failed`);
}

/** Run pulumi and return stdout, or null on failure. */
export function pulumiCapture(args: string[]): string | null {
  const r = spawnSync('pulumi', args, {
    cwd: INFRA_DIR,
    env: pulumiEnv(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function selectStack(): void {
  if (pulumiCapture(['stack', 'select', STACK]) === null) {
    pulumi(['stack', 'init', STACK]);
  }
}

const NS = 'commscentral';

export function getConfig(key: string): string | null {
  return pulumiCapture(['config', 'get', `${NS}:${key}`, '--stack', STACK]);
}

export function setConfig(key: string, value: string, secret = false): void {
  const args = ['config', 'set', `${NS}:${key}`, '--stack', STACK];
  if (secret) args.push('--secret');
  // Pass the value on stdin so secrets never show up in the process list.
  const r = spawnSync('pulumi', args, {
    cwd: INFRA_DIR,
    env: pulumiEnv(),
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  if (r.status !== 0) throw new Error(`Could not set config ${key}`);
}

export function removeConfig(key: string): void {
  pulumiCapture(['config', 'rm', `${NS}:${key}`, '--stack', STACK]);
}

export function stackOutputs(showSecrets = false): Record<string, unknown> | null {
  const args = ['stack', 'output', '--json', '--stack', STACK];
  if (showSecrets) args.push('--show-secrets');
  const out = pulumiCapture(args);
  return out ? (JSON.parse(out) as Record<string, unknown>) : null;
}

/** Non-secret answers from the last bootstrap run, used as defaults next time. */
export interface LocalState {
  sipDomainPrefix?: string;
  adminApiKeySid?: string;
}

const LOCAL_STATE = join(ROOT, '.commscentral.json');

export function readLocalState(): LocalState {
  try {
    return JSON.parse(readFileSync(LOCAL_STATE, 'utf8')) as LocalState;
  } catch {
    return {};
  }
}

export function writeLocalState(state: LocalState): void {
  writeFileSync(LOCAL_STATE, JSON.stringify(state, null, 2) + '\n');
}
