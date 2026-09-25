import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleChatOpenRequestV1 } from './chat-open-http.js';
import { INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1 } from './ingress-request-body-deadline.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const CHARACTER_ID = 'seyeon';
const CANDIDATE_THREAD_ID = '77777777-7777-4777-8777-777777777777';
const CANDIDATE_THREAD_CHARACTER_ID = '88888888-8888-4888-8888-888888888888';

function streamPost(stream: ReadableStream<Uint8Array>): Request {
  return new Request('https://myeongha.internal/api/chat', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer member-secret',
      'Content-Type': 'application/json',
    },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function textPost(body: string): Request {
  return new Request('https://myeongha.internal/api/chat', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer member-secret',
      'Content-Type': 'application/json',
    },
    body,
  });
}

function invoke(input: {
  readonly request: Request;
  readonly evidence?: VerifiedSubjectIdentityEvidenceV1 | null;
  readonly connect?: ReturnType<typeof vi.fn>;
}): Promise<Response> {
  const connect = input.connect ?? vi.fn(async () => {
    throw new Error('must not connect');
  });

  return handleChatOpenRequestV1({
    request: input.request,
    requestId: 'req-chat-open-body-deadline',
    serverTime: '2026-09-16T12:00:00.000Z',
    identityEvidenceVerifier: {
      verifyRequestIdentity: vi.fn(async (_request: Request): Promise<VerifiedSubjectIdentityEvidenceV1 | null> =>
        input.evidence === undefined
          ? { kind: 'member', verifiedAuthUserId: AUTH_USER_ID }
          : input.evidence),
    },
    pool: { connect } as unknown as PostgresSubjectPoolV1,
    createUuid: (() => {
      const values = [CANDIDATE_THREAD_ID, CANDIDATE_THREAD_CHARACTER_ID];
      let index = 0;
      return () => values[index++] ?? CANDIDATE_THREAD_CHARACTER_ID;
    })(),
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Chat open ingress request-body completion bound', () => {
  it('keeps an authentication rejection authoritative without consuming the body', async () => {
    const request = textPost(JSON.stringify({ characterId: CHARACTER_ID }));
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });

    const response = await invoke({ request, evidence: null, connect });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('AUTH_REQUIRED');
    expect(request.bodyUsed).toBe(false);
    expect(request.body?.locked).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('times out a valid JSON body whose ingress stream never reaches EOF', async () => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const incoming = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ characterId: CHARACTER_ID })));
      },
      cancel() {
        cancelCalls += 1;
        return new Promise<void>(() => undefined);
      },
    });
    const request = streamPost(incoming);
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });

    const responsePromise = invoke({ request, connect });
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    const response = await responsePromise;
    const payload = await response.json() as any;

    expect(response.status).toBe(408);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error).toEqual({
      code: 'REQUEST_BODY_TIMEOUT',
      messageKey: 'auth.request_body_timeout',
      retryable: false,
    });
    expect(payload.meta.apiContractVersion).toBe('v0.9');
    expect(payload.meta.requestId).toBe('req-chat-open-body-deadline');
    expect(cancelCalls).toBe(1);
    expect(request.body?.locked).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('keeps complete malformed JSON fail-closed without PostgreSQL work', async () => {
    const request = textPost('{');
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });

    const response = await invoke({ request, connect });
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error).toEqual({
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
    });
    expect(request.body?.locked).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects an authenticated body above 16 KiB before PostgreSQL work', async () => {
    const request = textPost(JSON.stringify({ characterId: 'x'.repeat(17_000) }));
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });

    const response = await invoke({ request, connect });
    const payload = await response.json() as any;

    expect(response.status).toBe(413);
    expect(payload.error).toEqual({
      code: 'REQUEST_TOO_LARGE',
      messageKey: 'request.too_large',
      retryable: false,
    });
    expect(request.body?.locked).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

});