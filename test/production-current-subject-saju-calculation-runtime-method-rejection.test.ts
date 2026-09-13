import { describe, expect, it } from 'vitest';
import { createProductionCurrentSubjectSajuCalculationRuntimeV1 } from '../apps/api/src/production-current-subject-saju-calculation-runtime.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_saju_method_rejection',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
  MYEONGHA_SAJU_SERVICE_ORIGIN: 'https://saju.internal.example',
  MYEONGHA_SAJU_SERVICE_BEARER: 'test-production-saju-service-bearer-secret',
});

function requestWithCancellation(
  cancel: () => void | PromiseLike<void>,
  url = 'https://myeongha.example/api/me/saju/calculation',
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
    request: new Request(url, {
      method: 'PUT',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelCalls: () => calls,
  });
}

function runtime() {
  return createProductionCurrentSubjectSajuCalculationRuntimeV1({ env: ENV });
}

async function assertMethodRejection(response: Response): Promise<void> {
  expect(response.status).toBe(405);
  expect(response.headers.get('Allow')).toBe('POST');
  expect(await response.text()).toBe('');
}

describe('Production Current Subject Saju calculation method-rejection request-body lifecycle', () => {
  it('returns 405 without waiting for unused-body cancellation to settle', async () => {
    const sajuRuntime = runtime();
    const source = requestWithCancellation(() => new Promise<void>(() => undefined));

    try {
      const response = await sajuRuntime.handleRequest({
        request: source.request,
        requestId: 'req-saju-method-rejection-nonsettling',
        serverTime: '2026-09-13T11:00:00.000Z',
      });

      await assertMethodRejection(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await sajuRuntime.close();
    }
  });

  it('keeps 405 authoritative when unused-body cancellation rejects', async () => {
    const sajuRuntime = runtime();
    const source = requestWithCancellation(() =>
      Promise.reject(new Error('synthetic cancellation failure')),
    );

    try {
      const response = await sajuRuntime.handleRequest({
        request: source.request,
        requestId: 'req-saju-method-rejection-rejecting',
        serverTime: '2026-09-13T11:00:00.000Z',
      });
      await Promise.resolve();

      await assertMethodRejection(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await sajuRuntime.close();
    }
  });

  it('keeps bodyless method rejection harmless', async () => {
    const sajuRuntime = runtime();
    const request = new Request('https://myeongha.example/api/me/saju/calculation', {
      method: 'GET',
    });

    try {
      const response = await sajuRuntime.handleRequest({
        request,
        requestId: 'req-saju-method-rejection-bodyless',
        serverTime: '2026-09-13T11:00:00.000Z',
      });

      await assertMethodRejection(response);
      expect(request.body).toBeNull();
    } finally {
      await sajuRuntime.close();
    }
  });

  it('does not expand method-rejection cleanup to route-mismatch 404', async () => {
    const sajuRuntime = runtime();
    const source = requestWithCancellation(
      () => undefined,
      'https://myeongha.example/api/me/saju/calculation?unexpected=1',
    );

    try {
      const response = await sajuRuntime.handleRequest({
        request: source.request,
        requestId: 'req-saju-route-mismatch',
        serverTime: '2026-09-13T11:00:00.000Z',
      });

      expect(response.status).toBe(404);
      expect(source.cancelCalls()).toBe(0);
    } finally {
      await sajuRuntime.close();
    }
  });

  it('preserves bodyless POST authentication before any database or Saju execution', async () => {
    const sajuRuntime = runtime();
    const request = new Request('https://myeongha.example/api/me/saju/calculation', {
      method: 'POST',
    });

    try {
      const response = await sajuRuntime.handleRequest({
        request,
        requestId: 'req-saju-auth-required',
        serverTime: '2026-09-13T11:00:00.000Z',
      });

      expect(response.status).toBe(401);
      expect(request.bodyUsed).toBe(false);
    } finally {
      await sajuRuntime.close();
    }
  });
});
