import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1,
} from '../apps/api/src/portone-v2-webhook-payment-completion.js';
import { handlePortOneV2WebhookRequestV1 } from '../apps/api/src/portone-v2-webhook-http.js';
import type { CommercePaymentVerificationAdapterV1 } from '../apps/api/src/commerce-payment-verification-execution.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const ROUTE = 'https://myeongha.test/api/commerce/webhooks/portone-v2';
const NOW = new Date('2026-09-14T06:40:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;

function sign(rawBody: Uint8Array, timestamp = NOW_SECONDS): string {
  return `v1,${createHmac('sha256', SECRET_BYTES)
    .update('msg_1')
    .update('.')
    .update(String(timestamp))
    .update('.')
    .update(rawBody)
    .digest('base64')}`;
}

function requestFromStream(
  stream: ReadableStream<Uint8Array>,
  headers: Readonly<Record<string, string>> = {},
): Request {
  const init = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' };
  return new Request(ROUTE, init);
}

function unusedPool(counter?: { calls: number }): PostgresSubjectPoolV1 {
  return {
    connect: async () => {
      if (counter !== undefined) counter.calls += 1;
      throw new Error('unexpected DB access');
    },
  } as unknown as PostgresSubjectPoolV1;
}

function unusedAdapter(counter?: { calls: number }): CommercePaymentVerificationAdapterV1 {
  return {
    verify: async () => {
      if (counter !== undefined) counter.calls += 1;
      throw new Error('unexpected provider access');
    },
  };
}

function config() {
  return {
    environment: 'sandbox' as const,
    webhookSecrets: [SECRET],
    now: () => NOW,
  };
}

async function handle(request: Request, counters?: {
  readonly pool: { calls: number };
  readonly adapter: { calls: number };
}) {
  return handlePortOneV2WebhookRequestV1({
    request,
    pool: unusedPool(counters?.pool),
    config: config(),
    verificationAdapter: unusedAdapter(counters?.adapter),
  });
}

describe('PortOne V2 webhook HTTP streaming body bound', () => {
  it('stops reading when a no-Content-Length stream crosses the existing byte bound', async () => {
    let pullCalls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCalls += 1;
          if (pullCalls === 1) {
            controller.enqueue(
              new Uint8Array(PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1),
            );
            return;
          }
          if (pullCalls === 2) {
            controller.enqueue(new Uint8Array([0]));
            return;
          }
          throw new Error('reader consumed bytes after oversize was already proven');
        },
      },
      { highWaterMark: 0 },
    );
    const request = requestFromStream(stream);

    const response = await handle(request);

    expect(response.status).toBe(400);
    expect(pullCalls).toBe(2);
    expect(request.bodyUsed).toBe(true);
    expect(request.body?.locked).toBe(false);
  });

  it('maps stream read failure to the existing safe 400 and releases the reader lock', async () => {
    let pullCalls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull() {
          pullCalls += 1;
          throw new Error('RAW_BODY_SECRET');
        },
      },
      { highWaterMark: 0 },
    );
    const request = requestFromStream(stream);

    const response = await handle(request);

    expect(response.status).toBe(400);
    expect(pullCalls).toBe(1);
    expect(request.bodyUsed).toBe(true);
    expect(request.body?.locked).toBe(false);
    expect(JSON.stringify(await response.json())).not.toContain('RAW_BODY_SECRET');
  });

  it('maps reader acquisition failure from an already locked request body to the existing safe 400', async () => {
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          controller.enqueue(new TextEncoder().encode('{}'));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = requestFromStream(stream);
    const heldReader = request.body?.getReader();
    const counters = {
      pool: { calls: 0 },
      adapter: { calls: 0 },
    };

    expect(heldReader).toBeDefined();
    expect(request.body?.locked).toBe(true);

    try {
      const response = await handle(request, counters);

      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'INVALID_WEBHOOK',
          retryable: false,
        },
      });
      expect(counters.pool.calls).toBe(0);
      expect(counters.adapter.calls).toBe(0);
      expect(request.body?.locked).toBe(true);
    } finally {
      heldReader?.releaseLock();
    }

    expect(request.body?.locked).toBe(false);
  });

  it('keeps declared oversize rejection before request-body acquisition', async () => {
    let pullCalls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCalls += 1;
          controller.enqueue(new Uint8Array([1]));
        },
      },
      { highWaterMark: 0 },
    );
    const request = requestFromStream(stream, {
      'content-length': String(PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1 + 1),
    });

    const response = await handle(request);

    expect(response.status).toBe(400);
    expect(pullCalls).toBe(0);
    expect(request.bodyUsed).toBe(false);
    expect(request.body?.locked).toBe(false);
  });

  it('preserves an exact-limit signed payload byte-for-byte', async () => {
    const payload = ` {\n  "type": "Future.NewEvent",\n  "timestamp": "2026-09-14T06:39:59.000Z",\n  "data": {"paymentId":"payment-1","transactionId":"transaction-1","environment":"production","subjectId":"22222222-2222-4222-8222-222222222222","amount":999999,"currency":"USD","productId":"attacker-product"}\n } `;
    const payloadBytes = new TextEncoder().encode(payload);
    expect(payloadBytes.byteLength).toBeLessThan(PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1);
    const rawBody = new TextEncoder().encode(
      `${payload}${' '.repeat(PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1 - payloadBytes.byteLength)}`,
    );
    expect(rawBody.byteLength).toBe(PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1);

    let pullCalls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCalls += 1;
          if (pullCalls === 1) {
            controller.enqueue(rawBody);
            return;
          }
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = requestFromStream(stream, {
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(NOW_SECONDS),
      'webhook-signature': sign(rawBody),
    });
    const counters = {
      pool: { calls: 0 },
      adapter: { calls: 0 },
    };

    const response = await handle(request, counters);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(pullCalls).toBe(2);
    expect(request.body?.locked).toBe(false);
    expect(counters.pool.calls).toBe(0);
    expect(counters.adapter.calls).toBe(0);
  });
});
