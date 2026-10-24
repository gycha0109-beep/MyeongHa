import { afterEach, expect, it, vi } from 'vitest';

const handler = vi.hoisted(() => vi.fn());
vi.mock('../workers/cloudflare-auth-db-api.mjs', async importOriginal => ({
  ...await importOriginal(), tryHandleCloudflareApprovedAuthV1: handler,
}));
import worker from '../workers/cloudflare-static-preview.mjs';

afterEach(() => vi.restoreAllMocks());

it.each([[401, 'ACCESS_DENIED'], [403, 'ACCESS_DENIED'], [429, 'RATE_LIMITED'], [503, 'SERVER_FAILURE']])(
  'actual Worker emits privacy-safe %i event without changing the response', async (status, code) => {
    const lines = [];
    vi.spyOn(console, 'warn').mockImplementation(line => lines.push(line));
    vi.spyOn(console, 'error').mockImplementation(line => lines.push(line));
    handler.mockResolvedValue(Response.json({ privateResult: 'DO_NOT_LOG_BODY' }, {
      status, headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '9' } : {}) },
    }));
    const response = await worker.fetch(new Request('https://synthetic.example.invalid/api/me?secret=DO_NOT_LOG_QUERY', {
      headers: { Authorization: 'Bearer DO_NOT_LOG_BEARER', Cookie: 'DO_NOT_LOG_COOKIE' },
    }), {});
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ privateResult: 'DO_NOT_LOG_BODY' });
    if (status === 429) expect(response.headers.get('retry-after')).toBe('9');
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0].slice('MYEONGHA_SECURITY_EVENT '.length));
    expect(event).toMatchObject({ schemaVersion: 'myeongha-security-event-v1', eventCode: code, routeId: 'api.me', method: 'GET', status });
    expect(lines.join('')).not.toContain('DO_NOT_LOG');
    expect(Object.keys(event).sort()).toEqual(['durationMs','eventCode','method','occurredAt','owasp','requestId','routeId','schemaVersion','severity','status'].sort());
  },
);
