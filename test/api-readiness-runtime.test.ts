import { describe, expect, it } from 'vitest';
import readinessEndpoint, {
  createProductionReadinessResponseV1,
} from '../api/readiness.js';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN } from '../apps/api/src/production-user-data-runtime-config.js';

function configuredEnv(): Record<string, string> {
  return {
    MYEONGHA_DATABASE_URL:
      'postgresql://myeongha_login:database-password@db.example.com:5432/postgres?sslmode=require',
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_login',
    MYEONGHA_SUPABASE_URL: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    MYEONGHA_SUPABASE_API_KEY: 'supabase-api-key-value-1234567890',
    MYEONGHA_GUEST_FINGERPRINT_SECRET:
      'guest-fingerprint-secret-value-1234567890',
    MYEONGHA_SAJU_SERVICE_ORIGIN: 'https://saju.example.com',
    MYEONGHA_SAJU_SERVICE_BEARER: 'saju-service-bearer-value',
  };
}

describe('GET /api/readiness', () => {
  it('reports ready when core user-data and Saju configuration are valid', async () => {
    const response = createProductionReadinessResponseV1(configuredEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'ready',
      capabilities: {
        userData: 'ready',
        sajuCalculation: 'ready',
      },
    });
  });

  it('keeps the product available but marks Saju degraded when only Saju configuration is invalid', async () => {
    const env = configuredEnv();
    delete env.MYEONGHA_SAJU_SERVICE_ORIGIN;
    delete env.MYEONGHA_SAJU_SERVICE_BEARER;

    const response = createProductionReadinessResponseV1(env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'degraded',
      capabilities: {
        userData: 'ready',
        sajuCalculation: 'degraded',
      },
    });
  });

  it('returns unready when core user-data configuration is invalid without exposing config details', async () => {
    const env = configuredEnv();
    delete env.MYEONGHA_DATABASE_URL;

    const response = createProductionReadinessResponseV1(env);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(body)).toEqual({
      status: 'unready',
      capabilities: {
        userData: 'unready',
        sajuCalculation: 'ready',
      },
    });
    expect(body).not.toContain('MYEONGHA_DATABASE_URL');
    expect(body).not.toContain(env.MYEONGHA_DATABASE_PRINCIPAL);
    expect(body).not.toContain(env.MYEONGHA_SUPABASE_API_KEY);
    expect(body).not.toContain(env.MYEONGHA_GUEST_FINGERPRINT_SECRET);
    expect(body).not.toContain(env.MYEONGHA_SAJU_SERVICE_BEARER);
  });

  it('rejects non-GET methods without evaluating production configuration', () => {
    const response = readinessEndpoint.fetch(
      new Request('https://myeongha.example/api/readiness', { method: 'POST' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
