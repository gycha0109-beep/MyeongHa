import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translateStaticUi } from '../apps/web/ui-i18n.js';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';
import { PORTONE_V2_BROWSER_SDK_EXECUTION_GUARD_V1 } from '../apps/web/src/commerce/portone-v2-browser-sdk-execution-guard.js';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const auth = read('apps/web/src/auth/AuthPage.tsx');
const birth = read('apps/web/src/birth/BirthPage.tsx');
const reading = read('apps/web/src/reading/ReadingPage.tsx');
const birthClient = read('apps/web/birth-runtime-client.js');
const sajuClient = read('apps/web/saju-hub.js');
const server = read('apps/api/src/birth-profile-create-http.ts');

describe('LEGAL L2: minimum-age disclosure and actual birth write gate', () => {
  it('shows under-14 policy ahead of both self Birth Profile submit actions', () => {
    for (const [page, button] of [[birth, 'id="birth-submit-button"'], [reading, 'id="saju-create-button"']] as const) {
      expect(page.indexOf('data-legal-age-policy-notice')).toBeGreaterThan(-1);
      expect(page.indexOf('data-legal-age-policy-notice')).toBeLessThan(page.indexOf(button));
      expect(page).toContain('보호자 동의 확인 기능이 준비되기 전까지 명식록을 만들 수 없습니다');
    }
  });

  it('rejects before PostgreSQL and returns no birth data in the error response', () => {
    expect(server.indexOf('resolveSelfBirthAgeAdmissionV1({')).toBeGreaterThan(-1);
    expect(server.indexOf('resolveSelfBirthAgeAdmissionV1({')).toBeLessThan(server.indexOf('const data = await executePostgresSubjectTransactionV1({'));
    expect(server).toContain("'AGE_RESTRICTED'");
    expect(server).toContain("'AGE_VERIFICATION_REQUIRED'");
    expect(birthClient).toContain("publicCode === 'AGE_RESTRICTED'");
    expect(birthClient).toContain("publicCode === 'AGE_VERIFICATION_REQUIRED'");
    expect(sajuClient).toContain("error?.code === 'AGE_RESTRICTED'");
    expect(sajuClient).toContain("error?.code === 'AGE_VERIFICATION_REQUIRED'");
  });

  it('requires a 14+ attestation in Web email sign-up and social start but does not claim proof', () => {
    expect(auth).toContain('data-legal-age-self-declaration');
    expect(auth).toContain("mode === 'sign-up' && !form.has('ageConfirmed')");
    expect(auth).toContain('if (!ageConfirmed)');
    expect(auth).toContain('checked={ageConfirmed}');
    expect(auth).toContain('data-legal-minor-paid-policy');
    expect(auth).toContain('유료 해설 구매는 만 19세 이상만 가능합니다');
    expect(PORTONE_V2_BROWSER_SDK_EXECUTION_GUARD_V1).toMatchObject({
      active: false, publicRoute: null, sdkInvocationEnabled: false, liveEnvironmentEnabled: false,
    });
  });

  it('keeps new static notices translated consistently without changing user-authored data', () => {
    const authored = [
      '명하의 개인화 서비스는 만 14세 이상 이용할 수 있습니다. 만 14세 미만은 보호자 동의 확인 기능이 준비되기 전까지 명식록을 만들 수 없습니다.',
      '저는 만 14세 이상입니다. 만 14세 미만은 보호자 동의 확인 기능이 준비되기 전까지 가입하거나 개인화 서비스를 이용할 수 없습니다.',
      '만 14세 이상 이용 가능 여부를 먼저 확인해 주세요.',
      '유료 해설 구매는 만 19세 이상만 가능합니다. 현재 공개 결제는 제공하지 않습니다.',
    ];
    for (const source of authored) {
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        const translated = translateStaticUi(source, locale);
        expect(translated).not.toBe(source);
        expect(translated).not.toMatch(/[가-힣]/u);
        expect(translateMobileUiCopy(source, locale)).toBe(translated);
      }
    }
  });
});
