import { describe, expect, it, vi } from 'vitest';
import { createCurrentSubjectBirthProfileVercelHandlerV1 } from './birth-profile.js';

function createHandler(seen: Array<{
  request: Request;
  requestId: string;
  serverTime: string;
}>) {
  return createCurrentSubjectBirthProfileVercelHandlerV1({
    getRuntime: () => ({
      async handleRequest(input) {
        seen.push(input);
        return Response.json(
          { ok: false },
          { status: 401, headers: { 'Cache-Control': 'private' } },
        );
      },
    }),
    requestIdFactory: () => 'request-id',
    serverTimeFactory: () => '2026-09-04T05:45:00.000Z',
  });
}

describe('current-subject Birth Profile Vercel route adapter', () => {
  it('forwards the exact route as a canonical runtime request', async () => {
    const seen: Array<{ request: Request; requestId: string; serverTime: string }> = [];
    const handler = createHandler(seen);

    const response = await handler.fetch(
      new Request('https://myeongha.vercel.app/api/me/birth-profile', {
        headers: { Authorization: 'Bearer member-token' },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.request.url).toBe('https://myeongha.internal/api/me/birth-profile');
    expect(seen[0]?.request.headers.get('authorization')).toBe('Bearer member-token');
    expect(seen[0]?.requestId).toBe('request-id');
    expect(seen[0]?.serverTime).toBe('2026-09-04T05:45:00.000Z');
  });

  it('accepts and strips one non-empty Vercel share metadata parameter', async () => {
    const seen: Array<{ request: Request; requestId: string; serverTime: string }> = [];
    const handler = createHandler(seen);

    const response = await handler.fetch(
      new Request(
        'https://myeongha.vercel.app/api/me/birth-profile?_vercel_share=opaque-platform-token',
      ),
    );

    expect(response.status).toBe(401);
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0]?.request.url ?? '').search).toBe('');
  });

  it.each([
    'https://myeongha.vercel.app/api/me/birth-profile?subjectId=client-owned',
    'https://myeongha.vercel.app/api/me/birth-profile?_vercel_share=',
    'https://myeongha.vercel.app/api/me/birth-profile?_vercel_share=a&_vercel_share=b',
    'https://myeongha.vercel.app/api/me/not-birth-profile',
  ])('fails closed for unsupported route metadata: %s', async (url) => {
    const seen: Array<{ request: Request; requestId: string; serverTime: string }> = [];
    const getRuntime = vi.fn(() => ({
      handleRequest: vi.fn(async () => new Response(null, { status: 200 })),
    }));
    const handler = createCurrentSubjectBirthProfileVercelHandlerV1({ getRuntime });

    const response = await handler.fetch(new Request(url));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(getRuntime).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);
  });

  it('keeps method enforcement inside the canonical runtime boundary', async () => {
    const seen: Array<{ request: Request; requestId: string; serverTime: string }> = [];
    const handler = createHandler(seen);

    await handler.fetch(
      new Request('https://myeongha.vercel.app/api/me/birth-profile', { method: 'POST' }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.request.method).toBe('POST');
  });
});
