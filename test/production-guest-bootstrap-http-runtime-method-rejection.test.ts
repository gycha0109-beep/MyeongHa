import { describe, expect, it } from 'vitest';
import { createProductionGuestBootstrapHttpRuntimeV1 } from '../apps/api/src/production-guest-bootstrap-http-runtime.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_guest_bootstrap_method_rejection',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
  MYEONGHA_GUEST_SESSION_TTL_SECONDS: '604800',
});

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
    request: new Request('https://myeongha.example/api/session/bootstrap', {
      method: 'PUT',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelCalls: () => calls,
  });
}

function runtime() {
  return createProductionGuestBootstrapHttpRuntimeV1({ env: ENV });
}

async function assertMethodRejection(response: Response): Promise<void> {
  expect(response.status).toBe(405);
  expect(response.headers.get('Allow')).toBe('POST');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.text()).toBe('');
}

describe('Production Guest bootstrap method-rejection request-body lifecycle', () => {
  it('returns 405 without waiting for unused-body cancellation to settle', async () => {
    const guestRuntime = runtime();
    const source = requestWithCancellation(() => new Promise<void>(() => undefined));

    try {
      const response = await guestRuntime.handleRequest({
        request: source.request,
        requestId: 'req-guest-bootstrap-method-rejection-nonsettling',
        serverTime: '2026-09-13T11:40:00.000Z',
      });

      await assertMethodRejection(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await guestRuntime.close();
    }
  });

  it('keeps 405 authoritative when unused-body cancellation rejects', async () => {
    const guestRuntime = runtime();
    const source = requestWithCancellation(() =>
      Promise.reject(new Error('synthetic cancellation failure')),
    );

    try {
      const response = await guestRuntime.handleRequest({
        request: source.request,
        requestId: 'req-guest-bootstrap-method-rejection-rejecting',
        serverTime: '2026-09-13T11:40:00.000Z',
      });
      await Promise.resolve();

      await assertMethodRejection(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await guestRuntime.close();
    }
  });

  it('keeps bodyless method rejection harmless', async () => {
    const guestRuntime = runtime();
    const request = new Request('https://myeongha.example/api/session/bootstrap', {
      method: 'GET',
    });

    try {
      const response = await guestRuntime.handleRequest({
        request,
        requestId: 'req-guest-bootstrap-method-rejection-bodyless',
        serverTime: '2026-09-13T11:40:00.000Z',
      });

      await assertMethodRejection(response);
      expect(request.body).toBeNull();
    } finally {
      await guestRuntime.close();
    }
  });
});
