import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MOBILE_MEMBER_AUTH_AUTHORED_COPY_V1, localizeMobileMemberAuthCopyV1 } from '../apps/mobile/src/features/my/mobile-member-auth-copy.js';

describe('My member auth fixed feedback UI locale parity', () => {
  it('covers all 26 authored sign-in/sign-up/social feedback states in five locales', () => {
    expect(MOBILE_MEMBER_AUTH_AUTHORED_COPY_V1).toHaveLength(26);
    expect(new Set(MOBILE_MEMBER_AUTH_AUTHORED_COPY_V1).size).toBe(26);
    for (const source of MOBILE_MEMBER_AUTH_AUTHORED_COPY_V1) {
      expect(localizeMobileMemberAuthCopyV1(source, 'ko-KR')).toBe(source);
      for (const locale of ['ja-JP','zh-TW','en-US','zh-CN'] as const) {
        const rendered = localizeMobileMemberAuthCopyV1(source, locale);
        expect(rendered, `${locale}: ${source}`).not.toBe(source);
        expect(rendered).not.toMatch(/[가-힣]/u);
      }
    }
    for (const locale of ['ko-KR','ja-JP','zh-TW','en-US','zh-CN'] as const) {
      expect(localizeMobileMemberAuthCopyV1('guest@example.com', locale)).toBe('guest@example.com');
      expect(localizeMobileMemberAuthCopyV1('서버가 전달한 알 수 없는 메시지', locale)).toBe('서버가 전달한 알 수 없는 메시지');
      expect(localizeMobileMemberAuthCopyV1('[UNKNOWN_SERVER_ERROR]', locale)).toBe('[UNKNOWN_SERVER_ERROR]');
    }
  });

  it('covers canonical authored messages in the real authentication hook and only renders fixed UI', async () => {
    const [hook, components] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/my/use-mobile-member-auth.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/my/MyComponents.tsx', import.meta.url), 'utf8'),
    ]);
    for (const source of MOBILE_MEMBER_AUTH_AUTHORED_COPY_V1) {
      expect(hook, `missing source: ${source}`).toContain(source);
    }
    expect(components).toContain('localizeMobileMemberAuthCopyV1(errorMessage, locale)');
    expect(components).toContain('localizeMobileMemberAuthCopyV1(verificationRequired.message, locale)');
    expect(components).toContain('{verificationRequired.email}');
    expect(components).toContain('disabled={pending || email.trim().length === 0 || password.length === 0}');
    expect(components).not.toContain('t(errorMessage)');
    expect(hook).toContain('nativeMobilePushServiceV1.prepareForSubjectChange()');
    expect(hook).toContain('socialReturnGate.current');
  });
});
