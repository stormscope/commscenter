/** `pnpm infra:up` / `pnpm infra:preview`: run Pulumi with CommsCentral's backend and passphrase. */
import { pulumi, selectStack } from './lib/pulumi.js';

const args = process.argv.slice(2);
selectStack();
try {
  pulumi(args);
} catch {
  process.exit(1);
}
