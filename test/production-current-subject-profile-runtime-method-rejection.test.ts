import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createProductionCurrentSubjectProfileRuntimeV1 } from '../apps/api/src/production-current-subject-profile-runtime.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime:test-password@db.example.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_profile_method_rejection',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
});

const UNUSED_POOL: PostgresSubjectPoolV1 = Object.freeze({
  connect() {
    throw new Error('Current Subject Profile method rejection must not open PostgreSQL');
  },
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
    request: new Request('https://myeongha.example/api/me', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelCalls: () => calls,
  });
}

function runtime() {
  return createProductionCurrentSubjectProfileRuntimeV1({
    env: ENV,
    pool: UNUSED_POOL,
  });
}

async function assertMethodRejection(response: Response): Promise<void> {
  expect(response.status).toBe(405);
  expect(response.headers.get('Allow')).toBe('GET');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.text()).toBe('');
}

describe('Production Current Subject Profile method-rejection request-body lifecycle', () => {
  it('returns 405 without waiting for unused-body cancellation to settle', async () => {
    const profileRuntime = runtime();
    const source = requestWithCancellation(() => new Promise<void>(() => undefined));

    try {
      const response = await profileRuntime.handleRequest({
        request: source.request,
        requestId: 'req-profile-method-rejection-nonsettling',
        serverTime: '2026-09-13T00:00:00.000Z',
      });

      await assertMethodRejection(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await profileRuntime.close();
    }
  });

  it('keeps 405 authoritative when unused-body cancellation rejects', async () => {
    const profileRuntime = runtime();
    const source = requestWithCancellation(() =>
      Promise.reject(new Error('synthetic cancellation failure')),
    );

    try {
      const response = await profileRuntime.handleRequest({
        request: source.request,
        requestId: 'req-profile-method-rejection-rejecting',
        serverTime: '2026-09-13T00:00:00.000Z',
      });
      await Promise.resolve();

      await assertMethodRejection(response);
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await profileRuntime.close();
    }
  });

  it('keeps bodyless method rejection harmless', async () => {
    const profileRuntime = runtime();
    const request = new Request('https://myeongha.example/api/me', { method: 'PUT' });

    try {
      const response = await profileRuntime.handleRequest({
        request,
        requestId: 'req-profile-method-rejection-bodyless',
        serverTime: '2026-09-13T00:00:00.000Z',
      });

      await assertMethodRejection(response);
      expect(request.body).toBeNull();
    } finally {
      await profileRuntime.close();
    }
  });
});
