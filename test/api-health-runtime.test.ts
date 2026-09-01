import { describe, expect, it } from 'vitest';
import healthEndpoint from '../api/health.js';

describe('GET /api/health', () => {
  it('proves the executable API runtime without depending on user identity or DB state', async () => {
    const response = healthEndpoint.fetch(
      new Request('https://myeongha.example/api/health', { method: 'GET' }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('rejects non-GET methods at the HTTP entrypoint', () => {
    const response = healthEndpoint.fetch(
      new Request('https://myeongha.example/api/health', { method: 'POST' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});
