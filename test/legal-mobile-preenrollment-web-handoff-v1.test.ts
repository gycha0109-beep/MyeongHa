import { describe, expect, it, vi } from 'vitest';
import {
  MOBILE_PREENROLLMENT_WEB_HANDOFF_V1,
  resolveMobilePreenrollmentAdmissionV1,
} from '../apps/mobile/src/core/auth/mobile-preenrollment-web-handoff.js';
import { readFileSync } from 'node:fs';
import { translateStaticUi } from '../apps/web/ui-i18n.js';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

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
    expect(signup.indexOf("await requireWebPreenrollment('signup')"))
      .toBeLessThan(signup.indexOf('mobileNewMemberEnrollmentServiceV1.start('));
    expect(social.indexOf("await requireWebPreenrollment('social')"))
      .toBeLessThan(social.indexOf('nativeMobileSocialAuthServiceV1.start('));
    expect(hook).toContain('Linking.openURL(decision.webUrl)');
    expect(hook).toContain('nativeMobileRuntimeV1.memberSession.signIn(email, password)');
    const web = readFileSync(new URL('../apps/web/auth-page.js', import.meta.url), 'utf8');
    expect(web).toContain("callbacks.get('mode') === 'sign-up'");
    const panel = readFileSync(new URL(
      '../apps/mobile/src/features/my/MyComponents.tsx', import.meta.url,
    ), 'utf8');
    const disclosure = '연령 본인확인이 필요한 경우 공식 웹 브라우저에서 새 계정을 만든 뒤 앱에 로그인해 주세요.';
    expect(panel).toContain(disclosure);
    expect(panel).toContain('webPreenrollmentRequired ?');
    expect(panel).toContain('공식 웹에서 가입·본인확인');
    const screen = readFileSync(new URL(
      '../apps/mobile/src/app/(tabs)/my/index.tsx', import.meta.url,
    ), 'utf8');
    expect(screen).toContain('webPreenrollmentRequired={memberAuth.webPreenrollmentRequired}');
    for (const text of [
      disclosure,
      '공식 웹에서 가입·본인확인',
      '현재 신규 가입과 소셜 인증 가능 여부를 확인할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.',
      '본인확인과 새 계정 생성은 공식 웹 브라우저에서 진행합니다. 완료 후 앱에서 기존 계정으로 로그인해 주세요.',
      '공식 가입 페이지를 열지 못했습니다. 브라우저에서 명하 계정 생성 화면을 이용해 주세요.',
      '현재 앱의 소셜 로그인은 본인확인 적용 중 사용할 수 없습니다. 웹의 소셜 로그인 세션은 앱으로 자동 연결되지 않습니다.',
    ]) {
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        const translated = translateMobileUiCopy(text, locale);
        expect(translated).not.toBe(text);
        expect(translated).toBe(translateStaticUi(text, locale));
        expect(translated).not.toMatch(/[가-힣]/u);
      }
    }
  });
});
