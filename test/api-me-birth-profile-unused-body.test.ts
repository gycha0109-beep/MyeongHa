import { describe, expect, it } from 'vitest';
import { createCurrentSubjectBirthProfileVercelHandlerV1 } from '../api/me/birth-profile.js';

const ROUTE_URL = 'https://myeongha.vercel.app/api/me/birth-profile';
const REQUEST_ID = '00000000-0000-4000-8000-000000000716';
const SERVER_TIME = '2026-09-13T00:00:00.000Z';

function requestWithBody(input?: {
  readonly url?: string;
  readonly cancel?: () => void | PromiseLike<void>;
}): Readonly<{ request: Request; cancelCalls: () => number }> {
  let cancelCalls = 0;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelCalls += 1;
      return input?.cancel?.();
    },
  });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    body,
    duplex: 'half',
  };

  return Object.freeze({
    request: new Request(input?.url ?? ROUTE_URL, init),
    cancelCalls: () => cancelCalls,
  });
}

function createHandler(input?: {
  readonly onRuntimeCall?: (request: Request) => Response | Promise<Response>;
}): ReturnType<typeof createCurrentSubjectBirthProfileVercelHandlerV1> {
  return createCurrentSubjectBirthProfileVercelHandlerV1({
    getRuntime() {
      return {
        async handleRequest({ request }) {
          return input?.onRuntimeCall?.(request) ?? new Response(null, {
            status: 405,
            headers: { Allow: 'GET' },
          });
        },
      };
    },
    requestIdFactory: () => REQUEST_ID,
    serverTimeFactory: () => SERVER_TIME,
  });
}

describe('Current Birth Profile Vercel unused request-body disposal', () => {
  it('requests cancellation without waiting for a non-settling cancel before the 405 result', async () => {
    const source = requestWithBody({
      cancel: () => new Promise<void>(() => undefined),
    });
    const handler = createHandler({
      onRuntimeCall(request) {
        expect(request.method).toBe('POST');
        expect(request.body).toBeNull();
        return new Response(null, {
          status: 405,
          headers: { Allow: 'GET' },
        });
      },
    });

    const response = await handler.fetch(source.request);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(source.cancelCalls()).toBe(1);
  });

  it('keeps adapter-level 404 authoritative when unused-body cancellation rejects', async () => {
    let runtimeCalls = 0;
    const source = requestWithBody({
      url: `${ROUTE_URL}?debug=1`,
      cancel: () => Promise.reject(new Error('synthetic cancellation failure')),
    });
    const handler = createHandler({
      onRuntimeCall() {
        runtimeCalls += 1;
        return new Response(null, { status: 599 });
      },
    });

    const response = await handler.fetch(source.request);
    await Promise.resolve();

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(runtimeCalls).toBe(0);
    expect(source.cancelCalls()).toBe(1);
  });
});
