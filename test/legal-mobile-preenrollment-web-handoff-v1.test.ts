import { describe, expect, it, vi } from 'vitest';
import {
  MOBILE_PREENROLLMENT_WEB_HANDOFF_V1,
  resolveMobilePreenrollmentAdmissionV1,
} from '../apps/mobile/src/core/auth/mobile-preenrollment-web-handoff.js';
import { readFileSync } from 'node:fs';

const origin = MOBILE_PREENROLLMENT_WEB_HANDOFF_V1.productionOrigin;
const input = (data: unknown, status = 200) => ({
  apiOrigin: origin,
  fetchImpl: vi.fn(async () => Response.json(data, { status })),
});

describe('Legal A1 native-to-web preenrollment admission', () => {
  it('keeps native legacy signup unchanged with server OFF', async () => {
    const fixture = input({ ok: true, data: { available: false } });
    const result = await resolveMobilePreenrollmentAdmissionV1(fixture);
    expect(result).toEqual({ kind: 'legacy', webUrl: null });
    expect(fixture.fetchImpl).toHaveBeenCalledWith(
      origin + '/api/identity-verifications/pre-enrollment/capability',
      { method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' } },
    );
  });

  it('only opens a fixed first-party HTTPS signup, never attempts to export age proof', async () => {
    const fixture = input({ ok: true, data: { available: true } });
    const result = await resolveMobilePreenrollmentAdmissionV1(fixture);
    expect(result).toEqual({ kind: 'web_required',
      webUrl: 'https://myeongha.vercel.app/auth.html?mode=sign-up' });
    expect(MOBILE_PREENROLLMENT_WEB_HANDOFF_V1.browserCookieTransferred).toBe(false);
    expect(MOBILE_PREENROLLMENT_WEB_HANDOFF_V1.nativePortOneSdkActive).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/identityVerificationId|nonce|cookie|token/i);
  });

  it('fails closed on malformed status, API outages or untrusted origins', async () => {
    for (const data of [null, {}, { ok: true }, { ok: true, data: { available: 'true' } }]) {
      expect(await resolveMobilePreenrollmentAdmissionV1(input(data)))
        .toEqual({ kind: 'unavailable', webUrl: null });
    }
    expect(await resolveMobilePreenrollmentAdmissionV1(input({ ok: false }, 503)))
      .toEqual({ kind: 'unavailable', webUrl: null });
    const send = vi.fn();
    expect(await resolveMobilePreenrollmentAdmissionV1({
      apiOrigin: 'https://attacker.invalid', fetchImpl: send,
    })).toEqual({ kind: 'unavailable', webUrl: null });
    expect(send).not.toHaveBeenCalled();
  });

  it('prechecks signup/social before guest credential acquisition and preserves ordinary login', () => {
    const hook = readFileSync(new URL(
      '../apps/mobile/src/features/my/use-mobile-member-auth.tsx', import.meta.url,
    ), 'utf8');
    const signup = hook.slice(hook.indexOf('  const signUp = useCallback('));
    const social = hook.slice(hook.indexOf('  const signInWithSocial = useCallback('));
    expect(signup.indexOf('await requireWebPreenrollment()'))
      .toBeLessThan(signup.indexOf('mobileNewMemberEnrollmentServiceV1.start('));
    expect(social.indexOf('await requireWebPreenrollment()'))
      .toBeLessThan(social.indexOf('nativeMobileSocialAuthServiceV1.start('));
    expect(hook).toContain('Linking.openURL(decision.webUrl)');
    expect(hook).toContain('nativeMobileRuntimeV1.memberSession.signIn(email, password)');
    const web = readFileSync(new URL('../apps/web/auth-page.js', import.meta.url), 'utf8');
    expect(web).toContain("callbacks.get('mode') === 'sign-up'");
  });
});
