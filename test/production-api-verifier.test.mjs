import { describe, expect, it, vi } from 'vitest';

import { verifyProductionApiHealth } from '../scripts/verify-production-api.mjs';

function jsonResponse(payload, { status = 200, contentType = 'application/json; charset=utf-8' } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': contentType,
    },
  });
}

describe('production API health verifier', () => {
  it('accepts the exact production health contract', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url.href).toBe('https://example.test/api/health');
      expect(init.method).toBe('GET');
      expect(init.headers.accept).toBe('application/json');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return jsonResponse({ status: 'ok' });
    });

    await expect(
      verifyProductionApiHealth({
        origin: 'https://example.test/nested/path',
        fetchImpl,
        timeoutMs: 1000,
      }),
    ).resolves.toEqual({
      endpoint: 'https://example.test/api/health',
      status: 200,
      payload: { status: 'ok' },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-200 health response', async () => {
    await expect(
      verifyProductionApiHealth({
        origin: 'https://example.test',
        fetchImpl: async () => jsonResponse({ status: 'ok' }, { status: 503 }),
      }),
    ).rejects.toThrow('HTTP 503');
  });

  it('rejects a non-JSON health response', async () => {
    await expect(
      verifyProductionApiHealth({
        origin: 'https://example.test',
        fetchImpl: async () => new Response('ok', {
          status: 200,
          headers: {
            'content-type': 'text/plain',
          },
        }),
      }),
    ).rejects.toThrow('expected application/json');
  });

  it('rejects payload drift', async () => {
    await expect(
      verifyProductionApiHealth({
        origin: 'https://example.test',
        fetchImpl: async () => jsonResponse({ status: 'ok', database: 'unknown' }),
      }),
    ).rejects.toThrow('must be exactly');
  });

  it('rejects non-HTTPS origins before issuing a request', async () => {
    const fetchImpl = vi.fn();

    await expect(
      verifyProductionApiHealth({
        origin: 'http://example.test',
        fetchImpl,
      }),
    ).rejects.toThrow('must use HTTPS');

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
