import { describe, expect, it } from 'vitest';
import {
  afterDial,
  inbound,
  screen,
  screenResult,
  sipOutbound,
  voicemail,
} from '../src/lib/twiml.js';
import { NUMBER, OWNER, SIP, settings } from './helpers.js';

describe('inbound', () => {
  it('rings the SIP app with a timeout and an after-dial action', () => {
    const xml = inbound(settings(), { From: '+41449999999' }).toString();
    expect(xml).toContain(
      '<Dial timeout="25" answerOnBridge="true" action="/voice/after-dial" method="POST">',
    );
    expect(xml).toContain(`<Sip>${SIP}</Sip>`);
  });

  it('screens mobile SIM targets', () => {
    const s = settings((x) => {
      x.inbound.targets.push({ kind: 'pstn', address: OWNER, enabled: true });
    });
    const xml = inbound(s, { From: '+41449999999' }).toString();
    expect(xml).toContain(`<Number url="/voice/screen" method="POST">${OWNER}</Number>`);
  });

  it('does not ring the mobile a call was forwarded from (travel mode loop guard)', () => {
    const s = settings((x) => {
      x.inbound.targets.push({ kind: 'pstn', address: OWNER, enabled: true });
    });
    const xml = inbound(s, { From: '+41449999999', ForwardedFrom: OWNER.slice(1) }).toString();
    expect(xml).toContain('<Sip>');
    expect(xml).not.toContain('<Number');
  });

  it('goes to voicemail in voicemail mode', () => {
    const xml = inbound(
      settings((x) => (x.inbound.mode = 'voicemail')),
      {},
    ).toString();
    expect(xml).not.toContain('<Dial');
    expect(xml).toContain('<Record');
  });

  it('goes to voicemail when no target is enabled', () => {
    const xml = inbound(
      settings((x) => (x.inbound.targets[0]!.enabled = false)),
      {},
    ).toString();
    expect(xml).toContain('<Record');
  });

  it('goes to voicemail when the owner calls the number', () => {
    expect(inbound(settings(), { From: OWNER }).toString()).toContain('<Record');
  });
});

describe('voicemail', () => {
  it('says the greeting and records with a status callback', () => {
    const xml = voicemail(settings()).toString();
    expect(xml).toContain(
      '<Say voice="Polly.Amy" language="en-GB">Hello, you have reached Fabian.',
    );
    expect(xml).toContain('maxLength="120"');
    expect(xml).toContain('recordingStatusCallback="/voice/voicemail-done"');
    expect(xml).toContain('action="/voice/hangup"');
  });

  it('plays an audio greeting', () => {
    const s = settings(
      (x) => (x.voicemail.greeting = { kind: 'url', url: 'https://x.test/g.mp3' }),
    );
    expect(voicemail(s).toString()).toContain('<Play>https://x.test/g.mp3</Play>');
  });
});

describe('afterDial', () => {
  it('hangs up after an answered call', () => {
    expect(afterDial(settings(), { DialCallStatus: 'completed' }).toString()).toContain(
      '<Hangup/>',
    );
  });
  it.each(['no-answer', 'busy', 'failed', 'canceled'])('voicemail on %s', (status) => {
    expect(afterDial(settings(), { DialCallStatus: status }).toString()).toContain('<Record');
  });
});

describe('screening', () => {
  it('asks for a key press', () => {
    const xml = screen(settings(), { From: '+41449999999' }).toString();
    expect(xml).toContain('<Gather numDigits="1" timeout="6" action="/voice/screen-result"');
    expect(xml).toContain('Press 1 to accept.');
  });
  it('bridges on 1 and hangs up otherwise', () => {
    expect(screenResult({ Digits: '1' }).toString()).not.toContain('Hangup');
    expect(screenResult({ Digits: '2' }).toString()).toContain('<Hangup/>');
    expect(screenResult({}).toString()).toContain('<Hangup/>');
  });
});

describe('sipOutbound', () => {
  const to = (n: string) => ({ To: `sip:${n}@commscentral-test.sip.twilio.com;user=phone` });

  it('dials an allowed number with the CommsCentral caller ID', () => {
    const xml = sipOutbound(settings(), to('0046701234567'), { twilioNumber: NUMBER }).toString();
    expect(xml).toContain(
      `<Dial callerId="${NUMBER}" answerOnBridge="true"><Number>+46701234567</Number></Dial>`,
    );
  });

  it('uses the owner mobile as caller ID when configured', () => {
    const s = settings((x) => (x.owner.outboundCallerId = 'mobile'));
    const xml = sipOutbound(s, to('0791234567'), { twilioNumber: NUMBER }).toString();
    expect(xml).toContain(`callerId="${OWNER}"`);
    expect(xml).toContain('<Number>+41791234567</Number>');
  });

  it('refuses countries that are not allowed', () => {
    const xml = sipOutbound(settings(), to('+905321234567'), { twilioNumber: NUMBER }).toString();
    expect(xml).not.toContain('<Dial');
    expect(xml).toContain('not enabled');
  });

  it('refuses emergency numbers with a hint', () => {
    const xml = sipOutbound(settings(), to('112'), { twilioNumber: NUMBER }).toString();
    expect(xml).toContain('mobile network');
  });
});
