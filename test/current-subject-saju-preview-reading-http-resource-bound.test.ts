import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCurrentSubjectSajuPreviewReadingRequestV1 } from '../apps/api/src/current-subject-saju-preview-reading-http.js';
import { INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1 } from '../apps/api/src/ingress-request-body-deadline.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { SajuProductionReadingHttpAdapterV1 } from '../apps/api/src/saju-production-reading-http-adapter.js';

const ROUTE = 'https://myeongha.internal/api/me/saju/preview-reading';
const AUTH_USER_ID = '22222222-2222-4222-8222-222222222222';

function streamPost(stream: ReadableStream<Uint8Array>): Request {
  return new Request(ROUTE, {
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
  return new Request(ROUTE, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer member-secret',
      'Content-Type': 'application/json',
    },
    body,
  });
}

function verifier(
  evidence: boolean,
): IdentityEvidenceVerificationPortV1 {
  return {
    verifyRequestIdentity: vi.fn(async () =>
      evidence
        ? ({ kind: 'member', verifiedAuthUserId: AUTH_USER_ID } as const)
        : null),
  };
}

function adapter(): SajuProductionReadingHttpAdapterV1<unknown> & {
  requestReading: ReturnType<typeof vi.fn>;
} {
  return {
    requestReading: vi.fn(async () => ({
      responseVersion: 'myeonghwa-product-reading-response-v2',
      state: 'delivered',
      sections: [],
    })),
  };
}

function invoke(input: {
  readonly request: Request;
  readonly authenticated?: boolean;
  readonly connect?: ReturnType<typeof vi.fn>;
}): Promise<Response> {
  const connect = input.connect ?? vi.fn(async () => {
    throw new Error('must not connect');
  });

  return handleCurrentSubjectSajuPreviewReadingRequestV1({
    request: input.request,
    requestId: 'request:saju-preview:resource-bound',
    serverTime: '2026-09-26T02:55:00.000Z',
    identityEvidenceVerifier: verifier(input.authenticated ?? true),
    pool: { connect } as unknown as PostgresSubjectPoolV1,
    sajuAdapter: adapter(),
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('current-subject Saju Preview Reading authenticated body resource bound', () => {
  it('keeps authentication rejection authoritative without consuming the request body', async () => {
    let pullCalls = 0;
    const request = streamPost(new ReadableStream<Uint8Array>({
      pull() {
        pullCalls += 1;
        throw new Error('body must not be consumed before authentication');
      },
    }, { highWaterMark: 0 }));
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });

    const response = await invoke({ request, authenticated: false, connect });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('AUTH_REQUIRED');
    expect(request.bodyUsed).toBe(false);
    expect(request.body?.locked).toBe(false);
    expect(pullCalls).toBe(0);
    expect(connect).not.toHaveBeenCalled();
  });

  it('accepts a chunked authenticated JSON body and preserves semantic validation', async () => {
    const encoder = new TextEncoder();
    const json = JSON.stringify({ readingText: '올해 운세' });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(json.slice(0, 8)));
        controller.enqueue(encoder.encode(json.slice(8, 17)));
        controller.enqueue(encoder.encode(json.slice(17)));
        controller.close();
      },
    });
    const request = streamPost(stream);
    const connect = vi.fn(async () => {
      throw new Error('unsupported reading must not reach PostgreSQL');
    });

    const response = await invoke({ request, connect });
    const payload = await response.json() as any;

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('SAJU_PREVIEW_READING_UNAVAILABLE');
    expect(request.body?.locked).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects an authenticated request body above 16 KiB before PostgreSQL work', async () => {
    const request = textPost(JSON.stringify({ readingText: 'x'.repeat(17_000) }));
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });

    const response = await invoke({ request, connect });
    const payload = await response.json() as any;

    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error).toEqual({
      code: 'REQUEST_TOO_LARGE',
      messageKey: 'request.too_large',
      retryable: false,
    });
    expect(request.body?.locked).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('times out an authenticated JSON body whose ingress stream never reaches EOF', async () => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const incoming = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify({ readingText: '전체 사주' })),
        );
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
    expect(cancelCalls).toBe(1);
    expect(request.body?.locked).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });
});
