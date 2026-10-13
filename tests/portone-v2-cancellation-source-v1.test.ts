import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  verifyPortOneV2CancellationSourceV1,
  PortOneV2CancelSourceErrorV1,
} from '../apps/api/src/portone-v2-cancellation-source-v1.js';
import type { PortOneV2PaymentHttpFetchV1 } from '../apps/api/src/portone-v2-payment-verification-adapter.js';

const NOW = new Date('2026-10-13T03:00:00.000Z');
const SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const SECRET = 'whsec_' + SECRET_BYTES.toString('base64');
const EVENT_TIMESTAMP = '2026-10-13T02:59:59.000Z';

function signedRequest(type = 'Transaction.Cancelled', overrides: Record<string, unknown> = {}) {
  const rawBody = JSON.stringify({
    type, timestamp: EVENT_TIMESTAMP,
    data: {
      paymentId: 'p-1', transactionId: 'tx-1', storeId: 'store-1',
      cancellationId: 'cancel-2', ...overrides,
    },
  });
  const clock = String(Math.floor(NOW.getTime() / 1000));
  const signature = createHmac('sha256', SECRET_BYTES)
    .update('msg_1').update('.').update(clock).update('.')
    .update(rawBody).digest('base64');
  return {
    rawBody,
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'msg_1',
      'webhook-timestamp': clock,
      'webhook-signature': 'v1,' + signature,
    },
  };
}

const payment = {
  id: 'p-1', transactionId: 'tx-1', storeId: 'store-1',
  status: 'CANCELLED', channel: { type: 'LIVE' },
  amount: { total: 10000, paid: 10000, cancelled: 10000 },
  currency: 'KRW', statusChangedAt: '2026-10-13T02:59:59.000Z',
  cancellations: [
    { id: 'cancel-1', status: 'SUCCEEDED', totalAmount: 4000 },
    { id: 'cancel-2', status: 'SUCCEEDED', totalAmount: 6000 },
  ],
};

function fetcher(responseBody: unknown = payment) {
  return vi.fn(async () => new Response(JSON.stringify(responseBody), {
    status: 200, headers: { 'content-type': 'application/json' },
  })) as unknown as PortOneV2PaymentHttpFetchV1;
}
const webhookConfig = {
  environment: 'production' as const, webhookSecrets: [SECRET], now: () => NOW,
};
function run(options: {
  type?: string;
  eventData?: Record<string, unknown>;
  source?: unknown;
  fetchImpl?: PortOneV2PaymentHttpFetchV1;
  request?: ReturnType<typeof signedRequest>;
} = {}) {
  return verifyPortOneV2CancellationSourceV1({
    request: options.request ?? signedRequest(options.type, options.eventData),
    webhookConfig, apiSecret: 'server-only-secret',
    fetchImpl: options.fetchImpl ?? fetcher(options.source),
  });
}

describe('D3e signed PortOne cancellation -> independent GET, no effects', () => {
  it('confirms complete multi-step cancellation only as non-authorizing candidate', async () => {
    const http = fetcher();
    const r = await run({ fetchImpl: http });
    expect(r).toMatchObject({
      disposition: 'full_candidate',
      eventType: 'Transaction.Cancelled',
      cancellationId: 'cancel-2',
      providerPaidAmountMinor: 10000, providerCancelledAmountMinor: 10000,
      requiresDurableOrdering: true,
      providerRefundAuthorized: false, entitlementMutationAuthorized: false,
    });
    expect(http).toHaveBeenCalledTimes(1);
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(url).toBe('https://api.portone.io/payments/p-1');
    expect(init).toMatchObject({
      method: 'GET', redirect: 'error',
      headers: { authorization: 'PortOne server-only-secret' },
    });
    expect(Object.isFrozen(r)).toBe(true);
  });
  it('holds a signed partial cancellation with the original partial snapshot', async () => {
    const r = await run({
      type: 'Transaction.PartialCancelled',
      source: {
        ...payment, status: 'PARTIAL_CANCELLED',
        amount: { total: 10000, paid: 10000, cancelled: 4000 },
        cancellations: [payment.cancellations[0]],
      },
      eventData: { cancellationId: 'cancel-1' },
    });
    expect(r.disposition).toBe('partial');
    expect(r.entitlementMutationAuthorized).toBe(false);
  });
  it('does NOT promote an out-of-order signed partial to full when GET is now CANCELLED', async () => {
    const r = await run({
      type: 'Transaction.PartialCancelled', eventData: { cancellationId: 'cancel-1' },
    });
    expect(r.disposition).toBe('superseded');
    expect(r.providerCancelledAmountMinor).toBe(10000);
    expect(r.entitlementMutationAuthorized).toBe(false);
  });
  it('holds a pending asynchronous cancellation', async () => {
    const r = await run({ type: 'Transaction.CancelPending' });
    expect(r.disposition).toBe('pending');
  });
  it('ignores signed unknown event without a provider lookup', async () => {
    const http = fetcher();
    const r = await run({ type: 'Transaction.UnknownFutureEvent', fetchImpl: http });
    expect(r.disposition).toBe('ignored');
    expect(http).not.toHaveBeenCalled();
  });
  it('ignores signed Paid and does not disrupt existing Paid callback route', async () => {
    const http = fetcher();
    const r = await run({ type: 'Transaction.Paid', fetchImpl: http });
    expect(r.disposition).toBe('ignored');
    expect(http).not.toHaveBeenCalled();
  });
  it('rejects forged signature before calling provider', async () => {
    const http = fetcher();
    const req = signedRequest();
    await expect(run({ request: {
      ...req, headers: { ...req.headers, 'webhook-signature': 'v1,ZmFrZQ==' },
    }, fetchImpl: http })).rejects.toBeDefined();
    expect(http).not.toHaveBeenCalled();
  });
  it.each([
    ['payment ID mismatch', { ...payment, id: 'wrong-p' }, 'SOURCE_MISMATCH'],
    ['transaction mismatch', { ...payment, transactionId: 'wrong-tx' }, 'SOURCE_MISMATCH'],
    ['store mismatch', { ...payment, storeId: 'wrong-store' }, 'SOURCE_MISMATCH'],
    ['TEST channel in production', { ...payment, channel: { type: 'TEST' } }, 'SOURCE_MISMATCH'],
    ['amount sum mismatch', { ...payment, amount: { paid: 10000, cancelled: 7000 } }, 'INVALID_SOURCE'],
    ['duplicate cancellation ID', { ...payment,
      cancellations: [payment.cancellations[0], payment.cancellations[0]] }, 'INVALID_SOURCE'],
    ['failed cancellation sum', { ...payment,
      cancellations: [{ id: 'cancel-2', status: 'FAILED', totalAmount: 10000 }] }, 'INVALID_SOURCE'],
    ['fractional cancelled', { ...payment, amount: { paid: 10000, cancelled: 9999.5 } }, 'INVALID_SOURCE'],
    ['invalid API timestamp', { ...payment, statusChangedAt: 'yesterday' }, 'INVALID_SOURCE'],
    ['missing original amount', { ...payment, amount: { cancelled: 10000 } }, 'INVALID_SOURCE'],
  ] as const)('%s fails closed', async (_name, source, code) => {
    await expect(run({ source })).rejects.toMatchObject({ code });
  });
  it('withholds full candidate for an unmatched cancellationId', async () => {
    const r = await run({ eventData: { cancellationId: 'cancel-unknown' } });
    expect(r.disposition).toBe('superseded');
  });
  it('withholds full candidate when payment source reports PARTIAL_CANCELLED', async () => {
    const r = await run({
      source: { ...payment, status: 'PARTIAL_CANCELLED',
        amount: { paid: 10000, cancelled: 10000 } },
    });
    expect(r.disposition).toBe('superseded');
  });
  it('requires cancellation ID even though PortOne schema marks it optional', async () => {
    await expect(run({ eventData: { cancellationId: undefined } }))
      .rejects.toMatchObject({ code: 'INVALID_SOURCE' });
  });
  it('does not trust an HTML provider response', async () => {
    const http = vi.fn(async () => new Response('<html/>', {
      status: 200, headers: { 'content-type': 'text/html' },
    })) as unknown as PortOneV2PaymentHttpFetchV1;
    await expect(run({ fetchImpl: http })).rejects.toMatchObject({ code: 'LOOKUP_FAILED' });
  });
  it('rejects an oversized streamed JSON response', async () => {
    const http = vi.fn(async () => new Response(' '.repeat(70000), {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as unknown as PortOneV2PaymentHttpFetchV1;
    await expect(run({ fetchImpl: http })).rejects.toMatchObject({ code: 'LOOKUP_TOO_LARGE' });
  });
  it('does not include or leak a provider API secret in outputs', async () => {
    const r = await run();
    expect(JSON.stringify(r)).not.toContain('server-only-secret');
  });
});
