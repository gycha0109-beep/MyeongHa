import { describe, expect, it, vi } from 'vitest';
import type { CommercePaymentVerificationAdapterV1 } from '../apps/api/src/commerce-payment-verification-execution.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1,
} from '../apps/api/src/portone-v2-webhook-payment-completion.js';
import { handlePortOneV2WebhookRequestV1 } from '../apps/api/src/portone-v2-webhook-http.js';

const ROUTE = 'https://myeongha.test/api/commerce/webhooks/portone-v2';
const WEBHOOK_SECRET = `whsec_${Buffer.alloc(32, 7).toString('base64')}`;

interface InjectedReaderV1 {
  read(): Promise<Readonly<{ done: boolean; value?: Uint8Array }>>;
  releaseLock(): void;
}

function requestWithReader(reader: InjectedReaderV1): Request {
  const request = new Request(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'x',
  });
  Object.defineProperty(request, 'body', {
    configurable: true,
    value: {
      getReader() {
        return reader;
      },
    },
  });
  return request;
}

function harness() {
  const connect = vi.fn(async () => {
    throw new Error('DB_MUST_NOT_BE_REACHED');
  });
  const verify = vi.fn(async () => {
    throw new Error('PROVIDER_MUST_NOT_BE_REACHED');
  });
  return {
    pool: { connect } as unknown as PostgresSubjectPoolV1,
    adapter: { verify } as unknown as CommercePaymentVerificationAdapterV1,
    connect,
    verify,
  };
}

function config() {
  return {
    environment: 'sandbox' as const,
    webhookSecrets: [WEBHOOK_SECRET],
    now: () => new Date('2026-09-15T03:00:00.000Z'),
  };
}

async function expectSafeInvalidWebhook(
  request: Request,
  h: ReturnType<typeof harness>,
): Promise<void> {
  const response = await handlePortOneV2WebhookRequestV1({
    request,
    pool: h.pool,
    config: config(),
    verificationAdapter: h.adapter,
  });

  expect(response.status).toBe(400);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({
    ok: false,
    error: { code: 'INVALID_WEBHOOK', retryable: false },
  });
  expect(h.connect).not.toHaveBeenCalled();
  expect(h.verify).not.toHaveBeenCalled();
}

describe('PortOne V2 webhook request reader release cleanup', () => {
  it('preserves the governed invalid-webhook result when read failure is followed by releaseLock failure', async () => {
    const read = vi.fn(async () => {
      throw new Error('BODY_READ_INTERNAL_DETAIL');
    });
    const releaseLock = vi.fn(() => {
      throw new Error('RELEASE_LOCK_INTERNAL_DETAIL');
    });
    const h = harness();

    await expectSafeInvalidWebhook(
      requestWithReader({ read, releaseLock }),
      h,
    );

    expect(read).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('preserves the governed streamed-oversize result when releaseLock fails', async () => {
    const read = vi.fn(async () => ({
      done: false,
      value: new Uint8Array(PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1 + 1),
    }));
    const releaseLock = vi.fn(() => {
      throw new Error('RELEASE_LOCK_INTERNAL_DETAIL');
    });
    const h = harness();

    await expectSafeInvalidWebhook(
      requestWithReader({ read, releaseLock }),
      h,
    );

    expect(read).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed non-Uint8Array chunk before Buffer.concat or Commerce work', async () => {
    const read = vi
      .fn<InjectedReaderV1['read']>()
      .mockResolvedValueOnce({
        done: false,
        value: { byteLength: 1 } as unknown as Uint8Array,
      })
      .mockResolvedValueOnce({ done: true });
    const releaseLock = vi.fn();
    const h = harness();

    await expectSafeInvalidWebhook(
      requestWithReader({ read, releaseLock }),
      h,
    );

    expect(read).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed done shape before reading another chunk or Commerce work', async () => {
    const read = vi
      .fn<InjectedReaderV1['read']>()
      .mockResolvedValueOnce({
        done: 0 as unknown as boolean,
        value: new Uint8Array([123]),
      })
      .mockResolvedValueOnce({ done: true });
    const releaseLock = vi.fn();
    const h = harness();

    await expectSafeInvalidWebhook(
      requestWithReader({ read, releaseLock }),
      h,
    );

    expect(read).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});
