import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  observeVerifiedPortOneV2CancellationShadowV1,
  type OfficialReaderCancelObservationRecorderV1,
} from '../apps/api/src/official-reader-portone-cancel-observation-bridge-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createPrivateOfficialReaderCancelObservationRecorderTestV1 } from './support/private-official-reader-cancel-recorder-v1.js';

const SECRET_BYTES = Buffer.alloc(32, 11);
const SECRET = 'whsec_' + SECRET_BYTES.toString('base64');
const NOW = '2026-10-14T00:00:00.000Z';
const PAID = 8900;

function signed(eventType = 'Transaction.Cancelled', overrides: Record<string, unknown> = {}) {
  const body = {
    type: eventType, timestamp: NOW,
    data: {
      paymentId: 'server-owned-payment-1',
      transactionId: 'provider-transaction-1',
      storeId: 'verified-store-1',
      cancellationId: 'provider-cancellation-1',
      ...overrides,
    },
  };
  const raw = Buffer.from(JSON.stringify(body));
  const webhookId = 'webhook-1';
  const timestamp = String(Date.parse(NOW) / 1000);
  const signature = createHmac('sha256', SECRET_BYTES)
    .update(webhookId + '.' + timestamp + '.').update(raw).digest('base64');
  return {
    rawBody: raw,
    headers: {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': 'v1,' + signature,
    },
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'server-owned-payment-1',
    transactionId: 'provider-transaction-1',
    storeId: 'verified-store-1',
    channel: { type: 'LIVE' },
    status: 'CANCELLED',
    statusChangedAt: NOW,
    amount: { paid: PAID, cancelled: PAID },
    currency: 'KRW',
    cancellations: [{
      id: 'provider-cancellation-1',
      status: 'SUCCEEDED',
      totalAmount: PAID,
    }],
    ...overrides,
  };
}

function execution(input: {
  eventType?: string;
  data?: Record<string, unknown>;
  provider?: Record<string, unknown>;
  recorder?: OfficialReaderCancelObservationRecorderV1;
  signatureInvalid?: boolean;
  lookupFail?: boolean;
} = {}) {
  const request = signed(input.eventType, input.data);
  if (input.signatureInvalid) request.headers['webhook-signature'] = 'v1,' + Buffer.alloc(32).toString('base64');
  const fetchImpl = vi.fn(async (_url: string, _init: unknown) => {
    if (input.lookupFail) throw new Error('upstream timeout');
    return new Response(JSON.stringify(payment(input.provider)), {
      headers: { 'content-type': 'application/json' },
    });
  });
  const recordVerified = vi.fn(async (_fact: import('../apps/api/src/official-reader-portone-cancel-observation-bridge-v1.js').OfficialReaderCancelObservationInputV1) => ({
    shadowResult: 'observed' as const, effectAuthorized: false as const,
  }));
  const recorder = input.recorder ?? { recordVerified };
  return {
    fetchImpl, recordVerified,
    promise: observeVerifiedPortOneV2CancellationShadowV1({
      request,
      webhookConfig: { environment: 'production', webhookSecrets: [SECRET], now: () => new Date(NOW) },
      apiSecret: 'server-secret-not-public',
      fetchImpl,
      recorder,
    }),
  };
}

describe('private PortOne cancellation observation candidate', () => {
  it('requires signed cancellation and independent provider GET before recording; never mutates rights', async () => {
    const run = execution();
    const result = await run.promise;
    expect(run.fetchImpl).toHaveBeenCalledOnce();
    expect(run.fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.portone.io/payments/server-owned-payment-1',
    );
    expect(run.recordVerified).toHaveBeenCalledOnce();
    const fact = run.recordVerified.mock.calls[0]?.[0];
    expect(fact).toMatchObject({
      webhookId: 'webhook-1',
      paymentId: 'server-owned-payment-1',
      transactionId: 'provider-transaction-1',
      cancellationId: 'provider-cancellation-1',
      eventType: 'Transaction.Cancelled',
      sourceDisposition: 'full_candidate',
      paidAmountMinor: PAID,
      cancelledAmountMinor: PAID,
      currency: 'KRW',
    });
    expect(fact?.evidenceFingerprint).toMatch(/^sha256:v1:[a-f0-9]{64}$/u);
    expect(result).toEqual({
      kind: 'observed', sourceDisposition: 'full_candidate',
      shadowResult: 'observed',
      providerRefundAuthorized: false, entitlementMutationAuthorized: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(fact)).not.toContain('server-secret-not-public');
  });

  it('keeps paid and unrelated signed events outside the cancel observation', async () => {
    for (const type of ['Transaction.Paid', 'Unrecognized.Future.Event']) {
      const run = execution({ eventType: type });
      expect(await run.promise).toEqual({
        kind: 'ignored', sourceDisposition: 'ignored', shadowResult: null,
        providerRefundAuthorized: false, entitlementMutationAuthorized: false,
      });
      expect(run.fetchImpl).not.toHaveBeenCalled();
      expect(run.recordVerified).not.toHaveBeenCalled();
    }
  });

  it('preserves PARTIAL, PENDING and superseded event meaning without promotion to full', async () => {
    const partial = execution({
      eventType: 'Transaction.PartialCancelled',
      provider: {
        status: 'PARTIAL_CANCELLED',
        amount: { paid: PAID, cancelled: 4000 },
        cancellations: [{ id: 'provider-cancellation-1', status: 'SUCCEEDED', totalAmount: 4000 }],
      },
    });
    expect((await partial.promise).sourceDisposition).toBe('partial');
    const pending = execution({
      eventType: 'Transaction.CancelPending',
      provider: {
        status: 'PAID', amount: { paid: PAID, cancelled: 0 },
        cancellations: [{ id: 'provider-cancellation-1', status: 'REQUESTED', totalAmount: PAID }],
      },
    });
    expect((await pending.promise).sourceDisposition).toBe('pending');
    const stale = execution({ eventType: 'Transaction.PartialCancelled' });
    expect((await stale.promise).sourceDisposition).toBe('superseded');
  });

  it('rejects forged signature, mismatched provider IDs and amount corruption without writing', async () => {
    for (const caseInput of [
      { signatureInvalid: true },
      { provider: { transactionId: 'another-transaction' } },
      { provider: { storeId: 'another-store' } },
      { provider: { amount: { paid: PAID, cancelled: 4000 } } },
      { provider: { currency: 'BAD_CURRENCY' } },
      { data: { paymentId: 'different-payment' } },
    ]) {
      const run = execution(caseInput);
      await expect(run.promise).rejects.toThrow();
      expect(run.recordVerified).not.toHaveBeenCalled();
    }
  });

  it('does not acknowledge a provider timeout or failed durable recorder', async () => {
    const timeout = execution({ lookupFail: true });
    await expect(timeout.promise).rejects.toThrow();
    expect(timeout.recordVerified).not.toHaveBeenCalled();
    const broken = execution({
      recorder: { recordVerified: async () => { throw Error('DB connection failed'); } },
    });
    await expect(broken.promise).rejects.toThrow('DB connection failed');
  });

  it('rejects a recorder that pretends observation authorizes a right', async () => {
    const broken = execution({
      recorder: {
        recordVerified: async () => ({
          shadowResult: 'observed', effectAuthorized: true,
        }) as unknown as Awaited<ReturnType<OfficialReaderCancelObservationRecorderV1['recordVerified']>>,
      },
    });
    await expect(broken.promise).rejects.toThrow('must not authorize entitlement');
  });

  it('adapts only the pre-existing private shadow SQL and fails closed on malformed DB rows', async () => {
    const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) => ({
      rows: [{ shadowResult: 'replayed', effectAuthorized: false }],
    }));
    const recorder = createPrivateOfficialReaderCancelObservationRecorderTestV1({
      query,
    } as unknown as PostgresTransactionQueryV1);
    const run = execution({ recorder });
    expect((await run.promise).shadowResult).toBe('replayed');
    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('internal_record_official_reader_portone_cancel_shadow_v1');
    expect(sql).not.toMatch(/\b(?:insert|update|delete|grant|revoke)\b/iu);
    expect(params).toHaveLength(12);
    expect(params?.[0]).toBe('webhook-1');
    expect(params?.[8]).toBe(PAID);

    const bad = createPrivateOfficialReaderCancelObservationRecorderTestV1({
      query: async () => ({ rows: [{ shadowResult: 'observed', effectAuthorized: true }] }),
    } as unknown as PostgresTransactionQueryV1);
    await expect(execution({ recorder: bad }).promise).rejects.toThrow('invalid no-effect result');
  });

  it('derives deterministic evidence from verified facts only and never from raw forged fields', async () => {
    const a = execution();
    const b = execution();
    await Promise.all([a.promise, b.promise]);
    expect(a.recordVerified.mock.calls[0]?.[0].evidenceFingerprint)
      .toBe(b.recordVerified.mock.calls[0]?.[0].evidenceFingerprint);
    const altered = execution({ provider: { statusChangedAt: '2026-10-14T00:01:00.000Z' } });
    await altered.promise;
    expect(altered.recordVerified.mock.calls[0]?.[0].evidenceFingerprint)
      .not.toBe(a.recordVerified.mock.calls[0]?.[0].evidenceFingerprint);
  });
});
