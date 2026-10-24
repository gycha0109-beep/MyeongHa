/** Native browsers and React Native networking do not share an HttpOnly
 *  __Host- preenrollment cookie. Never copy the cookie, nonce, or PortOne
 *  verification ID to the native credential store or deep-link URL.
 *
 *  If A1 is enabled, start the approved WEB flow in the system browser.
 *  It can mint and consume one cookie inside its original first-party origin.
 *  The app can later use ordinary password login without age bypass.
 */
export const MOBILE_PREENROLLMENT_WEB_HANDOFF_V1 = Object.freeze({
  capabilityPath: '/api/identity-verifications/pre-enrollment/capability',
  webSignupPath: '/auth.html?mode=sign-up',
  productionOrigin: 'https://myeongha.vercel.app',
  browserCookieTransferred: false,
  nativePortOneSdkActive: false,
} as const);

export type MobilePreenrollmentDecisionV1 =
  | Readonly<{ kind: 'legacy'; webUrl: null }>
  | Readonly<{ kind: 'web_required'; webUrl: string }>
  | Readonly<{ kind: 'unavailable'; webUrl: null }>;

export async function resolveMobilePreenrollmentAdmissionV1(input: Readonly<{
  apiOrigin: string;
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
}>): Promise<MobilePreenrollmentDecisionV1> {
  // A browser handoff must NEVER navigate to a client-selected or insecure host.
  if (input.apiOrigin !== MOBILE_PREENROLLMENT_WEB_HANDOFF_V1.productionOrigin) {
    return Object.freeze({ kind: 'unavailable', webUrl: null });
  }
  try {
    const response = await input.fetchImpl(
      input.apiOrigin + MOBILE_PREENROLLMENT_WEB_HANDOFF_V1.capabilityPath,
      { method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return Object.freeze({ kind: 'unavailable', webUrl: null });
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('ok' in body) ||
        body.ok !== true || !('data' in body) || !body.data ||
        typeof body.data !== 'object' || !('available' in body.data) ||
        typeof body.data.available !== 'boolean') {
      return Object.freeze({ kind: 'unavailable', webUrl: null });
    }
    if (!body.data.available) return Object.freeze({ kind: 'legacy', webUrl: null });
    return Object.freeze({
      kind: 'web_required',
      webUrl: input.apiOrigin + MOBILE_PREENROLLMENT_WEB_HANDOFF_V1.webSignupPath,
    });
  } catch {
    return Object.freeze({ kind: 'unavailable', webUrl: null });
  }
}
