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
    throw new Error('unsupported-method rejection must not open PostgreSQL');
  },
});

function requestWithCancellation(cancel: () => void | PromiseLike<void>): Readonly<{
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
      method: 'PUT',
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

describe('Production Reading runtime request-body lifecycle', () => {
  it('returns the governed 405 without waiting for unused-body cancellation to settle', async () => {
    const runtime = createRuntime();
    const source = requestWithCancellation(() => new Promise<void>(() => undefined));

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
    const source = requestWithCancellation(() =>
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
});
