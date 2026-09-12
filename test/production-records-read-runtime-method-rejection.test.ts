import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  createProductionLifeRecordReadRuntimeV1,
  createProductionMemoryItemsReadRuntimeV1,
} from '../apps/api/src/production-records-read-runtime.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime:test-password@db.example.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_records_method_rejection',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
});

const UNUSED_POOL: PostgresSubjectPoolV1 = Object.freeze({
  connect() {
    throw new Error('Records method rejection must not open PostgreSQL');
  },
});

function requestWithCancellation(
  path: '/api/life-record' | '/api/memories',
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
    request: new Request(`https://myeongha.example${path}`, {
      method: 'PUT',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelCalls: () => calls,
  });
}

function assertMethodRejection(response: Response): Promise<void> {
  expect(response.status).toBe(405);
  expect(response.headers.get('Allow')).toBe('GET');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  return response.text().then((body) => {
    expect(body).toBe('');
  });
}

describe('Production owner Records method-rejection request-body lifecycle', () => {
  it('returns Life Record 405 without waiting for unused-body cancellation to settle', async () => {
    const runtime = createProductionLifeRecordReadRuntimeV1({
      env: ENV,
      pool: UNUSED_POOL,
    });
    const source = requestWithCancellation(
      '/api/life-record',
      () => new Promise<void>(() => undefined),
    );

    try {
      const response = await runtime.handleRequest({
        request: source.request,
        requestId: 'req-life-record-method-rejection-nonsettling',
        serverTime: '2026-09-13T00:00:00.000Z',
      });

      await assertMethodRejection(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await runtime.close();
    }
  });

  it('keeps Memories 405 authoritative when unused-body cancellation rejects', async () => {
    const runtime = createProductionMemoryItemsReadRuntimeV1({
      env: ENV,
      pool: UNUSED_POOL,
    });
    const source = requestWithCancellation(
      '/api/memories',
      () => Promise.reject(new Error('synthetic cancellation failure')),
    );

    try {
      const response = await runtime.handleRequest({
        request: source.request,
        requestId: 'req-memories-method-rejection-rejecting',
        serverTime: '2026-09-13T00:00:00.000Z',
      });
      await Promise.resolve();

      await assertMethodRejection(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await runtime.close();
    }
  });

  it('does not broaden method-rejection cleanup to a route-mismatch 404', async () => {
    const runtime = createProductionLifeRecordReadRuntimeV1({
      env: ENV,
      pool: UNUSED_POOL,
    });
    const source = requestWithCancellation('/api/memories', () => undefined);

    try {
      const response = await runtime.handleRequest({
        request: source.request,
        requestId: 'req-life-record-route-mismatch',
        serverTime: '2026-09-13T00:00:00.000Z',
      });

      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(source.cancelCalls()).toBe(0);
      await source.request.body?.cancel();
    } finally {
      await runtime.close();
    }
  });
});
