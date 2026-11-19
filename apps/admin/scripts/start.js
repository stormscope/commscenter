// Start the built admin UI. Reads apps/admin/.env (written by `pnpm infra:env`)
// and binds to 127.0.0.1 unless ADMIN_HOST says otherwise (e.g. your tailnet IP).
import { existsSync } from 'node:fs';

if (!existsSync('.env')) {
  console.error('apps/admin/.env is missing. Run "pnpm infra:env" (or "pnpm bootstrap") first.');
  process.exit(1);
}
process.loadEnvFile('.env');
process.env.HOST = process.env.ADMIN_HOST || '127.0.0.1';
process.env.PORT = process.env.ADMIN_PORT || '5170';
console.log(`CommsCentral admin on http://${process.env.HOST}:${process.env.PORT}`);
await import('../build/index.js');
