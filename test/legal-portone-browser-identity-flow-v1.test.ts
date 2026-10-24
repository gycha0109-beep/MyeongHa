import { describe, expect, it, vi } from 'vitest';
import {
  createWebPortOneIdentityFlowV1,
  WebPortOneIdentityFlowErrorV1,
  WEB_PORTONE_IDENTITY_FLOW_V1,
} from '../apps/web/portone-v2-identity-flow.js';

const id = 'iv' + 'a'.repeat(32);
const base = 'https://myeongha.vercel.app';
const expiry = '2026-10-24T08:31:00.000Z';
const fixedNow = () => Date.parse('2026-10-24T08:22:00.000Z');
const issue = { identityVerificationId: id, expiresAt: expiry,
  storeId: 'store-0123456789', channelKey: 'channel-key-0123456789' };

function memory() {
  const storage = new Map<string, string>();
  return {
    getItem(key: string) { return storage.get(key) ?? null; },
    setItem(key: string, value: string) { storage.set(key, value); },
    removeItem(key: string) { storage.delete(key); },
  };
}
function setup(opts: Readonly<{
  sdk?: { requestIdentityVerification: ReturnType<typeof vi.fn> };
  fetchImpl?: ReturnType<typeof vi.fn>;
  pendingStore?: ReturnType<typeof memory>;
  resolveBearer?: () => Promise<{ kind: 'member'; token: string } | null>;
}> = {}) {
  const calls: Array<{ route: string; init: RequestInit }> = [];
  const fetchImpl = opts.fetchImpl ?? vi.fn(async (route: string, init: RequestInit) => {
    calls.push({ route, init });
    return Response.json({ ok: true, data: route === WEB_PORTONE_IDENTITY_FLOW_V1.issueRoute
      ? issue : { ageBand: 'free_minor' } });
  });
  const sdk = opts.sdk ?? {
    requestIdentityVerification: vi.fn(async (req) => ({
      transactionType: 'IDENTITY_VERIFICATION',
      identityVerificationId: req.identityVerificationId,
    })),
  };
  const pendingStore = opts.pendingStore ?? memory();
  const flow = createWebPortOneIdentityFlowV1({
    fetchImpl, sdk, pendingStore, now: fixedNow, origin: base,
    resolveBearer: opts.resolveBearer ?? (async () => ({ kind: 'member', token: 'opaque-member-token' })),
  });
  return { calls, fetchImpl, sdk, pendingStore, flow };
}
describe('L2 browser PortOne V2 server-owned identity transport', () => {
  it('uses server-issued ID and public channel, not a client-generated identity or PII', async () => {
    const t = setup();
    const result = await t.flow.start();
    expect(result).toEqual({ kind: 'verified', ageBand: 'free_minor' });
    expect(t.sdk.requestIdentityVerification).toHaveBeenCalledWith({
      storeId: issue.storeId, channelKey: issue.channelKey, identityVerificationId: id,
      redirectUrl: base + '/my.html?identityVerification=callback',
    });
    expect(t.calls.map(x => x.route)).toEqual([
      WEB_PORTONE_IDENTITY_FLOW_V1.issueRoute,
      WEB_PORTONE_IDENTITY_FLOW_V1.completeRoute,
    ]);
    const sent = t.calls.map(x => JSON.parse(x.init.body as string));
    expect(sent).toEqual([{}, { identityVerificationId: id }]);
    for (const x of t.calls) {
      expect(x.init.headers).toMatchObject({ Authorization: 'Bearer opaque-member-token' });
      expect(x.init.credentials).toBe('same-origin');
      expect(x.init.cache).toBe('no-store');
    }
    expect(t.pendingStore.getItem(WEB_PORTONE_IDENTITY_FLOW_V1.pendingKey)).toBeNull();
  });

  it('does not even issue an attempt unless a PortOne SDK is injected', async () => {
    const fetchImpl = vi.fn();
    const flow = createWebPortOneIdentityFlowV1({
      sdk: null, fetchImpl, pendingStore: memory(), now: fixedNow,
      resolveBearer: async () => ({ kind: 'member', token: 'test' }),
    });
    await expect(flow.start()).rejects.toMatchObject({ code: 'SDK_UNAVAILABLE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires valid server channel, expiry and authenticated bearer before SDK invocation', async () => {
    const bad = setup({
      fetchImpl: vi.fn(async () => Response.json({ ok: true, data: {
        ...issue, expiresAt: '2026-10-20T00:00:00Z',
      } })),
    });
    await expect(bad.flow.start()).rejects.toMatchObject({ code: 'INVALID_ISSUE_RESPONSE' });
    expect(bad.sdk.requestIdentityVerification).not.toHaveBeenCalled();
    const guest = setup({ resolveBearer: async () => null });
    await expect(guest.flow.start()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(guest.sdk.requestIdentityVerification).not.toHaveBeenCalled();
  });

  it('never treats a popup success callback as proof if the server refuses it', async () => {
    const response = setup({ fetchImpl: vi.fn(async (route: string) => {
      if (route === WEB_PORTONE_IDENTITY_FLOW_V1.issueRoute) {
        return Response.json({ ok: true, data: issue });
      }
      return Response.json({ ok: false, error: { code: 'IDENTITY_VERIFICATION_NOT_ACCEPTED' } },
        { status: 403 });
    }) });
    await expect(response.flow.start()).rejects.toMatchObject({ code: 'IDENTITY_UNAVAILABLE' });
    expect(response.pendingStore.getItem(WEB_PORTONE_IDENTITY_FLOW_V1.pendingKey)).toBeNull();
  });

  it('refuses spoofed popup ID without invoking complete', async () => {
    const t = setup({ sdk: { requestIdentityVerification: vi.fn(async () => ({
      identityVerificationId: 'iv' + 'b'.repeat(32),
    })) } });
    await expect(t.flow.start()).rejects.toMatchObject({ code: 'PROVIDER_NOT_VERIFIED' });
    expect(t.calls.map(x => x.route)).toEqual([WEB_PORTONE_IDENTITY_FLOW_V1.issueRoute]);
    expect(t.pendingStore.getItem(WEB_PORTONE_IDENTITY_FLOW_V1.pendingKey)).toBeNull();
  });

  it('redirect callback can only complete its pending, unexpired server-owned attempt', async () => {
    const t = setup({ sdk: { requestIdentityVerification: vi.fn(async () => undefined) } });
    expect(await t.flow.start()).toEqual({ kind: 'redirect_pending' });
    const spoofed = new URLSearchParams({
      identityVerification: 'callback', identityVerificationId: 'iv' + 'b'.repeat(32),
    });
    await expect(t.flow.resumeFromRedirect(spoofed)).rejects.toMatchObject({ code: 'IDENTITY_MISMATCH' });
    const valid = new URLSearchParams({ identityVerification: 'callback', identityVerificationId: id });
    expect(await t.flow.resumeFromRedirect(valid)).toEqual({ kind: 'verified', ageBand: 'free_minor' });
    await expect(t.flow.resumeFromRedirect(valid)).rejects.toMatchObject({ code: 'NO_PENDING_IDENTITY' });
    expect(t.calls.map(x => x.route)).toEqual([
      WEB_PORTONE_IDENTITY_FLOW_V1.issueRoute,
      WEB_PORTONE_IDENTITY_FLOW_V1.completeRoute,
    ]);
  });

  it('does not trust redirect code or provider error parameters', async () => {
    const t = setup({ sdk: { requestIdentityVerification: vi.fn(async () => undefined) } });
    await t.flow.start();
    const bad = new URLSearchParams({
      identityVerification: 'callback', identityVerificationId: id, code: 'SPOOFED',
    });
    await expect(t.flow.resumeFromRedirect(bad)).rejects.toMatchObject({ code: 'INVALID_REDIRECT' });
    expect(t.calls).toHaveLength(1);
    expect(WebPortOneIdentityFlowErrorV1).toBeDefined();
  });
});
