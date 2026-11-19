/** Human-readable phone and app settings, printed by bootstrap and `pnpm infra:sip-creds`. */
export function phoneSetupText(o: {
  sipDomain: string;
  sipUsername: string;
  sipPassword: string;
  sipTransport: string;
  phoneNumber: string;
}): string {
  const secure = o.sipTransport.startsWith('TLS');
  return `
Phone app (Groundwire or any SIP app with push notifications)
  Account type   Generic SIP account
  Username       ${o.sipUsername}
  Password       ${o.sipPassword}
  Domain         ${o.sipDomain}${secure ? ':5061' : ''}
  Transport      ${secure ? 'TLS' : 'UDP or TCP'}
  Media          ${secure ? 'SRTP required' : 'RTP'}
  Codecs         Opus, G.711 (PCMU)

Lower latency in Europe (optional): use ${o.sipDomain.replace('.sip.twilio.com', '.sip.frankfurt.twilio.com')}
as the domain. If the app can't register with it, go back to the plain domain.

Travel mode (dial on your mobile)
  On   **21*${o.phoneNumber}#
  Off  ##21#
`;
}
