import { createServer, type RequestListener } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';
// @ts-expect-error The Cloudflare Worker entrypoint is intentionally JavaScript-only.
import worker from '../../../cloudflare/myeongha-worker.mjs';

const AUTH_ORIGIN = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
const ENV = Object.freeze({
  MYEONGHA_SUPABASE_URL: AUTH_ORIGIN,
  MYEONGHA_SUPABASE_API_KEY: 'synthetic-public-key-longer-than-twenty',
});
const GUARD = Object.freeze({ async check() { return { status: 'clear' as const }; } });
const realFetch = globalThis.fetch;

async function localServer(listener: RequestListener) {
  const server = createServer(listener);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw Error('No loopback port');
  return {
    origin: 'http://127.0.0.1:' + address.port,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    },
  };
}
function request() {
  return new Request('https://myeongha.gycha0109.workers.dev/api/auth/sign-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'synthetic@example.com', password: 'synthetic-password' }),
  });
}
async function coreHealth() {
  const response = await worker.fetch(
    new Request('https://myeongha.gycha0109.workers.dev/api/health'), {},
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('Phase 7 Supabase Auth real loopback HTTP fault isolation', () => {
  it.each([
    { status: 503, code: 'AUTH_UPSTREAM_UNAVAILABLE', expected: 503 },
    { status: 401, code: 'INVALID_CREDENTIALS', expected: 401 },
    { status: 429, code: 'RATE_LIMITED', expected: 429 },
  ])('bounds real HTTP $status without credential reflection or retries', async ({ status, code, expected }) => {
    let calls = 0;
    const server = await localServer((req, res) => {
      calls++;
      expect(req.url).toBe('/auth/v1/token?grant_type=password');
      expect(req.method).toBe('POST');
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ secret: 'synthetic-secret-must-not-leak' }));
    });
    try {
      vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input).startsWith(AUTH_ORIGIN)).toBe(true);
        return realFetch(server.origin + String(input).slice(AUTH_ORIGIN.length), init);
      });
      const response = await handleSupabaseAuthRequestV1({
        request: request(), env: ENV, action: 'sign-in', passwordCompromiseGuard: GUARD,
      });
      expect(response.status).toBe(expected);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const body = await response.text();
      expect(JSON.parse(body).error.code).toBe(code);
      expect(body).not.toContain('synthetic-password');
      expect(body).not.toContain('synthetic-secret-must-not-leak');
      expect(body).not.toContain(ENV.MYEONGHA_SUPABASE_API_KEY);
      expect(calls).toBe(1);
      await coreHealth();
    } finally {
      await server.close();
    }
  });

  it('classifies a refused TCP socket as fail-closed Auth 503 while liveness stays 200', async () => {
    const server = await localServer((_req, res) => res.end('unused'));
    const origin = server.origin;
    await server.close();
    let calls = 0;
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      calls++;
      return realFetch(origin + String(input).slice(AUTH_ORIGIN.length), init);
    });
    const response = await handleSupabaseAuthRequestV1({
      request: request(), env: ENV, action: 'sign-in', passwordCompromiseGuard: GUARD,
    });
    expect(response.status).toBe(503);
    expect((await response.json() as { error: { code: string } }).error.code)
      .toBe('AUTH_UPSTREAM_UNAVAILABLE');
    expect(calls).toBe(1);
    await coreHealth();
  });
});
