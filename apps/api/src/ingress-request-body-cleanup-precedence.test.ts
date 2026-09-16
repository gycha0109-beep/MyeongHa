import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleChatOpenRequestV1 } from './chat-open-http.js';
import { readGuestBootstrapRequestBodyV1 } from './guest-bootstrap-request-body.js';
import { isGuestPromotionEmptyRequestBodyV1 } from './guest-promotion-request-body.js';
import {
  INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1,
  IngressRequestBodyCompletionDeadlineExceededV1,
} from './ingress-request-body-deadline.js';
import { hasRequestBodyWithoutDrainingV1 } from './request-body-presence-probe.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_ENV = Object.freeze({
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
});

function nonClosingPost(url: string, headers: Record<string, string> = {}): Request {
  const stream = new ReadableStream<Uint8Array>();
  return new Request(url, {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function throwAfterReaderLockRelease(): ReturnType<typeof vi.spyOn> {
  const originalReleaseLock = ReadableStreamDefaultReader.prototype.releaseLock;
  return vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function (
    this: ReadableStreamDefaultReader<unknown>,
  ) {
    originalReleaseLock.call(this);
    throw new Error('synthetic releaseLock cleanup failure');
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('V1 ingress request-body cleanup error precedence', () => {
  it.each([
    ['body-presence probe', hasRequestBodyWithoutDrainingV1],
    ['Guest bootstrap', readGuestBootstrapRequestBodyV1],
    ['Guest promotion', isGuestPromotionEmptyRequestBodyV1],
  ] as const)('keeps the governed deadline authoritative for %s when releaseLock throws', async (_name, readBody) => {
    vi.useFakeTimers();
    throwAfterReaderLockRelease();
    const request = nonClosingPost('https://myeongha.example/internal-body-test');

    const rejection = expect(readBody(request)).rejects.toBeInstanceOf(
      IngressRequestBodyCompletionDeadlineExceededV1,
    );
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    await rejection;

    expect(request.body?.locked).toBe(false);
  });

  it('keeps Chat timeout mapping authoritative when releaseLock throws', async () => {
    vi.useFakeTimers();
    throwAfterReaderLockRelease();
    const request = nonClosingPost('https://myeongha.internal/api/chat', {
      Authorization: 'Bearer member-secret',
      'Content-Type': 'application/json',
    });
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });

    const responsePromise = handleChatOpenRequestV1({
      request,
      requestId: 'req-chat-cleanup-precedence',
      serverTime: '2026-09-16T12:00:00.000Z',
      identityEvidenceVerifier: {
        verifyRequestIdentity: vi.fn(async () => ({
          kind: 'member' as const,
          verifiedAuthUserId: AUTH_USER_ID,
        })),
      },
      pool: { connect } as unknown as PostgresSubjectPoolV1,
      createUuid: vi.fn(() => '77777777-7777-4777-8777-777777777777'),
    });
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    const response = await responsePromise;
    vi.restoreAllMocks();
    const payload = await response.json() as any;

    expect(response.status).toBe(408);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error).toEqual({
      code: 'REQUEST_BODY_TIMEOUT',
      messageKey: 'auth.request_body_timeout',
      retryable: false,
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('keeps Supabase Auth timeout mapping authoritative when releaseLock throws', async () => {
    vi.useFakeTimers();
    throwAfterReaderLockRelease();
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const request = nonClosingPost('https://myeongha.example/api/auth/sign-in', {
      'Content-Type': 'application/json',
    });

    const responsePromise = handleSupabaseAuthRequestV1({
      request,
      env: AUTH_ENV,
      action: 'sign-in',
    });
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    const response = await responsePromise;
    vi.restoreAllMocks();
    const payload = await response.json() as any;

    expect(response.status).toBe(408);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error).toEqual({
      code: 'REQUEST_BODY_TIMEOUT',
      messageKey: 'auth.request_body_timeout',
      retryable: false,
    });
    expect(upstream).not.toHaveBeenCalled();
  });
});
