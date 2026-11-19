import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FunctionSource } from './resources/serverless';

interface Manifest {
  runtime: string;
  dependencies: Record<string, string>;
  functions: Array<{ path: string; file: string; access: FunctionSource['access'] }>;
}

/** Load the bundles produced by `pnpm --filter @commscentral/functions build`. */
export function loadFunctionBundle(distDir: string) {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8')) as Manifest;
  } catch {
    throw new Error(`No function bundle in ${distDir}. Run "pnpm build" first.`);
  }
  const functions: FunctionSource[] = manifest.functions.map((f) => ({
    path: f.path,
    access: f.access,
    content: readFileSync(join(distDir, f.file), 'utf8'),
  }));
  return { runtime: manifest.runtime, dependencies: manifest.dependencies, functions };
}
