import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createWebPortOneIdentityFlowV1,
  WEB_PORTONE_IDENTITY_FLOW_V1,
} from '../apps/web/portone-v2-identity-flow.js';
import { translateStaticUi } from '../apps/web/ui-i18n.js';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

const flow = WEB_PORTONE_IDENTITY_FLOW_V1.preenrollment;
const id = 'iv' + 'a'.repeat(32);
const issued = {
  identityVerificationId: id, expiresAt: '2026-10-24T08:30:00Z',
  storeId: 'store-0123456789', channelKey: 'channel-key-0123456789',
};
const now = () => Date.parse('2026-10-24T08:22:00Z');
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}
describe('L2 A1 browser preenrollment identity flow', () => {
  it('does not send member bearer and uses separately scoped Cookie-bound endpoints', async () => {
    const captured: Array<{ route: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (route: string, init: RequestInit) => {
      captured.push({ route, init });
      return Response.json({ ok: true, data: route === flow.issueRoute
        ? issued : { ageBand: 'adult' } });
    });
    const sdk = { requestIdentityVerification: vi.fn(async () => ({
      identityVerificationId: id,
    })) };
    const resolveBearer = vi.fn(async () => {
      throw new Error('Pre-Subject flow must not read member/guest credentials');
    });
    const actor = createWebPortOneIdentityFlowV1({
      preenrollment: true, pendingStore: storage(), fetchImpl, sdk, resolveBearer, now,
      origin: 'https://myeongha.vercel.app',
    });
    expect(await actor.start()).toEqual({ kind: 'verified', ageBand: 'adult' });
    expect(captured.map(item => item.route)).toEqual([flow.issueRoute, flow.completeRoute]);
    expect(sdk.requestIdentityVerification).toHaveBeenCalledWith({
      identityVerificationId: id,
      storeId: issued.storeId,
      channelKey: issued.channelKey,
      redirectUrl: 'https://myeongha.vercel.app/auth.html?preenrollmentIdentity=callback',
    });
    for (const entry of captured) {
      const headers = entry.init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(entry.init.credentials).toBe('same-origin');
      expect(entry.init.cache).toBe('no-store');
    }
    expect(resolveBearer).not.toHaveBeenCalled();
  });

  it('never loads PortOne SDK when preenrollment server refuses activation', async () => {
    const sdkFactory = vi.fn(async () => ({
      requestIdentityVerification: vi.fn(async () => undefined),
    }));
    const actor = createWebPortOneIdentityFlowV1({
      preenrollment: true, pendingStore: storage(), now, sdkFactory,
      fetchImpl: vi.fn(async () => Response.json({
        ok: false, error: { code: 'IDENTITY_VERIFICATION_DISABLED' },
      }, { status: 503 })),
    });
    await expect(actor.start()).rejects.toMatchObject({ code: 'IDENTITY_UNAVAILABLE' });
    expect(sdkFactory).not.toHaveBeenCalled();
  });

  it('refuses forged redirect and requires pending server-owned attempt', async () => {
    const pendingStore = storage();
    const fetchImpl = vi.fn(async (route: string) => Response.json({
      ok: true, data: route === flow.issueRoute ? issued : { ageBand: 'free_minor' },
    }));
    const actor = createWebPortOneIdentityFlowV1({
      preenrollment: true, pendingStore, now, fetchImpl,
      sdk: { requestIdentityVerification: vi.fn(async () => undefined) },
      origin: 'https://myeongha.vercel.app',
    });
    expect(await actor.start()).toEqual({ kind: 'redirect_pending' });
    await expect(actor.resumeFromRedirect(new URLSearchParams({
      preenrollmentIdentity: 'callback', identityVerificationId: 'iv' + 'b'.repeat(32),
    }))).rejects.toMatchObject({ code: 'IDENTITY_MISMATCH' });
    expect(await actor.resumeFromRedirect(new URLSearchParams({
      preenrollmentIdentity: 'callback', identityVerificationId: id,
    }))).toEqual({ kind: 'verified', ageBand: 'free_minor' });
    expect(pendingStore.getItem(flow.pendingKey)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('shows its optional auth entry only if the server admits the preenrollment capability', () => {
    const auth = readFileSync(new URL('../apps/web/src/auth/AuthPage.tsx', import.meta.url), 'utf8');
    expect(auth).toContain('WEB_PORTONE_IDENTITY_FLOW_V1.preenrollment.capabilityRoute');
    expect(auth).toContain('preenrollment: true');
    expect(auth).toContain('sdkFactory: loadPortOnePreenrollmentSdk');
    expect(auth).toContain('data-legal-preenrollment-start');
    expect(auth).toContain('flow.resumeFromRedirect(params)');
    expect(auth).toContain('history.replaceState');
    const notices = [
      '가입 전 본인확인',
      '만 14세 이상인지 본인확인 업체의 서버 결과로 확인합니다. 체크박스만으로 연령 확인이 완료되지는 않습니다.',
      '가입 전 본인확인 시작',
      '가입 전 본인확인 기능은 현재 준비 중입니다. 승인 전에는 진행할 수 없습니다.',
      '가입 전 본인확인이 완료되었습니다. 회원 계정 연결은 별도 서버 확인 후 진행됩니다.',
      '가입 전 본인확인을 완료하지 못했습니다. 인증 절차를 다시 확인해 주세요.',
      '본인확인 화면에서 인증 절차를 완료해 주세요.',
    ];
    for (const source of notices) {
      expect(auth).toContain(source);
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        const translated = translateStaticUi(source, locale);
        expect(translated).not.toBe(source);
        expect(translated).not.toMatch(/[가-힣]/u);
        expect(translateMobileUiCopy(source, locale)).toBe(translated);
      }
    }
  });
});
