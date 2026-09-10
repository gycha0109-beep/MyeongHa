import { describe, expect, it, vi } from 'vitest';
import { handleCurrentSubjectSajuCalculationRequestV1 } from '../apps/api/src/current-subject-saju-calculation-http.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { SajuProductionCalculationHttpAdapterV1 } from '../apps/api/src/saju-production-calculation-http-adapter.js';
import { createCurrentSubjectSajuCalculationRouteV1 } from '../api/me/saju/calculation.js';

function streamRequest(stream: ReadableStream<Uint8Array>): Request {
  return new Request('https://myeongha.example/api/me/saju/calculation', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-member-token',
      'Content-Type': 'application/json',
    },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('current-subject Saju calculation public route body bound', () => {
  it('rejects a non-closing incoming body after one-byte evidence without draining it', async () => {
    let cancelled = false;
    const incoming = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([123]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const verifyRequestIdentity = vi.fn();
    const handleRequest = vi.fn(async (input: { request: Request; requestId: string; serverTime: string }) =>
      handleCurrentSubjectSajuCalculationRequestV1({
        request: input.request,
        requestId: input.requestId,
        serverTime: input.serverTime,
        identityEvidenceVerifier: { verifyRequestIdentity },
        pool: { connect: vi.fn() } as unknown as PostgresSubjectPoolV1,
        sajuAdapter: { calculate: vi.fn() } as unknown as SajuProductionCalculationHttpAdapterV1,
      }));
    const route = createCurrentSubjectSajuCalculationRouteV1({ handleRequest });

    const response = await route.fetch(streamRequest(incoming));
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload.error).toMatchObject({
      code: 'INVALID_REQUEST',
      messageKey: 'request.body_not_allowed',
      retryable: false,
    });
    expect(cancelled).toBe(true);
    expect(verifyRequestIdentity).not.toHaveBeenCalled();
    expect(handleRequest).toHaveBeenCalledTimes(1);
  });

  it('preserves a bodyless request for the existing identity path', async () => {
    const handleRequest = vi.fn(async (input: { request: Request }) => {
      expect(input.request.body).toBeNull();
      return Response.json(
        {
          ok: false,
          error: {
            code: 'AUTH_REQUIRED',
            messageKey: 'auth.required',
            retryable: false,
          },
        },
        { status: 401 },
      );
    });
    const route = createCurrentSubjectSajuCalculationRouteV1({ handleRequest });

    const response = await route.fetch(new Request(
      'https://myeongha.example/api/me/saju/calculation',
      { method: 'POST' },
    ));

    expect(response.status).toBe(401);
    expect(handleRequest).toHaveBeenCalledTimes(1);
  });

  it('treats an explicitly empty stream as no body', async () => {
    const incoming = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const handleRequest = vi.fn(async (input: { request: Request }) => {
      expect(input.request.body).toBeNull();
      return new Response(null, { status: 401 });
    });
    const route = createCurrentSubjectSajuCalculationRouteV1({ handleRequest });

    const response = await route.fetch(streamRequest(incoming));

    expect(response.status).toBe(401);
    expect(handleRequest).toHaveBeenCalledTimes(1);
  });
});
