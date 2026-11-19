/** `pnpm infra:env`: (re)create the admin UI's API key and write apps/admin/.env. */
import { writeAdminEnv } from './lib/admin-env.js';
import { selectStack } from './lib/pulumi.js';

selectStack();
const path = await writeAdminEnv();
console.log(`Wrote ${path}`);
