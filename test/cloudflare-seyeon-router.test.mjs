import { describe, expect, it, vi } from 'vitest';
import {
  classifyCloudflareChatIngressV1,
  holdCloudflareSeyeonBeforeProviderV1,
  fenceCloudflareSeyeonBeforeFetchReturnV1,
  tryHandleCloudflareSeyeonSecurityV1,
} from '../workers/cloudflare-seyeon-security.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';

const ROOT = 'https://myeongha-cf.example.test';
const THREAD = '123e4567-e89b-42d3-a456-426614174000';
const SECRET = 'PRIVATE_ASSISTANT_CONTENT_MUST_NOT_LEAK';
const bindings = {
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: ROOT,
};

function invoke(path, method = 'GET', env = {}, dependencies) {
  const request = new Request(ROOT + path, { method });
  return tryHandleCloudflareSeyeonSecurityV1(
    request, env, matchCloudflareApiRoute(new URL(request.url).pathname),
    dependencies,
  );
}
async function expectHeld(response) {
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.text()).not.toContain(SECRET);
}
describe('S-CF2 mounted Worker /api/chat deny and independent hooks', () => {
  it('classifies first POST or committed replay, History and malformed independently', () => {
    expect(classifyCloudflareChatIngressV1(new Request(ROOT + '/api/chat/' + THREAD + '/turns'))).toMatchObject({
      kind: 'first_post_or_committed_replay', threadId: THREAD,
    });
    expect(classifyCloudflareChatIngressV1(new Request(ROOT + '/api/chat/' + THREAD))).toMatchObject({
      kind: 'history', threadId: THREAD,
    });
    expect(classifyCloudflareChatIngressV1(new Request(ROOT + '/api/chat/' + THREAD + '/replay')).kind).toBe('malformed_or_unknown_chat');
    expect(classifyCloudflareChatIngressV1(new Request(ROOT + '/api/auth/refresh'))).toBeNull();
  });
  it('holds first send and history before any Auth/DB/Provider when approval is absent', async () => {
    const spy = vi.fn();
    const deps = { createSubjectScope: spy, scope: spy };
    for (const [path, method] of [
      ['/api/chat/' + THREAD + '/turns', 'POST'],
      ['/api/chat/' + THREAD, 'GET'],
      ['/api/chat/' + THREAD + '?pageSize=20', 'GET'],
    ]) {
      await expectHeld(await invoke(path, method, {}, deps));
    }
    expect(spy).not.toHaveBeenCalled();
  });
  it('blocks malformed or method-confused Chat before consulting scoped DB', async () => {
    const spy = vi.fn();
    for (const [path, method] of [
      ['/api/chat/' + THREAD + '/turns?__myeongha_chat_thread_id=' + THREAD, 'POST'],
      ['/api/chat/' + THREAD + '?afterSequenceNo=0&afterSequenceNo=2', 'GET'],
      ['/api/chat/' + THREAD + '/replay', 'GET'],
      ['/api/chat/' + THREAD + '/turns', 'OPTIONS'],
      ['/api/chat/' + THREAD, 'POST'],
      ['/api/chat/%34' + THREAD.slice(1), 'GET'],
    ]) {
      await expectHeld(await invoke(path, method, bindings, { createSubjectScope: spy, scope: spy }));
    }
    expect(spy).not.toHaveBeenCalled();
  });
  it('accepts only independently reauthorized unrelated Character handoff, never a positive payload', async () => {
    const close = vi.fn(async () => {});
    const create = vi.fn(() => ({
      pool: {}, identityEvidenceVerifier: {}, close,
    }));
    const scope = vi.fn(async () => ({
      kind: 'unrelated_thread_requires_ops_reauthorization', threadId: THREAD,
    }));
    expect(await invoke('/api/chat/' + THREAD, 'GET', bindings, { createSubjectScope: create, scope })).toBeNull();
    expect(scope).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledOnce();
    expect(await invoke('/api/me', 'GET', bindings, { createSubjectScope: create, scope })).toBeNull();
    expect(scope).toHaveBeenCalledTimes(1);
  });
  it('fails closed for SeYeon/mixed, unknown, forged candidate and close failure', async () => {
    const injected = {
      createSubjectScope: () => ({ pool: {}, identityEvidenceVerifier: {}, close: async () => {} }),
      scope: async () => ({ kind: 'seyeon_protected_held', response: Response.json({ text: SECRET }) }),
    };
    await expectHeld(await invoke('/api/chat/' + THREAD, 'GET', bindings, injected));
    await expectHeld(await invoke('/api/chat/' + THREAD + '/turns', 'POST', bindings, injected));
    await expectHeld(await invoke('/api/chat/' + THREAD, 'GET', bindings, {
      ...injected, scope: async () => ({ kind: 'unrelated_thread_requires_ops_reauthorization', threadId: 'different' }),
    }));
    await expectHeld(await invoke('/api/chat/' + THREAD, 'GET', bindings, {
      ...injected, createSubjectScope: () => ({ pool: {}, identityEvidenceVerifier: {}, close: async () => { throw Error(SECRET); } }),
    }));
  });
  it('independently seals 200, unregistered 4xx, SSE and redirect', async () => {
    const uuid = crypto.randomUUID();
    await expectHeld(holdCloudflareSeyeonBeforeProviderV1(uuid));
    for (const candidate of [
      Response.json({ assistantText: SECRET }),
      Response.json({ assistantText: SECRET }, { status: 403, headers: { 'Cache-Control': 'no-store' } }),
      new Response('data: ' + SECRET, { headers: { 'Content-Type': 'text/event-stream' } }),
      new Response(null, { status: 302, headers: { Location: '/index.html' } }),
    ]) await expectHeld(fenceCloudflareSeyeonBeforeFetchReturnV1(candidate, uuid));
  });
});
