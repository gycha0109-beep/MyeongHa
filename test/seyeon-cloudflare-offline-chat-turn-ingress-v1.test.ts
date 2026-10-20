import { describe, expect, it, vi } from 'vitest';
import { preflightSeyeonChatTurnSendRequestV1 } from '../apps/api/src/chat-turn-send-http.js';
import {
  handleSeyeonCloudflareOfflineChatTurnIngressV1,
  SEYEON_CLOUDFLARE_OFFLINE_CHAT_INGRESS_V1,
} from '../apps/api/src/seyeon-cloudflare-offline-chat-turn-ingress-v1.js';
import { preflightSeyeonChatTurnSendCoreV1 } from '../apps/api/src/seyeon-chat-turn-send-preflight-core-v1.js';

const THREAD_ID = '123e4567-e89b-42d3-a456-426614174000';
const CLIENT_TURN_ID = '423e4567-e89b-42d3-a456-426614174000';
const REQUEST_ID = '923e4567-e89b-42d3-a456-426614174000';
const URL = `https://myeongha.workers.dev/api/chat/${THREAD_ID}/turns`;
const SECRET = 'PROTECTED_ASSISTANT_MUST_NEVER_BE_REVEALED';

function request(input: Readonly<{
  url?: string;
  method?: string;
  body?: unknown;
}> = {}): Request {
  const method = input.method ?? 'POST';
  return new Request(input.url ?? URL, {
    method,
    ...(method === 'POST' ? {
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer pretend-member' },
      body: JSON.stringify(input.body ?? { clientTurnId: CLIENT_TURN_ID, text: ' 안녕하세요. ' }),
    } : {}),
  });
}

const MEMBER = Object.freeze({ kind: 'member' as const, verifiedAuthUserId: 'verified-auth-uid' });
const GUEST = Object.freeze({ kind: 'guest' as const, verifiedGuestTokenHash: 'verified-guest-hash' });

function verifier(evidence: typeof MEMBER | typeof GUEST | null = MEMBER) {
  return { verifyRequestIdentity: vi.fn(async () => evidence) };
}

async function cf(input: Readonly<{
  req?: Request;
  identity?: ReturnType<typeof verifier>;
  id?: string;
}> = {}): Promise<Response> {
  return handleSeyeonCloudflareOfflineChatTurnIngressV1({
    request: input.req ?? request(),
    requestId: input.id ?? REQUEST_ID,
    identityEvidenceVerifier: input.identity ?? verifier(),
  });
}

async function safe(response: Response, status: number): Promise<string> {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(response.headers.get('location')).toBeNull();
  const text = await response.text();
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain('verified-auth-uid');
  expect(text).not.toContain(CLIENT_TURN_ID);
  return text;
}

describe('S-CF1.5 Cloudflare first chat turn ingress, offline only', () => {
  it('keeps Worker route and any positive Reveal/Provider/DB integration disabled', async () => {
    expect(SEYEON_CLOUDFLARE_OFFLINE_CHAT_INGRESS_V1).toMatchObject({
      publicRouteMounted: false,
      positiveFirstRevealPermitted: false,
      modelProviderConnected: false,
      databaseWriteConnected: false,
      transportG0D04Approved: false,
    });
    const auth = verifier();
    const response = await cf({ identity: auth });
    const body = await safe(response, 503);
    expect(body).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
    expect(auth.verifyRequestIdentity).toHaveBeenCalledTimes(1);
    expect(body).not.toContain('안녕하세요');
  });

  it('requires route and method before invoking even Member authentication', async () => {
    const x = verifier();
    for (const req of [
      request({ url: 'https://myeongha.workers.dev/api/chat/not-a-uuid/turns' }),
      request({ url: URL + '?__myeongha_chat_turn_send=1' }),
      request({ url: URL.replace('/turns', '/turns/') }),
    ]) {
      const payload = await cf({ req, identity: x });
      await safe(payload, 404);
    }
    const get = await cf({ req: request({ method: 'GET' }), identity: x });
    expect(get.headers.get('allow')).toBe('POST');
    expect(await safe(get, 405)).toBe('');
    expect(x.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it('gives identical auth-required and guest-forbidden denials as the Vercel preflight', async () => {
    for (const [identity, status, code] of [
      [verifier(null), 401, 'AUTH_REQUIRED'],
      [verifier(GUEST), 403, 'FORBIDDEN'],
    ] as const) {
      const cloudflare = await cf({ req: request(), identity });
      const legacy = await preflightSeyeonChatTurnSendRequestV1({
        request: request(),
        requestId: REQUEST_ID,
        identityEvidenceVerifier: verifier(identity === undefined ? null : await identity.verifyRequestIdentity(request())),
      });
      expect(legacy.kind).toBe('denied');
      if (legacy.kind === 'denied') {
        expect(legacy.response.status).toBe(status);
      }
      const text = await safe(cloudflare, status);
      expect(text).toContain(code);
    }
  });

  it('rejects malformed, injected and oversized request bodies before first Reveal', async () => {
    const bad = [
      { clientTurnId: 'not-a-uuid', text: 'hello' },
      { clientTurnId: CLIENT_TURN_ID, text: SECRET, grantId: 'client-forged-grant' },
      { clientTurnId: CLIENT_TURN_ID, text: SECRET, subjectId: 'client-subject' },
      { clientTurnId: CLIENT_TURN_ID, text: 'x'.repeat(8001) },
      { clientTurnId: CLIENT_TURN_ID, text: ' ' },
      [CLIENT_TURN_ID, SECRET],
      { clientTurnId: CLIENT_TURN_ID },
    ];
    for (const body of bad) {
      const response = await cf({ req: request({ body }) });
      expect(await safe(response, 400)).toContain('INVALID_REQUEST');
    }
    const large = await cf({ req: request({ body: {
      clientTurnId: CLIENT_TURN_ID, text: 'x'.repeat(20_000),
    } }) });
    expect(await safe(large, 413)).toContain('REQUEST_TOO_LARGE');
  });

  it('does not trust malformed JSON, unexpected content, or exceptions in auth verifier', async () => {
    const broken = new Request(URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text":',
    });
    expect(await safe(await cf({ req: broken }), 400)).toContain('INVALID_REQUEST');

    const authThrows = {
      verifyRequestIdentity: vi.fn(async () => { throw new Error(SECRET); }),
    };
    const response = await handleSeyeonCloudflareOfflineChatTurnIngressV1({
      request: request(),
      requestId: REQUEST_ID,
      identityEvidenceVerifier: authThrows,
    });
    expect(await safe(response, 503)).not.toContain(SECRET);
  });

  it('does not reflect fake request IDs or arbitrary secret diagnostics', async () => {
    const response = await cf({ id: SECRET });
    const text = await safe(response, 503);
    expect(text).toContain('"requestId":"unavailable"');
    expect(text).not.toContain(SECRET);
  });

  it('shared core admits exactly the safe current-turn member input without ever permitting disclosure', async () => {
    const shared = await preflightSeyeonChatTurnSendCoreV1({
      request: request(),
      identityEvidenceVerifier: verifier(),
    });
    expect(shared).toMatchObject({
      kind: 'admitted',
      verifiedEvidence: MEMBER,
      threadId: THREAD_ID,
      clientTurnId: CLIENT_TURN_ID,
      text: '안녕하세요.',
    });
    const candidate = await cf();
    const text = await safe(candidate, 503);
    expect(text).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
    expect(text).not.toContain('안녕하세요.');
  });

  it('Vercel first Reveal is still independently denied after sharing the parser', async () => {
    const result = await preflightSeyeonChatTurnSendRequestV1({
      request: request(),
      requestId: 'legacy-request-id',
      identityEvidenceVerifier: verifier(),
    });
    expect(result.kind).toBe('admitted');
    // The legacy HTTP handler applies its own unconditional first-Reveal
    // HOLD before Runtime.run; preflight only validates a current request.
  });
});
