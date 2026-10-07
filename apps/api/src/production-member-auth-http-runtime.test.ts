import { describe, expect, it, vi } from 'vitest';
import type { MemberAuthRateLimitAdmissionPortV1 } from './member-auth-rate-limit.js';
import {
  createProductionMemberAuthHttpRuntimeV1,
  MEMBER_AUTH_RATE_LIMIT_POSTGRES_POOL_OPTIONS_V1,
} from './production-member-auth-http-runtime.js';

function env(secret: string | null = 's'.repeat(32)) {
  return {
    MYEONGHA_DATABASE_URL:
      'postgresql://myeongha_login:secret@db.example.test:5432/postgres?sslmode=require',
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_login',
    MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
    MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM:
      '-----BEGIN CERTIFICATE-----\\ntest-only\\n-----END CERTIFICATE-----',
    ...(secret === null ? {} : { MYEONGHA_AUTH_RATE_LIMIT_SECRET: secret }),
  };
}

function request(method = 'POST') {
  return new Request('https://myeongha.example/api/auth/sign-in', {
    method,
    headers: { 'x-forwarded-for': '203.0.113.8' },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
}

describe('Production Member Auth HTTP runtime', () => {
  it('pins a narrow PostgreSQL timeout profile for admission', () => {
    expect(MEMBER_AUTH_RATE_LIMIT_POSTGRES_POOL_OPTIONS_V1).toEqual({
      maxConnectionsPerRuntime: 4,
      connectionTimeoutMs: 1_500,
      idleTimeoutMs: 5_000,
      statementTimeoutMs: 1_500,
    });
  });

  it('composes admission before delegating POST Auth work', async () => {
    const admission: MemberAuthRateLimitAdmissionPortV1 = {
      admit: vi.fn(async () => ({
        allowed: true,
        requestCount: 1,
        resetAt: '2026-09-28T03:01:00.000Z',
      })),
    };
    const authHandler = vi.fn(async () => Response.json({ ok: true }));
    const runtime = createProductionMemberAuthHttpRuntimeV1({
      env: env(),
      admissionPort: admission,
      authHandler,
    });

    const response = await runtime.handleRequest({
      request: request(),
      action: 'sign-in',
    });

    expect(response.status).toBe(200);
    expect(admission.admit).toHaveBeenCalledTimes(1);
    expect(authHandler).toHaveBeenCalledTimes(1);
  });

  it('uses the refresh admission bucket before delegating social completion upstream', async () => {
    const admit = vi.fn(async () => ({
      allowed: true,
      requestCount: 1,
      resetAt: '2026-09-28T03:01:00.000Z',
    }));
    const authHandler = vi.fn(async () => Response.json({ ok: true }));
    const runtime = createProductionMemberAuthHttpRuntimeV1({
      env: env(),
      admissionPort: { admit },
      authHandler,
    });

    const response = await runtime.handleRequest({
      request: request(),
      action: 'refresh',
      authAction: 'social-complete',
    });

    expect(response.status).toBe(200);
    expect(admit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refresh',
      }),
    );
    expect(authHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'social-complete',
      }),
    );
  });

  it('maps missing activation config to fail-closed 503 without Auth work', async () => {
    const authHandler = vi.fn();
    const runtime = createProductionMemberAuthHttpRuntimeV1({
      env: env(null),
      admissionPort: {
        admit: vi.fn(async () => ({
          allowed: true,
          requestCount: 1,
          resetAt: '2026-09-28T03:01:00.000Z',
        })),
      },
      authHandler,
    });

    const response = await runtime.handleRequest({
      request: request(),
      action: 'sign-up',
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('AUTH_RATE_LIMIT_UNAVAILABLE');
    expect(authHandler).not.toHaveBeenCalled();
  });

  it('preserves non-POST handling without requiring rate-limit config', async () => {
    const admission = vi.fn();
    const authHandler = vi.fn(async () => new Response(null, { status: 405 }));
    const runtime = createProductionMemberAuthHttpRuntimeV1({
      env: {},
      admissionPort: { admit: admission },
      authHandler,
    });

    const response = await runtime.handleRequest({
      request: request('GET'),
      action: 'refresh',
    });

    expect(response.status).toBe(405);
    expect(admission).not.toHaveBeenCalled();
    expect(authHandler).toHaveBeenCalledTimes(1);
  });
});
