# CommsCentral

A minimal personal phone setup on Twilio. One Swiss number in the cloud, a SIP app on your phone, its own voicemail and cheap international calls. No servers: the call logic runs as Twilio Functions, and everything is deployed from this repo with Pulumi.

What it does (see [SPEC.md](SPEC.md) for the full design and costs):

- **Abroad, calling Switzerland:** call from the phone app over Wi-Fi or any data connection (e.g. a travel data eSIM). Twilio places the call from Switzerland, with your usual mobile number as caller ID.
- **Abroad, being called:** turn on "travel mode" (an unconditional forward from your mobile to the CommsCentral number). Calls stay in Switzerland, ring the app, and go to CommsCentral voicemail with an email if you don't answer. Your carrier's roaming voicemail is never involved.
- **At home, calling abroad:** calls to Sweden cost about 0.08 USD/min to a mobile and 0.02 USD/min to a landline, instead of 0.60 to 0.90 CHF/min.

Fixed cost is the number, about 1.15 USD a month. Everything else is per minute.

## Setup

You need Node 22+, [pnpm](https://pnpm.io/installation), the [Pulumi CLI](https://www.pulumi.com/docs/install/) and a Twilio account (upgraded from trial). Then:

```sh
pnpm install
pnpm bootstrap
```

`pnpm bootstrap` asks for everything it needs and does the rest:

1. Your Twilio Account SID and Auth Token (checked before use).
2. The phone number: pick one you own, or buy one. Swiss numbers need a regulatory bundle (your address and ID) approved by Twilio once; the script links to the page and stops until it's approved.
3. Your mobile number, and optionally verifies it with Twilio so it can be your caller ID (Twilio calls you, you type the code shown).
4. Which countries you can call. All other countries are blocked in Twilio.
5. Where voicemail notifications go: email through [Resend](https://resend.com) (free tier), or SMS.
6. Monthly spend alerts (default 20 and 50 USD).

Then it stores the answers in the Pulumi stack config (secrets encrypted), builds, deploys with `pulumi up`, writes the admin UI's `.env`, and prints the settings for the phone app.

Re-run `pnpm bootstrap` any time to change something. Previous answers are the defaults, and saved secrets are kept unless you choose to replace them.

### Where state lives

- Pulumi state: `~/.commscentral/pulumi-state` (local, no account needed).
- Secrets passphrase: `~/.commscentral/passphrase`, created on first run. **Back it up**; without it the encrypted config can't be read. To use Pulumi Cloud instead, remove the `backend` block from `infra/Pulumi.yaml` and run `pulumi login`.
- `.commscentral.json` in the repo root: two non-secret ids from bootstrap. Git-ignored.
- `apps/admin/.env`: the admin UI's own Twilio API key. Git-ignored.

## Phone setup

See [docs/phone-setup.md](docs/phone-setup.md): installing the app, travel mode codes, and testing. A one-page overview is in [docs/guide/CommsCentral-guide.pdf](docs/guide/CommsCentral-guide.pdf).

`pnpm infra:sip-creds` prints the app settings again.

## Admin UI

```sh
pnpm admin   # http://127.0.0.1:5170
```

Status, settings (ringing, quiet hours with time zone, blocked numbers, hidden-number handling, notifications), call log with costs and a block button, and voicemail playback. It has no login and binds to `127.0.0.1`. To reach it over your VPN, set `ADMIN_HOST` in `apps/admin/.env` to the machine's VPN address (for example its Tailscale IP). Never expose it to the internet.

Settings changed in the UI take effect on the next call. They live in a Twilio Sync document, not in Pulumi, so a redeploy doesn't overwrite them.

## Commands

| Command                | What it does                                                  |
| ---------------------- | ------------------------------------------------------------- |
| `pnpm bootstrap`       | Set up or reconfigure, then deploy                            |
| `pnpm infra:up`        | Build and deploy (after code changes)                         |
| `pnpm infra:preview`   | Show what a deploy would change                               |
| `pnpm infra:env`       | Rotate the admin UI's API key and rewrite its `.env`          |
| `pnpm infra:sip-creds` | Print the phone app settings                                  |
| `pnpm doctor`          | Check the whole setup against Twilio and explain any problem  |
| `pnpm infra:destroy`   | Remove everything except the phone number and geo permissions |
| `pnpm admin`           | Run the admin UI                                              |
| `pnpm check`           | Format check, typecheck and tests                             |

## Layout

```
packages/shared   settings schema and phone number helpers, used everywhere
functions/        Twilio Functions (TypeScript, bundled with esbuild)
infra/            Pulumi program with small dynamic resources for Twilio
apps/admin/       SvelteKit admin UI
scripts/          bootstrap and helper scripts
docs/             phone setup
```

## How it fits together

- The number's voice webhook is `/voice/inbound`. It rings the app (`<Dial><Sip>`), and `/voice/after-dial` sends anything unanswered to voicemail.
- The SIP Domain's voice URL is `/sip/outbound`. It normalizes what you dialled, checks it against the allowed countries, and dials out.
- `/voice/call-status` is the number's status callback. When a call ends with no answer and no message, it sends a missed-call notification.
- `/voice/voicemail-done` gets the recording and emails it to you (MP3 attached), or sends an SMS.
- `/alerts/usage` receives Twilio's monthly spend triggers. It is public (Twilio doesn't promise to sign usage trigger callbacks) and checks a secret token in its URL instead.
- All other functions are "protected": Twilio rejects requests without a valid Twilio signature.

## When something doesn't work

Run `pnpm doctor`. It checks, read-only: the account and balance, that the functions are deployed and protected, that the number and SIP domain point at them, the settings document, caller ID verification, geo permissions, spend alerts, the Resend key, and lists Twilio errors from the last 24 hours with links to their explanations.

## Limits

- Emergency and short numbers can't be called from the app. Use the mobile network.
- If the app has no data connection while travel mode is on, calls go to voicemail.
- Swiss local numbers may not support SMS. Use email for notifications.
