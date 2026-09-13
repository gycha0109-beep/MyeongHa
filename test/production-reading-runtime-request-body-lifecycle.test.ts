import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createProductionReadingHistoryReadRuntimeV1 } from '../apps/api/src/production-records-read-runtime.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime:test-password@db.example.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_reading_method_rejection',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
});

const UNUSED_POOL: PostgresSubjectPoolV1 = Object.freeze({
  connect() {
    throw new Error('terminal rejection must not open PostgreSQL');
  },
});

function requestWithCancellation(
  method: 'POST' | 'PUT',
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
    request: new Request('https://myeongha.example/api/readings', {
      method,
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelCalls: () => calls,
  });
}

function createRuntime() {
  return createProductionReadingHistoryReadRuntimeV1({
    env: ENV,
    pool: UNUSED_POOL,
  });
}

async function expectAuthRequired(response: Response): Promise<void> {
  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toMatchObject({
    ok: false,
    error: {
      code: 'AUTH_REQUIRED',
      messageKey: 'auth.required',
      retryable: false,
    },
  });
}

describe('Production Reading runtime request-body lifecycle', () => {
  it('returns the governed 405 without waiting for unused-body cancellation to settle', async () => {
    const runtime = createRuntime();
    const source = requestWithCancellation('PUT', () => new Promise<void>(() => undefined));

    try {
      const response = await runtime.handleRequest({
        request: source.request,
        requestId: 'req-reading-method-rejection-nonsettling',
        serverTime: '2026-09-13T00:00:00.000Z',
      });

      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, POST');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.text()).toBe('');
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await runtime.close();
    }
  });

  it('keeps the governed 405 authoritative when unused-body cancellation rejects', async () => {
    const runtime = createRuntime();
    const source = requestWithCancellation('PUT', () =>
      Promise.reject(new Error('synthetic cancellation failure')),
    );

    try {
      const response = await runtime.handleRequest({
        request: source.request,
        requestId: 'req-reading-method-rejection-rejecting',
        serverTime: '2026-09-13T00:00:00.000Z',
      });
      await Promise.resolve();

      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, POST');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.text()).toBe('');
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await runtime.close();
    }
  });

  it('returns AUTH_REQUIRED without waiting for unused POST-body cancellation to settle', async () => {
    const runtime = createRuntime();
    const source = requestWithCancellation('POST', () => new Promise<void>(() => undefined));

    try {
      const response = await runtime.handleRequest({
        request: source.request,
        requestId: 'req-reading-auth-rejection-nonsettling',
        serverTime: '2026-09-14T00:00:00.000Z',
      });

      await expectAuthRequired(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await runtime.close();
    }
  });

  it('keeps AUTH_REQUIRED authoritative when unused POST-body cancellation rejects', async () => {
    const runtime = createRuntime();
    const source = requestWithCancellation('POST', () =>
      Promise.reject(new Error('synthetic cancellation failure')),
    );

    try {
      const response = await runtime.handleRequest({
        request: source.request,
        requestId: 'req-reading-auth-rejection-rejecting',
        serverTime: '2026-09-14T00:00:00.000Z',
      });
      await Promise.resolve();

      await expectAuthRequired(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await runtime.close();
    }
  });

  it('keeps AUTH_REQUIRED authoritative when body cancellation throws synchronously', async () => {
    const runtime = createRuntime();
    const source = requestWithCancellation('POST', () => undefined);
    const body = source.request.body;
    if (body === null) throw new Error('test request must carry a body');
    Object.defineProperty(body, 'cancel', {
      configurable: true,
      value() {
        throw new Error('synthetic synchronous cancellation failure');
      },
    });

    try {
      const response = await runtime.handleRequest({
        request: source.request,
        requestId: 'req-reading-auth-rejection-throwing',
        serverTime: '2026-09-14T00:00:00.000Z',
      });

      await expectAuthRequired(response);
    } finally {
      await runtime.close();
    }
  });

  it('keeps a bodyless unauthenticated POST harmless', async () => {
    const runtime = createRuntime();

    try {
      const response = await runtime.handleRequest({
        request: new Request('https://myeongha.example/api/readings', { method: 'POST' }),
        requestId: 'req-reading-auth-rejection-bodyless',
        serverTime: '2026-09-14T00:00:00.000Z',
      });

      await expectAuthRequired(response);
    } finally {
      await runtime.close();
    }
  });
});
