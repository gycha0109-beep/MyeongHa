import { describe, expect, it, vi } from 'vitest';
import type { MemberAuthRateLimitAdmissionPortV1 } from './member-auth-rate-limit.js';
import { handleMemberAuthRateLimitHttpV1 } from './member-auth-rate-limit-http.js';

const SECRET = 'r'.repeat(32);

function request(input: {
  method?: string;
  clientIp?: string | null;
  body?: string;
} = {}): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (input.clientIp !== null) {
    headers.set('x-forwarded-for', input.clientIp ?? '203.0.113.7');
  }
  return new Request('https://myeongha.example/api/auth/sign-in', {
    method: input.method ?? 'POST',
    headers,
    ...((input.method ?? 'POST') === 'GET'
      ? {}
      : { body: input.body ?? '{"email":"invalid"}' }),
  });
}

function port(
  implementation: MemberAuthRateLimitAdmissionPortV1['admit'],
): MemberAuthRateLimitAdmissionPortV1 {
  return Object.freeze({ admit: implementation });
}

describe('Member Auth rate-limit HTTP boundary', () => {
  it('admits POST before delegating to existing Auth work', async () => {
    const admission = vi.fn(async (input) => {
      expect(input.action).toBe('sign-in');
      expect(input.clientFingerprint.byteLength).toBe(32);
      return {
        allowed: true,
        requestCount: 1,
        resetAt: '2026-09-28T03:01:00.000Z',
      };
    });
    const next = vi.fn(async () => new Response('downstream', { status: 200 }));

    const response = await handleMemberAuthRateLimitHttpV1({
      request: request(),
      action: 'sign-in',
      secret: SECRET,
      admissionPort: port(admission),
      next,
    });

    expect(response.status).toBe(200);
    expect(admission).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns source-safe 429 with bounded Retry-After and does not call Auth', async () => {
    const next = vi.fn();
    const response = await handleMemberAuthRateLimitHttpV1({
      request: request({ body: '{"email":"still-not-read"}' }),
      action: 'sign-in',
      secret: SECRET,
      admissionPort: port(async () => ({
        allowed: false,
        requestCount: 31,
        resetAt: '2026-09-28T03:00:35.000Z',
      })),
      next,
      nowMs: () => Date.parse('2026-09-28T03:00:00.000Z'),
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('35');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error).toEqual({
      code: 'RATE_LIMITED',
      messageKey: 'auth.rate_limited',
      retryable: false,
    });
    expect(next).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain('203.0.113.7');
  });

  it('clamps Retry-After to the governed 1..60 second range', async () => {
    const tooLong = await handleMemberAuthRateLimitHttpV1({
      request: request(),
      action: 'refresh',
      secret: SECRET,
      admissionPort: port(async () => ({
        allowed: false,
        requestCount: 31,
        resetAt: '2026-09-28T03:10:00.000Z',
      })),
      next: async () => new Response(null),
      nowMs: () => Date.parse('2026-09-28T03:00:00.000Z'),
    });
    expect(tooLong.headers.get('retry-after')).toBe('60');

    const elapsed = await handleMemberAuthRateLimitHttpV1({
      request: request(),
      action: 'sign-up',
      secret: SECRET,
      admissionPort: port(async () => ({
        allowed: false,
        requestCount: 31,
        resetAt: '2026-09-28T02:59:59.000Z',
      })),
      next: async () => new Response(null),
      nowMs: () => Date.parse('2026-09-28T03:00:00.000Z'),
    });
    expect(elapsed.headers.get('retry-after')).toBe('1');
  });

  it.each([
    ['missing trusted client IP', request({ clientIp: null })],
    ['forwarded IP chain', request({ clientIp: '203.0.113.7, 198.51.100.3' })],
  ])('fails closed with 503 for %s', async (_name, authRequest) => {
    const admission = vi.fn();
    const next = vi.fn();
    const response = await handleMemberAuthRateLimitHttpV1({
      request: authRequest,
      action: 'sign-in',
      secret: SECRET,
      admissionPort: port(admission),
      next,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(503);
    expect(payload.error).toEqual({
      code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
      messageKey: 'auth.auth_rate_limit_unavailable',
      retryable: true,
    });
    expect(admission).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed when PostgreSQL admission is unavailable', async () => {
    const next = vi.fn();
    const response = await handleMemberAuthRateLimitHttpV1({
      request: request(),
      action: 'refresh',
      secret: SECRET,
      admissionPort: port(async () => {
        throw new Error('database unavailable');
      }),
      next,
    });

    expect(response.status).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not consume rate-limit admission for non-POST methods', async () => {
    const admission = vi.fn();
    const next = vi.fn(async () => new Response(null, { status: 405 }));
    const response = await handleMemberAuthRateLimitHttpV1({
      request: request({ method: 'GET', clientIp: null }),
      action: 'sign-in',
      secret: SECRET,
      admissionPort: port(admission),
      next,
    });

    expect(response.status).toBe(405);
    expect(admission).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
