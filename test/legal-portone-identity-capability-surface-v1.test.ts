import { afterEach, describe, expect, it } from 'vitest';
import identityDispatcher, { resolveMeDispatchTargetForTestV1 } from '../api/me.js';
import { translateStaticUi } from '../apps/web/ui-i18n.js';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';
import { readFileSync } from 'node:fs';

const route = '/api/identity-verifications/capability';
const actionQuery = '__myeongha_identity_action=status';
const before = { ...process.env };
afterEach(() => {
  process.env = { ...before };
});

describe('L2 operational PortOne identity browser gate', () => {
  it('reuses existing /api/me dispatch without adding Vercel functions', () => {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    expect(config.rewrites).toContainEqual({
      source: route, destination: '/api/me?' + actionQuery,
    });
    expect(resolveMeDispatchTargetForTestV1(new Request(
      'https://myeongha.vercel.app/api/me?' + actionQuery,
    ))).toEqual({ kind: 'identity-capability', route });
    expect(resolveMeDispatchTargetForTestV1(new Request(
      'https://myeongha.vercel.app/api/me?' + actionQuery + '&unexpected=1',
    ))).toBeNull();
    const csp = config.headers.flatMap(item => item.headers)
      .find(item => item.key === 'Content-Security-Policy')?.value;
    expect(csp).toContain("script-src 'self' https://cdn.portone.io");
    expect(csp).toContain("connect-src 'self'");
  });

  it('is unavailable without approvals and leaks no environment details', async () => {
    delete process.env.MYEONGHA_PORTONE_IDENTITY_HTTP_MODE;
    const response = await identityDispatcher.fetch(new Request(
      'https://myeongha.vercel.app/api/me?' + actionQuery,
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, data: { available: false } });
  });

  it('fails closed on invalid configuration, accepts only fully approved mode', async () => {
    Object.assign(process.env, {
      MYEONGHA_PORTONE_IDENTITY_HTTP_MODE: 'ENFORCE',
      MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT: 'ENFORCE',
      MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE: 'APPROVED_AND_APPLIED',
      MYEONGHA_PORTONE_IDENTITY_PRIVACY_DISPOSITION_STATE: 'APPROVED',
      MYEONGHA_PORTONE_IDENTITY_PROVIDER_CONTRACT_STATE: 'APPROVED',
      MYEONGHA_PORTONE_IDENTITY_STORE_ID: 'store-0123456789',
      MYEONGHA_PORTONE_IDENTITY_CHANNEL_KEY: 'channel-key-0123456789',
      MYEONGHA_PORTONE_IDENTITY_API_SECRET: 'fixture-api-secret-material-not-production',
    });
    const url = 'https://myeongha.vercel.app/api/me?' + actionQuery;
    expect(await (await identityDispatcher.fetch(new Request(url))).json()).toEqual({
      ok: true, data: { available: true },
    });
    process.env.MYEONGHA_PORTONE_IDENTITY_PROVIDER_CONTRACT_STATE = 'PENDING';
    expect(await (await identityDispatcher.fetch(new Request(url))).json()).toEqual({
      ok: true, data: { available: false },
    });
    expect((await identityDispatcher.fetch(new Request(url, { method: 'POST' }))).status).toBe(405);
  });

  it('shows identity button only after server capability and keeps multilingual copy authored', () => {
    const view = readFileSync(new URL('../apps/web/src/my/MyPage.tsx', import.meta.url), 'utf8');
    expect(view).toContain("fetch('/api/identity-verifications/capability'");
    expect(view).toContain('data-legal-identity-start');
    expect(view).toContain('sdkFactory: loadApprovedPortOneBrowserSdkV1');
    expect(view).toContain('flow.resumeFromRedirect(search)');
    expect(view).toContain('history.replaceState');
    const copy = [
      '본인확인·연령 확인',
      '본인확인은 명하 서버가 발급한 요청으로 진행하며, 인증 결과는 서버에서 재확인합니다.',
      '현재 본인확인은 준비 중입니다. 인증 업체 계약과 개인정보 처리 승인 후 제공됩니다.',
      '본인확인 시작',
      '본인확인 진행 중…',
      '본인확인 화면에서 절차를 완료해 주세요.',
      '본인확인이 완료되었습니다. 만 14세 이상 무료 이용 자격이 확인되었습니다.',
      '본인확인을 완료하지 못했습니다. 인증 절차와 이용 자격을 다시 확인해 주세요.',
    ];
    for (const source of copy) {
      expect(view).toContain(source);
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        const web = translateStaticUi(source, locale);
        expect(web).not.toBe(source);
        expect(web).not.toMatch(/[가-힣]/u);
        expect(translateMobileUiCopy(source, locale)).toBe(web);
      }
    }
  });
});
