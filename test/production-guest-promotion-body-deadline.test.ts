import { afterEach, describe, expect, it, vi } from 'vitest';
import { INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1 } from '../apps/api/src/ingress-request-body-deadline.js';
import { createProductionGuestPromotionRuntimeV1 } from '../apps/api/src/production-guest-promotion-runtime.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_guest_promotion_body_deadline',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
});

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_JWT = 'member.header.signature';
const GUEST_BEARER = 'guest-bearer-for-promotion-body-deadline-v1';

function nonClosingEmptyObjectRequest(): {
  request: Request;
  stream: ReadableStream<Uint8Array>;
  cancelCalls: () => number;
} {
  let calls = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{}'));
    },
    cancel() {
      calls += 1;
    },
  });
  const request = new Request('https://myeongha.example/api/auth/promote-guest', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${MEMBER_JWT}`,
      'x-myeongha-guest-bearer': GUEST_BEARER,
    },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  return { request, stream, cancelCalls: () => calls };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Production Guest promotion body-completion deadline', () => {
  it('maps authenticated body-completion expiry to governed 408 without reaching DB work', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ id: MEMBER_ID }, { status: 200 }),
    );
    const input = nonClosingEmptyObjectRequest();
    const runtime = createProductionGuestPromotionRuntimeV1({ env: ENV });

    try {
      const responsePromise = runtime.handleRequest({
        request: input.request,
        requestId: 'req-guest-promotion-body-timeout',
        serverTime: '2026-09-16T00:00:00.000Z',
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
      const response = await responsePromise;

      expect(response.status).toBe(408);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        ok: false,
        error: {
          code: 'REQUEST_BODY_TIMEOUT',
          messageKey: 'auth.request_body_timeout',
          retryable: false,
        },
        meta: {
          apiContractVersion: 'v0.9',
          requestId: 'req-guest-promotion-body-timeout',
        },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(input.cancelCalls()).toBe(1);
      expect(input.stream.locked).toBe(false);
    } finally {
      await runtime.close();
    }
  });
});
