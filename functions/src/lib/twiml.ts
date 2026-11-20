import twilio from 'twilio';
import {
  checkDestination,
  isAnonymous,
  isBlocked,
  isQuietTime,
  normalizeNumber,
  type Settings,
} from '@commscentral/shared';

const { VoiceResponse } = twilio.twiml;
type Response = InstanceType<typeof VoiceResponse>;

export const PATHS = {
  afterDial: '/voice/after-dial',
  screen: '/voice/screen',
  screenResult: '/voice/screen-result',
  hangup: '/voice/hangup',
  voicemailDone: '/voice/voicemail-done',
} as const;

function sayMessage(response: Response, settings: Settings, text: string): void {
  const g = settings.voicemail.greeting;
  if (g.kind === 'tts') {
    response.say({ voice: g.voice as never, language: g.language as never }, text);
  } else {
    response.say(text);
  }
}

/** Greeting, then record. The recording callback sends the notification. */
export function voicemail(settings: Settings, response: Response = new VoiceResponse()): Response {
  const g = settings.voicemail.greeting;
  if (g.kind === 'tts') {
    response.say({ voice: g.voice as never, language: g.language as never }, g.text);
  } else {
    response.play(g.url);
  }
  response.record({
    maxLength: settings.voicemail.maxLengthSec,
    playBeep: true,
    finishOnKey: '#',
    trim: 'trim-silence',
    action: PATHS.hangup,
    recordingStatusCallback: PATHS.voicemailDone,
    recordingStatusCallbackEvent: ['completed'],
  });
  response.hangup();
  return response;
}

export type InboundDecision = 'reject' | 'voicemail' | 'ring';

/**
 * What to do with an inbound call, in order: blocked callers are rejected, the owner
 * and quiet hours go to voicemail, hidden numbers follow the anonymous rule.
 */
export function decideInbound(
  settings: Settings,
  event: { From?: string },
  now: Date = new Date(),
): InboundDecision {
  if (isBlocked(event.From, settings.screening.blocked)) return 'reject';
  if (isAnonymous(event.From) && settings.screening.anonymous !== 'ring') {
    return settings.screening.anonymous === 'reject' ? 'reject' : 'voicemail';
  }
  // Fabian calling his own CommsCentral number: ringing his own app makes no sense.
  if (event.From === settings.owner.mobile) return 'voicemail';
  if (settings.inbound.mode === 'voicemail') return 'voicemail';
  if (isQuietTime(now, settings.quietHours)) return 'voicemail';
  return 'ring';
}

/** Inbound call to the CommsCentral number: ring the app (and any other targets), else voicemail. */
export function inbound(
  settings: Settings,
  event: { From?: string; ForwardedFrom?: string },
  now: Date = new Date(),
): Response {
  const response = new VoiceResponse();
  const decision = decideInbound(settings, event, now);
  if (decision === 'reject') {
    // A busy signal tells the caller nothing, and costs nothing.
    response.reject({ reason: 'busy' });
    return response;
  }
  if (decision === 'voicemail') return voicemail(settings, response);

  // Never ring the number a call was just forwarded from (travel mode), or it loops back here.
  // Carriers send ForwardedFrom in different formats, so normalize it first.
  const fwd = event.ForwardedFrom ? normalizeNumber(event.ForwardedFrom) : null;
  const forwardedFrom = fwd?.ok ? fwd.e164 : null;
  const targets = settings.inbound.targets.filter(
    (t) => t.enabled && !(t.kind === 'pstn' && t.address === forwardedFrom),
  );

  if (targets.length === 0) return voicemail(settings, response);

  const dial = response.dial({
    timeout: settings.inbound.ringTimeoutSec,
    answerOnBridge: true,
    action: PATHS.afterDial,
    method: 'POST',
  });
  for (const target of targets) {
    if (target.kind === 'sip') {
      dial.sip(target.address);
    } else {
      // A mobile SIM can be answered by the carrier's voicemail, so ask for a key press first.
      dial.number({ url: PATHS.screen, method: 'POST' }, target.address);
    }
  }
  return response;
}

/** After the <Dial> ends: anything but an answered call goes to voicemail. */
export function afterDial(settings: Settings, event: { DialCallStatus?: string }): Response {
  if (event.DialCallStatus === 'completed') {
    const response = new VoiceResponse();
    response.hangup();
    return response;
  }
  return voicemail(settings);
}

/** Whisper played to a mobile SIM target before bridging. */
export function screen(settings: Settings, event: { From?: string }): Response {
  const response = new VoiceResponse();
  const gather = response.gather({
    numDigits: 1,
    timeout: 6,
    action: PATHS.screenResult,
    method: 'POST',
  });
  const from = event.From ? event.From.split('').join(' ') : 'an unknown number';
  const g = settings.voicemail.greeting;
  const opts = g.kind === 'tts' ? { voice: g.voice as never, language: g.language as never } : {};
  gather.say(opts, `CommsCentral call from ${from}. Press 1 to accept.`);
  response.hangup();
  return response;
}

export function screenResult(event: { Digits?: string }): Response {
  const response = new VoiceResponse();
  // An empty response bridges the call; hanging up lets the caller fall through to voicemail.
  if (event.Digits !== '1') response.hangup();
  return response;
}

export function hangup(): Response {
  const response = new VoiceResponse();
  response.hangup();
  return response;
}

const REFUSALS = {
  empty: 'No number was dialled.',
  'short-number':
    'Short and emergency numbers cannot be called here. Please use your mobile network.',
  invalid: 'That number is not valid. Please dial it in international format.',
  'blocked-premium': 'Premium rate numbers are blocked.',
  'country-not-allowed': 'Calls to this country are not enabled in CommsCentral.',
} as const;

/** Outbound call from the SIP app. */
export function sipOutbound(
  settings: Settings,
  event: { To?: string },
  opts: { twilioNumber: string; defaultCountryCode?: string },
): Response {
  const response = new VoiceResponse();
  const normalized = normalizeNumber(event.To ?? '', opts.defaultCountryCode);
  if (!normalized.ok) {
    sayMessage(response, settings, REFUSALS[normalized.reason]);
    response.hangup();
    return response;
  }
  const check = checkDestination(normalized.e164, settings.outbound.allowedPrefixes);
  if (!check.allowed) {
    sayMessage(response, settings, REFUSALS[check.reason]);
    response.hangup();
    return response;
  }
  const callerId =
    settings.owner.outboundCallerId === 'mobile' ? settings.owner.mobile : opts.twilioNumber;
  const dial = response.dial({ callerId, answerOnBridge: true });
  dial.number(normalized.e164);
  return response;
}
