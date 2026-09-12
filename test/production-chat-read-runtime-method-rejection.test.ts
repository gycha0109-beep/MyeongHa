import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createProductionChatReadRuntimeV1 } from '../apps/api/src/production-chat-read-runtime.js';

const THREAD_ID = '93000000-0000-4000-8000-000000000001';
const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime:test-password@db.example.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_chat_method_rejection',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
});

const UNUSED_POOL: PostgresSubjectPoolV1 = Object.freeze({
  connect() {
    throw new Error('Chat method rejection/auth rejection must not open PostgreSQL');
  },
});

function requestWithCancellation(input: {
  readonly path: string;
  readonly method: string;
  readonly cancel: () => void | PromiseLike<void>;
}): Readonly<{
  request: Request;
  cancelCalls: () => number;
}> {
  let calls = 0;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      calls += 1;
      return input.cancel();
    },
  });

  return Object.freeze({
    request: new Request(`https://myeongha.example${input.path}`, {
      method: input.method,
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelCalls: () => calls,
  });
}

function runtime() {
  return createProductionChatReadRuntimeV1({
    env: ENV,
    pool: UNUSED_POOL,
    createUuid: () => '33333333-3333-4333-8333-333333333333',
  });
}

async function assertMethodRejection(response: Response, allow: string): Promise<void> {
  expect(response.status).toBe(405);
  expect(response.headers.get('Allow')).toBe(allow);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.text()).toBe('');
}

describe('Production Chat method-rejection request-body lifecycle', () => {
  it('returns Chat-open 405 without waiting for unused-body cancellation to settle', async () => {
    const chatRuntime = runtime();
    const source = requestWithCancellation({
      path: '/api/chat',
      method: 'PUT',
      cancel: () => new Promise<void>(() => undefined),
    });

    try {
      const response = await chatRuntime.handleRequest({
        request: source.request,
        requestId: 'req-chat-open-method-rejection-nonsettling',
        serverTime: '2026-09-13T00:00:00.000Z',
      });

      await assertMethodRejection(response, 'POST');
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await chatRuntime.close();
    }
  });

  it('keeps Chat-read 405 authoritative when unused-body cancellation rejects', async () => {
    const chatRuntime = runtime();
    const source = requestWithCancellation({
      path: `/api/chat/${THREAD_ID}`,
      method: 'POST',
      cancel: () => Promise.reject(new Error('synthetic cancellation failure')),
    });

    try {
      const response = await chatRuntime.handleRequest({
        request: source.request,
        requestId: 'req-chat-read-method-rejection-rejecting',
        serverTime: '2026-09-13T00:00:00.000Z',
      });
      await Promise.resolve();

      await assertMethodRejection(response, 'GET');
      expect(source.cancelCalls()).toBe(1);
    } finally {
      await chatRuntime.close();
    }
  });

  it('preserves the protected Chat-open 401 body-untouched contract', async () => {
    const chatRuntime = runtime();
    const source = requestWithCancellation({
      path: '/api/chat',
      method: 'POST',
      cancel: () => undefined,
    });

    try {
      const response = await chatRuntime.handleRequest({
        request: source.request,
        requestId: 'req-chat-open-auth-rejection-body-preservation',
        serverTime: '2026-09-13T00:00:00.000Z',
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(source.request.bodyUsed).toBe(false);
      expect(source.cancelCalls()).toBe(0);
      await source.request.body?.cancel();
    } finally {
      await chatRuntime.close();
    }
  });

  it('keeps invalid Chat-read GET outside method-rejection cleanup', async () => {
    const chatRuntime = runtime();
    const request = new Request('https://myeongha.example/api/not-chat');

    try {
      const response = await chatRuntime.handleRequest({
        request,
        requestId: 'req-chat-invalid-read-route',
        serverTime: '2026-09-13T00:00:00.000Z',
      });

      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'INVALID_REQUEST', retryable: false },
      });
      expect(request.body).toBeNull();
    } finally {
      await chatRuntime.close();
    }
  });
});
