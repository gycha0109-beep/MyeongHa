import { describe, expect, it } from 'vitest';
import { createProductionGuestPromotionRuntimeV1 } from '../apps/api/src/production-guest-promotion-runtime.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_guest_promotion_auth_before_body',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
});

type NonClosingRequestInput = Readonly<{
  method?: string;
  headers?: HeadersInit;
  cancel?: () => void | PromiseLike<void>;
}>;

function nonClosingRequest(input: NonClosingRequestInput = {}): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"unexpected":'));
    },
    cancel() {
      return input.cancel?.();
    },
  });

  return new Request('https://myeongha.example/api/auth/promote-guest', {
    method: input.method ?? 'POST',
    headers: input.headers,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

async function expectAuthFailure(input: {
  readonly request: Request;
  readonly code: 'GUEST_AUTH_REQUIRED' | 'MEMBER_AUTH_REQUIRED';
}): Promise<void> {
  const runtime = createProductionGuestPromotionRuntimeV1({ env: ENV });
  try {
    const response = await runtime.handleRequest({
      request: input.request,
      requestId: 'req-guest-promotion-auth-before-body',
      serverTime: '2026-09-12T00:00:00.000Z',
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: input.code,
        retryable: false,
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: 'req-guest-promotion-auth-before-body',
      },
    });
    expect(input.request.bodyUsed).toBe(false);
  } finally {
    await input.request.body?.cancel();
    await runtime.close();
  }
}

describe('Production Guest promotion auth-before-body boundary', () => {
  it('returns method rejection without waiting for unused body cancellation to settle', async () => {
    let cancelCalled = false;
    const request = nonClosingRequest({
      method: 'PUT',
      cancel() {
        cancelCalled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const runtime = createProductionGuestPromotionRuntimeV1({ env: ENV });

    try {
      const response = await runtime.handleRequest({
        request,
        requestId: 'req-guest-promotion-method-rejection-non-settling-cancel',
        serverTime: '2026-09-12T00:00:00.000Z',
      });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
      expect(cancelCalled).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it('preserves method rejection when unused body cancellation rejects', async () => {
    let cancelCalled = false;
    const request = nonClosingRequest({
      method: 'PUT',
      cancel() {
        cancelCalled = true;
        return Promise.reject(new Error('synthetic cancellation failure'));
      },
    });
    const runtime = createProductionGuestPromotionRuntimeV1({ env: ENV });

    try {
      const response = await runtime.handleRequest({
        request,
        requestId: 'req-guest-promotion-method-rejection-rejected-cancel',
        serverTime: '2026-09-12T00:00:00.000Z',
      });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
      expect(cancelCalled).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it('returns GUEST_AUTH_REQUIRED without consuming a non-closing request body', async () => {
    await expectAuthFailure({
      request: nonClosingRequest(),
      code: 'GUEST_AUTH_REQUIRED',
    });
  });

  it('returns MEMBER_AUTH_REQUIRED without consuming a non-closing request body', async () => {
    await expectAuthFailure({
      request: nonClosingRequest({
        headers: {
          'x-myeongha-guest-bearer': 'guest-bearer-present-for-auth-order-regression',
        },
      }),
      code: 'MEMBER_AUTH_REQUIRED',
    });
  });
});
