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

function requestWithCancellation(
  cancel: () => void | PromiseLike<void>,
): Readonly<{
  request: Request;
  cancelCalls: () => number;
}> {
  let calls = 0;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      calls += 1;
      return cancel();
    },
  });

  return Object.freeze({
    request: new Request('https://myeongha.example/api/readiness', {
      method: 'PUT',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelCalls: () => calls,
  });
}

describe('GET /api/readiness', () => {
  it('reports operational ready while Product Reading remains authority-blocked', async () => {
    const response = createProductionReadinessResponseV1(configuredEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'ready',
      capabilities: {
        userData: 'ready',
        sajuCalculation: 'ready',
        sajuProductReading: 'blocked_by_authority',
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
        sajuProductReading: 'blocked_by_authority',
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
        sajuProductReading: 'blocked_by_authority',
      },
    });
    expect(body).not.toContain('MYEONGHA_DATABASE_URL');
    expect(body).not.toContain(env.MYEONGHA_DATABASE_PRINCIPAL);
    expect(body).not.toContain(env.MYEONGHA_SUPABASE_API_KEY);
    expect(body).not.toContain(env.MYEONGHA_GUEST_FINGERPRINT_SECRET);
    expect(body).not.toContain(env.MYEONGHA_SAJU_SERVICE_BEARER);
  });

  it('returns 405 without waiting for unused-body cancellation to settle', () => {
    const source = requestWithCancellation(() => new Promise<void>(() => undefined));

    const response = readinessEndpoint.fetch(source.request);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(source.cancelCalls()).toBe(1);
  });

  it('keeps 405 authoritative when unused-body cancellation rejects', async () => {
    const source = requestWithCancellation(() =>
      Promise.reject(new Error('synthetic cancellation failure')),
    );

    const response = readinessEndpoint.fetch(source.request);
    await Promise.resolve();

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(source.cancelCalls()).toBe(1);
  });

  it('keeps bodyless method rejection harmless without evaluating production configuration', () => {
    const request = new Request('https://myeongha.example/api/readiness', {
      method: 'POST',
    });

    const response = readinessEndpoint.fetch(request);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(request.body).toBeNull();
  });
});
