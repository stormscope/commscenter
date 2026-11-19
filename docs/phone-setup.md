# Phone setup

## 1. Install a SIP app

Recommended: **Groundwire** (Acrobits, iOS and Android, paid once). It keeps your registration in its own cloud and wakes the phone with a push notification, so calls ring even when the app is closed. That works with Twilio, which many free apps can't do reliably on iOS.

Free alternative: Linphone. It works for outbound calls and while the app is open, but incoming calls may be missed when the phone is locked.

## 2. Add the account

Run `pnpm infra:sip-creds` and enter what it prints:

| Field            | Value                                     |
| ---------------- | ----------------------------------------- |
| Account type     | Generic SIP account                       |
| Username         | from `infra:sip-creds` (default `me`)     |
| Password         | from `infra:sip-creds`                    |
| Domain           | `commscentral-xxxxxx.sip.twilio.com:5061` |
| Transport        | TLS                                       |
| Media encryption | SRTP (required)                           |
| Codecs           | Opus, PCMU (G.711 µ-law)                  |

In Groundwire, also set:

- Settings → Incoming calls → Push notifications: on.
- Dial plan: none needed. Swiss numbers can be dialled as `079...`, other countries as `0046...` or `+46...`.

## 3. Test

1. Call your CommsCentral number from another phone. The app rings.
2. Don't answer. After the ring time (default 25 seconds) the caller hears the greeting and can leave a message. You get an email with the recording.
3. From the app, call a Swiss number. The other side sees your mobile number (if you verified it during bootstrap) or the CommsCentral number.

## 4. Travel mode

Before you leave Switzerland, dial on your mobile:

```
**21*<CommsCentral number>#
```

For example `**21*+41445550000#`. Every call to your mobile is now forwarded inside Switzerland to CommsCentral, rings the app, and goes to CommsCentral voicemail if you don't answer. Your phone's SIM doesn't ring at all, so keep the app online (Wi-Fi or a local data SIM).

When you're back:

```
##21#
```

Most phones also have this under Settings → Phone → Call forwarding.

### At home (optional)

To replace your carrier's voicemail at home too, forward only when you don't answer, are busy or unreachable:

```
**61*<CommsCentral number>**20#   no answer after 20 seconds
**67*<CommsCentral number>#       busy
**62*<CommsCentral number>#       unreachable
```

Remove them all with `##002#`.

Don't use these while roaming: the call would first be routed to you abroad and then back, which is the cost you want to avoid. Use travel mode instead.

### Check with your carrier

Forwarding to a Swiss number is normally billed as a national call and included in unlimited Swiss plans. If your plan doesn't include it, each forwarded minute costs the national rate.

## Data use

A call uses about 0.5 to 1 MB per minute. Use Wi-Fi or a local data SIM when abroad rather than roaming data.
