/** `pnpm infra:sip-creds`: print the phone app settings. */
import { phoneSetupText } from './lib/phone-setup.js';
import { selectStack, stackOutputs } from './lib/pulumi.js';

selectStack();
const o = stackOutputs(true);
if (!o) {
  console.error('Nothing deployed yet. Run "pnpm bootstrap" first.');
  process.exit(1);
}
console.log(
  phoneSetupText({
    sipDomain: String(o.sipDomain),
    sipUsername: String(o.sipUsername),
    sipPassword: String(o.sipPassword),
    sipTransport: String(o.sipTransport),
    phoneNumber: String(o.phoneNumber),
  }),
);
