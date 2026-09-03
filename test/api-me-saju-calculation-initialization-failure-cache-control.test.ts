import { afterEach, describe, expect, it, vi } from 'vitest';

const SERVICE_BEARER = 'test-initialization-failure-service-bearer-secret';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('GET /api/me/saju/calculation production initialization failure cache boundary', () => {
  it('returns a generic non-cacheable 500 without reflecting service credentials when runtime config is missing', async () => {
    vi.stubEnv(
      'MYEONGHA_DATABASE_URL',
      'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
    );
    vi.stubEnv('MYEONGHA_DATABASE_PRINCIPAL', 'myeongha_runtime');
    vi.stubEnv('MYEONGHA_SUPABASE_URL', 'https://cnsfpcdiyofqvhpcegfc.supabase.co');
    vi.stubEnv(
      'MYEONGHA_SUPABASE_API_KEY',
      'sb_publishable_test_key_material_for_api_saju_initialization_failure',
    );
    vi.stubEnv(
      'MYEONGHA_GUEST_FINGERPRINT_SECRET',
      'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
    );
    vi.stubEnv('MYEONGHA_SAJU_SERVICE_ORIGIN', '');
    vi.stubEnv('MYEONGHA_SAJU_SERVICE_BEARER', SERVICE_BEARER);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.resetModules();
    const { default: sajuCalculationEndpoint } = await import('../api/me/saju/calculation.js');

    const response = await sajuCalculationEndpoint.fetch(
      new Request('https://myeongha.example/api/me/saju/calculation', { method: 'GET' }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('Internal Server Error');
    expect(consoleError).toHaveBeenCalledWith('MyeongHa Saju calculation route failed.');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(SERVICE_BEARER);
  });
});
