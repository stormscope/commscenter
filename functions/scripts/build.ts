/**
 * Bundle every file in src/functions into a single CommonJS file per Twilio Function,
 * and write dist/manifest.json, which the Pulumi program deploys.
 */
import { build } from 'esbuild';
import { readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src', 'functions');
const outDir = join(root, 'dist');

async function listTs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return listTs(full);
      return Promise.resolve(e.name.endsWith('.ts') ? [full] : []);
    }),
  );
  return files.flat().sort();
}

export interface ManifestEntry {
  /** URL path on the Twilio Functions domain, e.g. /voice/inbound */
  path: string;
  /** Bundled file relative to dist/ */
  file: string;
  access: 'protected' | 'public' | 'private';
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

/** Packages installed on Twilio instead of bundled (zod alone would add ~800 kB per function). */
const RUNTIME_DEPENDENCIES = ['twilio', 'zod'];

/**
 * Functions Twilio calls without a request signature. Twilio usage triggers are not
 * guaranteed to be signed, so /alerts/usage is public and checks a token in its URL.
 */
const PUBLIC_FUNCTIONS = new Set(['/alerts/usage']);
const pin = (name: string) => (pkg.dependencies[name] ?? 'latest').replace(/^[\^~]/, '');

await rm(outDir, { recursive: true, force: true });
const entries = await listTs(srcDir);
const manifest: ManifestEntry[] = [];

for (const entry of entries) {
  const rel = relative(srcDir, entry).split(sep).join('/').replace(/\.ts$/, '');
  const outfile = join(outDir, 'functions', `${rel}.js`);
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    // Installed by the Twilio runtime from the deployed package.json dependencies.
    external: RUNTIME_DEPENDENCIES,
    legalComments: 'none',
    logLevel: 'warning',
  });
  const path = `/${rel}`;
  manifest.push({
    path,
    file: `functions/${rel}.js`,
    access: PUBLIC_FUNCTIONS.has(path) ? 'public' : 'protected',
  });
}

// The bundles are CommonJS, as the Twilio runtime expects.
await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');
await writeFile(
  join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      runtime: 'node22',
      dependencies: {
        ...Object.fromEntries(RUNTIME_DEPENDENCIES.map((d) => [d, pin(d)])),
        // Pins the Twilio runtime version, as the Twilio CLI does for new projects.
        '@twilio/runtime-handler': '2.1.0',
      },
      functions: manifest,
    },
    null,
    2,
  ),
);
console.log(`Bundled ${manifest.length} functions into ${relative(process.cwd(), outDir)}`);
