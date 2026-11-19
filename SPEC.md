# CommsCentral: Specification (v0.3, draft)

Status: draft for review. No implementation yet.
Owner: Fabian (single user).
Date: 2026-11-19
Changes in v0.3: rebuilt around the three concrete use cases (section 2). The design is now "app first": an off-the-shelf SIP app on the phone is the main device, and forwarding to the mobile network, dial-in and callback moved to "later". Added rates to Sweden and Turkey and a comparison with a Swiss SIP provider and with the carrier.

## 1. Purpose

CommsCentral is a minimal, personal phone setup on Twilio, used mainly in Switzerland. It gives Fabian:

- a Swiss phone number in the cloud,
- an off-the-shelf phone app (SIP client) on his mobile that makes and receives calls over Wi-Fi or data through that number,
- its own voicemail, so missed calls never touch the mobile carrier's voicemail,
- cheap international calls (a few cents per minute instead of about 1 CHF).

Everything is deployed from code. Console clicking is limited to one-time steps that cannot be automated.

## 2. Use cases

| # | Situation | What happens | Why it saves money |
|---|---|---|---|
| U1 | Abroad (e.g. Turkey), calling Swiss numbers | Fabian calls from the SIP app over Wi-Fi or local data. Twilio places the call from Switzerland. | No roaming call. Cost is Twilio's Swiss rate plus a little data. |
| U2 | Abroad, someone calls Fabian's normal Swiss mobile number | Before travelling, Fabian sets an unconditional forward on his mobile to the CommsCentral number. The call stays in Switzerland, rings the SIP app, and goes to CommsCentral voicemail if he doesn't answer. | The call is never routed to Turkey and back, and the carrier's voicemail is never involved. |
| U3 | In Switzerland, calling family in Sweden (or anywhere abroad) | Fabian calls from the SIP app. | About 0.08 USD/min to a Swedish mobile instead of 0.60 to 0.90 CHF/min with Swisscom. |

All three use the same small set of parts: one Twilio number, one SIP Domain, one app, a few functions, voicemail.

## 3. Is this too complex?

No, as long as v1 stays at the scope below. The v0.1 draft had six call paths, and v1 now has three:

1. **App calls out:** app → Twilio → any number, with Fabian's caller ID.
2. **Number rings the app:** call to the CommsCentral number (directly or forwarded from the mobile) → app → voicemail if unanswered.
3. **Voicemail:** record and send a notification.

This is about 4 small functions, one Pulumi program and a small settings page. The app itself is bought, not built.

**The simpler alternative, with no code at all:** a Swiss SIP provider such as sipcall.ch or peoplefone gives you a Swiss number, voicemail and a SIP account for the same app, configured in their web portal. You give up infrastructure as code and pay more per minute on the routes that matter (section 9.3), but nothing has to be built. If Fabian is on Salt, its Wi-Fi Calling also works abroad (see 9.4), which covers part of U1 and U2 with no setup at all.

**Recommendation:** build CommsCentral at v1 scope. It's small, it's cheaper per minute than the off-the-shelf provider on mobile and Swedish routes, and it stays fully in code. If even that is more than wanted, use sipcall.ch with the same app.

## 4. Scope

### v1

| # | Capability |
|---|---|
| F1 | Swiss Twilio number (regulatory bundle approved once). |
| F2 | Twilio SIP Domain with one registered user for the phone app. |
| F3 | Outbound from the app to any allowed country, with Fabian's own mobile number shown as caller ID (verified once in Twilio), or the CommsCentral number as fallback. |
| F4 | Inbound to the number rings the app. Unanswered, busy or app offline → CommsCentral voicemail. |
| F5 | Voicemail: greeting, recording, notification by email (and optionally SMS). |
| F6 | "Travel mode" as a documented phone code: unconditional forward of the mobile to the CommsCentral number, and a code to turn it off. |
| F7 | Minimal admin UI (local, VPN only): settings, call log, voicemail playback. |
| F8 | Cost guardrails: voice geo permissions limited to chosen countries, spend alerts. |

### Later (designed for, not built in v1)

- Ring the mobile's normal SIM as well as the app, with "press 1 to accept" so the carrier's voicemail can't pick up. Useful when there's no data.
- Dial-in access number with PIN, and callback by SMS. Also only useful without data.
- Inbound SMS forwarding and SMS commands.
- Do-not-disturb schedule. Voicemail transcription.
- Multiple users, ring groups, IVR. Porting the mobile number into Twilio.
- A hosted UI with real authentication.

The settings schema already uses a list of ring targets, so ring groups or the mobile SIM are additions, not a rewrite.

## 5. Key facts that shape the design

1. **Unconditional forwarding is what avoids the roaming loop.** With "no answer" or "busy" forwarding, the call first goes to the phone in Turkey and is then diverted back, which is exactly the costly loop. Unconditional forwarding (`**21*`) is applied in the Swiss network before the call tries to reach the phone. So travel mode uses unconditional forwarding. At home, Fabian can leave forwarding off, or use conditional forwarding to replace the carrier voicemail, since there is no roaming at home.
2. **The forwarded leg is charged by the carrier.** A forward to a Swiss number is usually billed as a national call from Fabian's plan, which is included in most unlimited Swiss plans. Check with his carrier (Q2).
3. **The original caller's number normally comes through on a forward.** So the app shows who is calling, not just "forwarded call".
4. **The phone app needs proper push support to ring reliably when the phone is locked**, especially on iOS. Not every SIP app does this with Twilio. Groundwire (Acrobits) keeps the registration in its own cloud and sends a push to the phone, and that works with any SIP server including Twilio. Linphone's push needs the provider's server to cooperate, which Twilio doesn't. Recommendation: Groundwire (Q5).
5. **Data use while abroad** is about 0.5 to 1 MB per minute of call. On Wi-Fi or a cheap local eSIM it's negligible. On Swiss roaming data it may not be.
6. **Twilio Functions are public HTTPS endpoints.** They are protected by Twilio's request signatures, not a VPN. Only the admin UI is behind the VPN.

## 6. Architecture

```
  Swiss caller ──► Fabian's Swiss mobile number
                       │  (travel mode: unconditional forward, stays in CH)
                       ▼
  Caller ─────────► CommsCentral number (Twilio, +41)
                       │ voice webhook
                       ▼
            ┌───────────────────────────┐      ┌──────────────────────┐
            │ Twilio Functions (TS)     │◄────►│ Twilio Sync doc      │
            │  /voice/inbound           │      │ "settings"           │
            │  /voice/after-dial        │      └──────────────────────┘
            │  /voice/voicemail-done    │
            │  /sip/outbound            │─────► email / SMS notification
            └───────────────────────────┘
                 │ <Dial><Sip>     ▲ SIP INVITE (outbound)
                 ▼                 │
            ┌───────────────────────────┐
            │ Twilio SIP Domain         │◄──── SIP app on phone (Groundwire)
            │ commscentral-x.sip.twilio │      registers over Wi-Fi/data
            └───────────────────────────┘
                 │ outbound via /sip/outbound
                 ▼
            Any number (CH, SE, TR, ...) shown with Fabian's caller ID

  Laptop or tailnet host (VPN only): Admin UI (SvelteKit), Twilio API key
  infra/ (Pulumi, TS): everything above except the app and the phone codes
```

### 6.1 Components

| Component | Tech | Hosting |
|---|---|---|
| Call logic | Twilio Functions, written in TypeScript | Twilio Serverless |
| Runtime settings | Twilio Sync document `settings`, validated with a shared zod schema | Twilio |
| Secrets | Serverless environment variables, set by Pulumi from encrypted Pulumi secrets | Twilio |
| Phone app | Groundwire (or another SIP app with push) | Fabian's phone |
| Admin UI | SvelteKit + TypeScript | Laptop or a tailnet machine |
| IaC | Pulumi, TypeScript | Pulumi state backend |

### 6.2 Settings document, v1 schema

```ts
type Settings = {
  version: 1;
  owner: {
    mobile: string;              // E.164, Fabian's Swiss mobile
    outboundCallerId: "mobile" | "twilio"; // "mobile" needs one-time verification
  };
  inbound: {
    mode: "ring" | "voicemail";  // "voicemail" = straight to voicemail
    targets: Array<{ kind: "sip" | "pstn"; address: string; enabled: boolean }>; // v1: one sip target
    ringTimeoutSec: number;      // default 25
  };
  voicemail: {
    greeting: { kind: "tts"; text: string; language: string; voice: string } | { kind: "asset"; path: string };
    maxLengthSec: number;        // default 120
    notify: { email: string | null; sms: boolean };
  };
  outbound: {
    allowedPrefixes: string[];   // e.g. ["+41", "+46", "+90"], mirrors geo permissions
  };
};
```

Pulumi creates the document with defaults once and then leaves its data alone. The admin UI owns the values, and Pulumi owns everything structural.

## 7. Call flows

### 7.1 Outbound from the app (U1, U3)

1. Fabian dials in Groundwire, e.g. `0046701234567`, `+46...` or a Swiss `079...`.
2. The app sends a SIP INVITE to the SIP Domain, authenticated with the SIP credentials. Twilio calls `/sip/outbound`.
3. The function normalizes the number to E.164 (Swiss national format assumed for numbers starting with a single 0), checks it against `allowedPrefixes`, and returns `<Dial callerId=...><Number>...</Number></Dial>`.
4. The caller ID is Fabian's verified mobile number if `outboundCallerId = mobile` (people see his usual number and call back to it), otherwise the CommsCentral number.

### 7.2 Inbound to the app (U2 and direct calls)

1. A call reaches the CommsCentral number, directly or forwarded from the mobile. Twilio calls `/voice/inbound`.
2. If `mode = voicemail`, go straight to voicemail.
3. Otherwise `<Dial timeout={ringTimeoutSec} answerOnBridge="true" action="/voice/after-dial">` with a `<Sip>` element for the registered app user. Caller ID shown in the app is the original caller.
4. `/voice/after-dial`: if the call was not answered (no answer, busy, failed, app not registered), go to voicemail.

Loop guard: if a call to the number comes from Fabian's own mobile, it doesn't ring the app. It goes to a short menu: "press 1 for voicemail playback" (later) or straight to voicemail in v1.

### 7.3 Voicemail (F5)

1. Play the greeting (TTS in the configured language, or an uploaded audio file), then `<Record maxLength=... recordingStatusCallback="/voice/voicemail-done">`.
2. `/voice/voicemail-done` sends an email with caller, time, duration and a link to the recording (optionally the audio as an attachment) and, if enabled, an SMS.
3. Recordings stay in Twilio. The admin UI lists, plays and deletes them.

Email sending: Resend free tier or SMTP of an existing mailbox (Q3). Push to the app itself is not needed: Groundwire shows missed calls, and the email covers voicemails.

### 7.4 Travel mode (U2)

Documented in `docs/phone-setup.md`, no console clicking:

- Before travelling: dial `**21*<CommsCentral number>#` (unconditional forward).
- Back home: `##21#`.
- Optional at home: forward only busy, no answer and unreachable (`**67*`, `**61*...**20#`, `**62*`) to the number, so the carrier voicemail is replaced there too.
- Many iPhones and Androids also expose this as a "Call Forwarding" switch in settings, which does the same thing.

While travel mode is on, the phone's SIM doesn't ring at all, so the app must be registered and on Wi-Fi or data. Missed calls still end up in CommsCentral voicemail.

## 8. Admin UI

- **Stack:** SvelteKit, TypeScript, plain CSS or Pico CSS.
- **Runs:** `pnpm admin` on the laptop or as a service on a tailnet machine. Binds to `127.0.0.1` by default, or to the tailnet interface via an env var. No login: the network is the boundary.
- **Credentials:** a Twilio API key in a git-ignored `.env`, written by `pnpm infra:env`. Only server routes use it.
- **Pages:** Settings (the Sync document as a form), Calls (recent calls with duration and cost), Voicemail (play, delete), Status (number, SIP registration state, month-to-date spend).

The UI is a convenience. Everything works without it.

## 9. Cost

All Twilio figures are USD list prices checked 2026-11-19 on [Twilio Voice CH](https://www.twilio.com/en-us/voice/pricing/ch), [Twilio Voice SE](https://www.twilio.com/en-us/voice/pricing/se), [Twilio Voice TR](https://www.twilio.com/en-us/voice/pricing/tr), [Twilio SMS CH](https://www.twilio.com/en-us/sms/pricing/ch) and [Twilio pricing](https://www.twilio.com/en-us/pricing). Items marked * are Twilio's general rates, not confirmed on the Swiss page.

### 9.1 Unit prices

| Item | Twilio price |
|---|---|
| Swiss local number | 1.15 / month |
| Inbound to the number | 0.0100 / min |
| SIP app leg (each direction) | 0.0040 / min |
| Outbound to Swiss landline | 0.0419 / min |
| Outbound to Swiss mobile | 0.1802 / min (some routes 0.2516) |
| Outbound to Swedish landline | 0.0187 / min |
| Outbound to Swedish mobile | 0.0714 / min |
| Outbound to Turkish landline | 0.0701 / min |
| Outbound to Turkish mobile | 0.2875 / min |
| Call recording * | 0.0025 / min |
| Recording storage * | 0.0005 / min / month |
| SMS to a Swiss mobile (optional notifications) | 0.0769 each |
| Functions * | 10,000 invocations / month free, then 0.0001 each |
| Sync | not published on the pages checked; cents at this volume (to verify) |

Twilio prices calls by destination, not by where Fabian is. A call from the app in Turkey to a Swiss mobile costs the same as from Zurich.

### 9.2 Per minute, by use case

| Use case | Calculation | Per minute |
|---|---|---|
| U1: from abroad to a Swiss landline / mobile | 0.004 + 0.0419 / 0.1802 | **~0.05 / ~0.18** |
| U2: forwarded call answered in the app | 0.010 + 0.004 (+ carrier forward, usually in plan) | **~0.014** |
| U2: missed call, 1-minute voicemail, email alert | 0.010 + 0.0025 | **~0.013 per voicemail** |
| U3: from Switzerland to a Swedish landline / mobile | 0.004 + 0.0187 / 0.0714 | **~0.02 / ~0.08** |

### 9.3 Compared with the alternatives

Per-minute prices, without connection fees:

| Route | CommsCentral (Twilio, USD) | sipcall.ch (CHF, price list from 2020, to recheck) | Swisscom mobile, no option (CHF) |
|---|---|---|---|
| CH → Swedish mobile | ~0.08 | 0.39 + connection fee | 0.90 (blue Mobile S/M), 0.60 (NATEL infinity), included in blue L/XL |
| CH → Swedish landline | ~0.02 | 0.049 + connection fee | same as above |
| CH → Swiss mobile | ~0.18 | 0.219 to 0.239 + 0.045 per call | usually included in plan |
| CH → Swiss landline | ~0.05 | 0.019 to 0.029 + 0.045 per call | usually included in plan |
| Monthly base | 1.15 | 18.90 business base + 1.90 number + 5 voicemail (private plans may differ) | none |

Sources: [sipcall price list](https://www.sipcall.ch/wAssets/downloads/docs/Preisliste_sipcall.pdf) (dated September 2020), [Swisscom rates from Switzerland abroad](https://www.swisscom.ch/de/privatkunden/mobile-handy-abo/auslandstarife-roaming/tarife-von-der-schweiz-ins-ausland.html).

Conclusion: Twilio is cheaper than the Swiss SIP provider on every route except Swiss landlines, and much cheaper than the carrier for Sweden. Wholesale SIP carriers (e.g. Telnyx) can be somewhat cheaper again on some routes, but at personal volumes the difference is cents a month and not worth a second provider. If Fabian's mobile plan already includes Sweden (Swisscom blue L/XL, for example), U3 is free on the normal phone, and CommsCentral only matters for U1 and U2.

### 9.4 Carrier Wi-Fi Calling as a partial alternative

According to [internet-offer.ch](https://www.internet-offer.ch/de/guide/wifi-calling) (June 2026) and [Comparis](https://www.comparis.ch/telecom/mobile/handynutzung/wifi-calling), Swisscom and Sunrise don't offer Wi-Fi Calling abroad. Salt does, and treats it largely like being in Switzerland, though calls to Switzerland may cost extra without an international allowance. If Fabian is on Salt, check this first: it may cover U1 and U2 with no setup at all.

### 9.5 Monthly estimate

| Component | Monthly |
|---|---|
| Swiss number | 1.15 |
| Functions, Sync, Pulumi Cloud free tier, Resend free tier, admin UI on own machine | ~0 |
| **Fixed baseline** | **~1.15 USD** |

One-off: Groundwire app (paid, roughly 10 USD, to verify). Swiss number regulatory bundle: no fee, needs a Swiss address and ID.

| Example month | Usage | Total (USD) |
|---|---|---|
| At home | 60 min to Swedish mobiles, 20 min to Swedish landlines, 3 voicemails | 1.15 + 4.52 + 0.45 + 0.04 = **~6** |
| Two weeks in Turkey | 60 min out to Swiss mobiles, 30 min out to Swiss landlines, 60 min forwarded calls answered in the app, 10 voicemails | 1.15 + 11.05 + 1.38 + 0.84 + 0.13 = **~15** |
| Busy month | 300 min to Swedish mobiles, 120 min abroad to Swiss mobiles, 120 min forwarded in | 1.15 + 22.62 + 22.10 + 1.68 = **~48** |

Calls to Swiss mobiles from abroad (0.18 / min) are the biggest cost driver. Everything else is a few cents a minute.

### 9.6 If a server becomes necessary

Not expected. If a hosted UI is wanted later: an always-on tailnet device (0 extra), Cloudflare Workers/Pages behind Cloudflare Access (free tier), or a small VPS on Tailscale (about 4 to 5 EUR / month).

## 10. Infrastructure as code

### 10.1 Choice: Pulumi with TypeScript

| | Terraform | Pulumi (TS) |
|---|---|---|
| Twilio provider | Official `twilio/twilio`, generated from the API | No first-party provider; small dynamic resources over the Twilio Node SDK |
| Deploying function code | Not supported; needs a separate Twilio CLI step | `@twilio-labs/serverless-api` called from the program; one `pulumi up` does build, deploy and wiring |
| Language | HCL | TypeScript, same pnpm workspace, shares the settings schema |

**Pulumi**, because the most frequently changed part (function code) can't be deployed through the Terraform provider, so Terraform would need a second tool anyway. The price is a handful of thin dynamic resources in `infra/resources/` (number webhooks, SIP domain and credentials, Sync doc, geo permissions, usage triggers, verified caller ID check).

State: Pulumi Cloud free individual tier, or a local file backend with a passphrase (Q6).

### 10.2 What is automated

| Item | How |
|---|---|
| Twilio account, billing | Manual, once |
| Regulatory bundle for the Swiss number | Manual, once, in Twilio console |
| Buying the number | Script after the bundle is approved; Pulumi then adopts it |
| Verifying the mobile number as caller ID | One verification call, started by a script, Fabian enters the code |
| Functions, env vars, number webhooks, SIP domain, credentials, Sync doc, geo permissions, spend alerts | Pulumi |
| Travel mode forward | Phone code, documented |
| App setup | Manual in the app; `pnpm infra:sip-creds` prints domain, user and password (QR code possible later) |

### 10.3 Commands

```
pnpm install
pnpm build            # functions + admin
pnpm test             # unit tests
pnpm infra:preview    # pulumi preview
pnpm infra:up         # deploy everything
pnpm infra:env        # write apps/admin/.env from stack outputs
pnpm infra:sip-creds  # show SIP app settings
pnpm admin            # run the admin UI locally
```

## 11. Security and abuse prevention

- Functions are "protected" (Twilio signature validation).
- SIP Domain: credential auth with a long generated password. An IP allow-list isn't practical because the phone's IP changes, so the password is the main control. Registration and calls only over TLS/SRTP.
- Voice geo permissions only for countries in `allowedPrefixes` (start with CH, SE, TR and a few EU countries). No premium-rate numbers.
- Spend alerts via Twilio usage triggers, e.g. at 20 and 50 USD per month.
- Admin UI uses a scoped API key and binds to localhost or the tailnet only. No secrets in the repo.

## 12. Repository layout

```
commscentral/
  SPEC.md  README.md
  package.json  pnpm-workspace.yaml  tsconfig.base.json
  packages/shared/        # settings schema, E.164 normalization
  functions/              # Twilio Serverless project (TS)
    src/functions/voice/  src/functions/sip/
    src/lib/twiml/        # pure TwiML builders, unit tested
  apps/admin/             # SvelteKit admin UI
  infra/                  # Pulumi program + dynamic resources
  docs/phone-setup.md     # travel mode codes, Groundwire setup
  .github/workflows/ci.yml  # typecheck, lint, test (no auto-deploy)
```

Tooling: pnpm workspaces, TypeScript strict, Vitest, Prettier, svelte-check, Node 22+.

## 13. Testing

- Unit: TwiML builders, number normalization, prefix allow-list, settings schema, dynamic resources against a mocked Twilio client.
- Manual acceptance (README checklist): app outbound to CH and SE with the right caller ID; direct call rings the app; travel-mode forward rings the app with the original caller ID; unanswered and app-offline calls go to voicemail and send an email; disallowed country is refused; spend alert fires.

## 14. Milestones

| M | Content | Covers |
|---|---|---|
| M0 | Repo scaffold, Pulumi stack, hello function deployed | `pnpm infra:up` works from scratch |
| M1 | Number, SIP Domain, app registered, outbound with caller ID | U1, U3 |
| M2 | Inbound to app, voicemail with email, travel-mode docs | U2 |
| M3 | Guardrails (geo permissions, spend alerts) | safety |
| M4 | Admin UI | convenience |

M1 alone already delivers the cheap Sweden calls and calls home from abroad.

## 15. Open questions

- **Q1. Number:** a Swiss local number (recommended, 1.15 USD / month, needs a Swiss address for the regulatory bundle).
- **Q2. Carrier:** Swisscom, Sunrise or Salt, and which plan? This decides whether forwarding to a Swiss number is included, whether Sweden is already included (U3), and whether Salt Wi-Fi Calling already covers U1 and U2.
- **Q3. Voicemail notification:** email via Resend free tier, via an existing mailbox (SMTP), or SMS?
- **Q4. Caller ID:** show Fabian's own mobile number on outbound calls (recommended), or the CommsCentral number?
- **Q5. Phone OS and app:** iPhone or Android? Recommendation: Groundwire.
- **Q6. Pulumi state:** Pulumi Cloud free tier or local file backend?
- **Q7. Admin UI host:** laptop only, or an always-on tailnet device?
