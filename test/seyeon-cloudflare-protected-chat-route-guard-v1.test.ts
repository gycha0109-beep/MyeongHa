import { describe, expect, it, vi } from 'vitest';
import {
  classifySeyeonCloudflareChatRouteV1,
  holdSeyeonCloudflareProtectedChatRouteV1,
  SEYEON_CLOUDFLARE_PROTECTED_CHAT_ROUTE_GUARD_V1,
} from '../apps/api/src/seyeon-cloudflare-protected-chat-route-guard-v1.js';

const THREAD = '123e4567-e89b-42d3-a456-426614174000';
const TURN = '423e4567-e89b-42d3-a456-426614174000';
const REQUEST_ID = '923e4567-e89b-42d3-a456-426614174000';
const PRIVATE = 'UNAUTHORIZED_REPLAY_HISTORY_PERSONAL_PAYLOAD';
const PREFIX = 'https://myeongha.workers.dev';
function request(path: string, method = 'GET', body?: unknown): Request {
  return new Request(PREFIX + path, {
    method,
    ...(body !== undefined ? {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } : {}),
  });
}
function verifier() {
  return {
    verifyRequestIdentity: vi.fn(async () => ({
      kind: 'member' as const,
      verifiedAuthUserId: 'synthetic-verified-id',
    })),
  };
}
async function assertHeld(response: Response | null): Promise<void> {
  expect(response).not.toBeNull();
  expect(response?.status).toBe(503);
  expect(response?.headers.get('cache-control')).toBe('no-store');
  expect(response?.headers.get('location')).toBeNull();
  expect(response?.headers.get('access-control-allow-origin')).toBeNull();
  const text = await response!.text();
  expect(text).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
  expect(text).not.toContain(PRIVATE);
  expect(text).not.toContain('synthetic-verified-id');
}

describe('S-CF1.6 sealed protected chat routes (offline only)', () => {
  it('states exactly what has NOT been wired or authorized', () => {
    expect(SEYEON_CLOUDFLARE_PROTECTED_CHAT_ROUTE_GUARD_V1).toMatchObject({
      publicRouteMounted: false,
      hostRouterOwnedBy: 'ops',
      threadOwnerVerificationImplemented: false,
      positiveHistoryOrReplayEnabled: false,
      positiveFirstRevealEnabled: false,
    });
  });

  it('classifies valid Vercel-equivalent open/read/turn URLs without a rewrite marker', () => {
    expect(classifySeyeonCloudflareChatRouteV1(request('/api/chat'))).toEqual({ kind: 'chat_open' });
    expect(classifySeyeonCloudflareChatRouteV1(request('/api/chat/' + THREAD)))
      .toEqual({ kind: 'thread_read', threadId: THREAD });
    expect(classifySeyeonCloudflareChatRouteV1(request('/api/chat/' + THREAD + '/turns', 'POST')))
      .toEqual({ kind: 'turn_send', threadId: THREAD });
  });

  it.each([
    '/api/chat/',
    '/api/chat/not-a-uuid',
    '/api/chat/' + THREAD + '/',
    '/api/chat/' + THREAD + '/replay',
    '/api/chat/' + THREAD + '/turns/extra',
    '/api/chat/' + THREAD + '/turns?afterSequenceNo=0',
    '/api/chat/' + THREAD + '?afterSequenceNo=0',
    '/api/chat/' + THREAD + '?afterSequenceNo=0&afterSequenceNo=1',
    '/api/chat?__myeongha_chat_open=1',
    '/api/chat/' + THREAD + '?__myeongha_chat_thread_id=' + THREAD,
    '/api/chat/' + THREAD + '/turns?__myeongha_chat_turn_send=1',
    '/api/chat/' + THREAD + '%2Fturns',
    '/api/chat/%34' + THREAD.slice(1),
    '/api/chat/' + THREAD + '/turns?x=' + PRIVATE,
  ])('never interprets malformed or rewritten chat URL as a safe asset: %s', async path => {
    const req = request(path);
    expect(classifySeyeonCloudflareChatRouteV1(req).kind).toBe('malformed_or_unknown_chat');
    const auth = verifier();
    await assertHeld(await holdSeyeonCloudflareProtectedChatRouteV1({
      request: req,
      requestId: REQUEST_ID,
      identityEvidenceVerifier: auth,
    }));
    expect(auth.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/chat', 'POST'],
    ['/api/chat', 'GET'],
    ['/api/chat/' + THREAD, 'GET'],
    ['/api/chat/' + THREAD, 'POST'],
    ['/api/chat/' + THREAD, 'OPTIONS'],
    ['/api/chat/' + THREAD + '/turns/replay', 'GET'],
  ] as const)('holds protected open/read/replay %s %s before auth and DB access', async (path, method) => {
    const auth = verifier();
    await assertHeld(await holdSeyeonCloudflareProtectedChatRouteV1({
      request: request(path, method),
      requestId: REQUEST_ID,
      identityEvidenceVerifier: auth,
    }));
    expect(auth.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it('valid member first-turn POST remains 503 before any Provider/DB call', async () => {
    const auth = verifier();
    await assertHeld(await holdSeyeonCloudflareProtectedChatRouteV1({
      request: request('/api/chat/' + THREAD + '/turns', 'POST', {
        clientTurnId: TURN,
        text: '오늘 뭐 해?',
      }),
      requestId: REQUEST_ID,
      identityEvidenceVerifier: auth,
    }));
    expect(auth.verifyRequestIdentity).toHaveBeenCalledTimes(1);
  });

  it('preserves fixed auth/method denial for exact first-turn route, not 200 HTML', async () => {
    const auth = verifier();
    const wrongMethod = await holdSeyeonCloudflareProtectedChatRouteV1({
      request: request('/api/chat/' + THREAD + '/turns', 'GET'),
      requestId: REQUEST_ID,
      identityEvidenceVerifier: auth,
    });
    expect(wrongMethod?.status).toBe(405);
    expect(wrongMethod?.headers.get('allow')).toBe('POST');
    expect(await wrongMethod?.text()).toBe('');
    expect(auth.verifyRequestIdentity).not.toHaveBeenCalled();

    const unauth = await holdSeyeonCloudflareProtectedChatRouteV1({
      request: request('/api/chat/' + THREAD + '/turns', 'POST', {
        clientTurnId: TURN, text: PRIVATE,
      }),
      requestId: REQUEST_ID,
      identityEvidenceVerifier: { verifyRequestIdentity: async () => null },
    });
    expect(unauth?.status).toBe(401);
    const text = await unauth?.text();
    expect(text).toContain('AUTH_REQUIRED');
    expect(text).not.toContain(PRIVATE);
  });

  it('declines unrelated API routes without registering a default HTML fallback', async () => {
    const auth = verifier();
    for (const path of ['/api/health', '/api/me', '/api/chatother', '/index.html', '/api/saju']) {
      const req = request(path);
      expect(classifySeyeonCloudflareChatRouteV1(req)).toEqual({ kind: 'not_chat' });
      expect(await holdSeyeonCloudflareProtectedChatRouteV1({
        request: req,
        requestId: REQUEST_ID,
        identityEvidenceVerifier: auth,
      })).toBeNull();
    }
    expect(auth.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it('does not reflect a caller-supplied non-UUID request ID into protected replies', async () => {
    const held = await holdSeyeonCloudflareProtectedChatRouteV1({
      request: request('/api/chat/' + THREAD),
      requestId: PRIVATE,
      identityEvidenceVerifier: verifier(),
    });
    await assertHeld(held);
    expect((await held!.clone().text())).toContain('"requestId":"unavailable"');
  });
});
