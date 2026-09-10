import { describe, expect, it, vi } from 'vitest';
import { createCurrentSubjectSajuCalculationRouteV1 } from './calculation.js';

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
    const handleRequest = vi.fn(async (input: { request: Request }) => {
      expect(input.request.headers.get('content-length')).toBeNull();
      expect(input.request.headers.get('transfer-encoding')).toBeNull();
      expect(new Uint8Array(await input.request.arrayBuffer())).toEqual(new Uint8Array([1]));
      return Response.json(
        {
          ok: false,
          error: {
            code: 'INVALID_REQUEST',
            messageKey: 'request.body_not_allowed',
            retryable: false,
          },
        },
        { status: 400 },
      );
    });
    const route = createCurrentSubjectSajuCalculationRouteV1({ handleRequest });

    const response = await route.fetch(streamRequest(incoming));

    expect(response.status).toBe(400);
    expect(cancelled).toBe(true);
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
