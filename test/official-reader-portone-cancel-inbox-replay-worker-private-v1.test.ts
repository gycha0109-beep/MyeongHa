import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  stageSignedPortOneV2CancellationInboxV1,
  type OfficialReaderCancelInboxSignedEnvelopeV1,
} from '../apps/api/src/official-reader-portone-cancel-inbox-private-v1.js';
import {
  replayCommittedPortOneV2CancelInboxToShadowPrivateV1,
  type OfficialReaderCancelPrivateInboxStoreV1,
  type OfficialReaderCancelStoredInboxRowV1,
} from '../apps/api/src/official-reader-portone-cancel-inbox-replay-worker-private-v1.js';
import type {
  OfficialReaderCancelObservationInputV1,
} from '../apps/api/src/official-reader-portone-cancel-observation-bridge-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createPrivateOfficialReaderInboxReplayStoreTestV1 } from './support/private-official-reader-cancel-inbox-replay-store-v1.js';

const ID = '00000000-0000-4000-8000-000000000001';
const AT = '2026-10-14T00:00:00.000Z';
const SECRET_BYTES = Buffer.alloc(32, 7);
const WEBHOOK_SECRET = 'whsec_' + SECRET_BYTES.toString('base64');
const HMAC_SECRET = 'synthetic-inbox-hmac-secret-0123456789-abcdef';
const PROVIDER_SECRET = 'synthetic-private-provider-secret';
const PAID = 8900;

function signedEvent(
  type = 'Transaction.Cancelled',
  fields: Record<string, unknown> = {},
) {
  const rawBody = Buffer.from(JSON.stringify({
    type, timestamp: AT,
    data: {
      paymentId: 'payment-1', transactionId: 'transaction-1',
      storeId: 'store-1', cancellationId: 'cancellation-1', ...fields,
    },
  }));
  const webhookId = 'webhook-1';
  const seconds = String(Date.parse(AT) / 1000);
  const signature = createHmac('sha256', SECRET_BYTES)
    .update(webhookId + '.' + seconds + '.').update(rawBody).digest('base64');
  return {
    rawBody,
    headers: {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': seconds,
      'webhook-signature': 'v1,' + signature,
    },
  };
}

function providerPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1', transactionId: 'transaction-1', storeId: 'store-1',
    channel: { type: 'LIVE' },
    status: 'CANCELLED', statusChangedAt: AT,
    amount: { paid: PAID, cancelled: PAID },
    currency: 'KRW',
    cancellations: [{
      id: 'cancellation-1', status: 'SUCCEEDED', totalAmount: PAID,
    }],
    ...overrides,
  };
}

async function signedInbox(
  type = 'Transaction.Cancelled',
  data: Record<string, unknown> = {},
): Promise<OfficialReaderCancelStoredInboxRowV1> {
  let queued: OfficialReaderCancelInboxSignedEnvelopeV1 | undefined;
  const result = await stageSignedPortOneV2CancellationInboxV1({
    request: signedEvent(type, data),
    webhookConfig: {
      environment: 'production', webhookSecrets: [WEBHOOK_SECRET],
      now: () => new Date(AT),
    },
    evidenceHmacSecret: HMAC_SECRET,
    recorder: {
      enqueueSigned: async (item) => {
        queued = item;
        return { intakeResult: 'queued' as const, effectAuthorized: false as const };
      },
    },
  });
  expect(result.kind).toBe('queued');
  if (!queued) throw new Error('Synthetic inbox intake not committed');
  return Object.freeze({
    ...queued, id: ID, provider: 'portone_v2' as const,
    inboxState: 'queued' as const,
  });
}

function harness(row: OfficialReaderCancelStoredInboxRowV1, options: {
  currentRow?: unknown;
  provider?: Record<string, unknown>;
  fetchFailure?: boolean;
  txFailure?: boolean;
  recorderFailure?: boolean;
  evidenceHmacSecret?: string;
  commitFailure?: boolean;
} = {}) {
  const calls: string[] = [];
  const verifiedFacts: OfficialReaderCancelObservationInputV1[] = [];
  const fetchImpl = vi.fn(async (url: string) => {
    calls.push('provider_get');
    if (options.fetchFailure) throw new Error('synthetic timeout');
    expect(url).toBe('https://api.portone.io/payments/payment-1');
    return new Response(JSON.stringify(providerPayment(options.provider)), {
      headers: { 'content-type': 'application/json' },
    });
  });
  const recordVerified = vi.fn(async (facts: OfficialReaderCancelObservationInputV1) => {
    calls.push('record');
    if (options.recorderFailure) throw new Error('synthetic DB record failure');
    verifiedFacts.push(facts);
    return { shadowResult: (verifiedFacts.length > 1 ? 'replayed' : 'observed') as
      'observed' | 'replayed', effectAuthorized: false as const };
  });
  const store: OfficialReaderCancelPrivateInboxStoreV1 = {
    readQueued: async (id) => {
      calls.push('read_committed');
      expect(id).toBe(ID);
      return row;
    },
    async withReadCommittedTransaction<T>(action) {
      calls.push('begin');
      if (options.txFailure) throw new Error('synthetic DB begin failure');
      const result = await action({
        readQueuedForUpdate: async () => {
          calls.push('locked_read');
          return options.currentRow ?? row;
        },
        recordVerified,
      });
      if (options.commitFailure) throw new Error('synthetic COMMIT failed');
      calls.push('commit');
      return result;
    },
  };
  const execute = () => replayCommittedPortOneV2CancelInboxToShadowPrivateV1({
    inboxId: ID, store,
    evidenceHmacSecret: options.evidenceHmacSecret ?? HMAC_SECRET,
    portOneApiSecret: PROVIDER_SECRET, fetchImpl,
  });
  return { execute, calls, fetchImpl, recordVerified, verifiedFacts };
}

describe('private committed PortOne cancellation inbox replay -> 1860 shadow', () => {
  it('reads signed durable facts, GETs independently, then row-locks and records in same committed transaction', async () => {
    const row = await signedInbox();
    const run = harness(row);
    expect(await run.execute()).toEqual({
      kind: 'observed', sourceDisposition: 'full_candidate',
      shadowResult: 'observed',
      providerRefundAuthorized: false, entitlementMutationAuthorized: false,
    });
    expect(run.calls).toEqual([
      'read_committed', 'provider_get', 'begin', 'locked_read', 'record', 'commit',
    ]);
    expect(run.verifiedFacts[0]).toMatchObject({
      webhookId: 'webhook-1',
      paymentId: 'payment-1', transactionId: 'transaction-1',
      cancellationId: 'cancellation-1', sourceDisposition: 'full_candidate',
      paidAmountMinor: PAID, cancelledAmountMinor: PAID, currency: 'KRW',
    });
    expect(run.verifiedFacts[0]?.evidenceFingerprint).toMatch(/^sha256:v1:[a-f0-9]{64}$/u);
    expect(JSON.stringify(run.verifiedFacts)).not.toContain(PROVIDER_SECRET);
    expect(JSON.stringify(row)).not.toContain(WEBHOOK_SECRET);
  });

  it('idempotently replays the same durable inbox and does not mark it complete', async () => {
    const row = await signedInbox();
    const run = harness(row);
    expect((await run.execute()).shadowResult).toBe('observed');
    expect((await run.execute()).shadowResult).toBe('replayed');
    expect(run.fetchImpl).toHaveBeenCalledTimes(2);
    expect(row.inboxState).toBe('queued');
    expect(run.verifiedFacts).toHaveLength(2);
  });

  it('preserves partial, pending and superseded source semantics with zero rights effects', async () => {
    const partial = harness(await signedInbox('Transaction.PartialCancelled'), {
      provider: {
        status: 'PARTIAL_CANCELLED',
        amount: { paid: PAID, cancelled: 2000 },
        cancellations: [{
          id: 'cancellation-1', status: 'SUCCEEDED', totalAmount: 2000,
        }],
      },
    });
    expect((await partial.execute()).sourceDisposition).toBe('partial');
    const pending = harness(await signedInbox('Transaction.CancelPending'), {
      provider: {
        status: 'PAID', amount: { paid: PAID, cancelled: 0 },
        cancellations: [{
          id: 'cancellation-1', status: 'REQUESTED', totalAmount: PAID,
        }],
      },
    });
    expect((await pending.execute()).sourceDisposition).toBe('pending');
    const superseded = harness(await signedInbox('Transaction.PartialCancelled'));
    expect((await superseded.execute()).sourceDisposition).toBe('superseded');
    expect(superseded.verifiedFacts[0]?.sourceDisposition).toBe('superseded');
  });

  it('rejects fake, lost or altered stored facts before external GET', async () => {
    const row = await signedInbox();
    for (const variant of [
      { ...row, paymentId: 'evil-pay' },
      { ...row, eventOccurredAt: '2026-10-14T01:00:00.000Z' },
      { ...row, inboxState: 'processed' },
      { ...row, eventType: 'Transaction.Paid' },
      { ...row, environment: 'sandbox' },
      { ...row, ingressFingerprint: 'sha256:v1:bad' },
      null,
    ]) {
      const run = harness(variant as OfficialReaderCancelStoredInboxRowV1);
      await expect(run.execute()).rejects.toThrow();
      expect(run.fetchImpl).not.toHaveBeenCalled();
      expect(run.recordVerified).not.toHaveBeenCalled();
    }
    const wrongKey = harness(row, { evidenceHmacSecret: HMAC_SECRET + '-changed' });
    await expect(wrongKey.execute()).rejects.toThrow('authenticity recheck');
    expect(wrongKey.fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects provider mismatches, malformed amount and GET timeout without shadow writes', async () => {
    const row = await signedInbox();
    for (const input of [
      { provider: { storeId: 'other-store' } },
      { provider: { transactionId: 'other-transaction' } },
      { provider: { channel: { type: 'TEST' } } },
      { provider: { amount: { paid: PAID, cancelled: 1 } } },
      { fetchFailure: true },
    ]) {
      const run = harness(row, input);
      await expect(run.execute()).rejects.toThrow();
      expect(run.recordVerified).not.toHaveBeenCalled();
      expect(run.calls).not.toContain('begin');
    }
  });

  it('detects changed queued row after provider GET, DB failure and lost COMMIT', async () => {
    const row = await signedInbox();
    const replaced = harness(row, {
      currentRow: { ...row, cancellationId: 'changed-cancellation' },
    });
    await expect(replaced.execute()).rejects.toThrow();
    expect(replaced.recordVerified).not.toHaveBeenCalled();
    const failed = harness(row, { recorderFailure: true });
    await expect(failed.execute()).rejects.toThrow('synthetic DB record failure');
    expect(failed.calls).not.toContain('commit');
    const lost = harness(row, { commitFailure: true });
    await expect(lost.execute()).rejects.toThrow('synthetic COMMIT failed');
    expect(lost.calls).not.toContain('commit');
  });

  it('fails closed on wrong explicit DB UUID', async () => {
    const row = await signedInbox();
    const run = harness(row);
    await expect(replayCommittedPortOneV2CancelInboxToShadowPrivateV1({
      inboxId: 'not-a-uuid', store: {
        readQueued: async () => row,
        withReadCommittedTransaction: async (action) => action({
          readQueuedForUpdate: async () => row,
          recordVerified: async () => ({ shadowResult: 'observed', effectAuthorized: false }),
        }),
      },
      evidenceHmacSecret: HMAC_SECRET, portOneApiSecret: PROVIDER_SECRET,
    })).rejects.toThrow('valid DB inbox UUID');
    expect(run.fetchImpl).not.toHaveBeenCalled();
  });

  it('uses private PostgreSQL SELECT FOR UPDATE, existing 1860 writer and explicit BEGIN/COMMIT only', async () => {
    const row = await signedInbox();
    const statements: string[] = [];
    const pool: PostgresSubjectPoolV1 = {
      connect: async () => ({
        query: async (sql: string) => {
          statements.push(sql);
          if (sql.startsWith('select id::text')) return { rows: [row] };
          if (sql.includes('internal_record_official_reader_portone_cancel_shadow_v1')) {
            return { rows: [{ shadowResult: 'observed', effectAuthorized: false }] };
          }
          return { rows: [] };
        },
        release: () => {},
      }),
    };
    const store = createPrivateOfficialReaderInboxReplayStoreTestV1(pool);
    const fetchImpl = async () => new Response(JSON.stringify(providerPayment()), {
      headers: { 'content-type': 'application/json' },
    });
    const result = await replayCommittedPortOneV2CancelInboxToShadowPrivateV1({
      inboxId: ID, store, evidenceHmacSecret: HMAC_SECRET,
      portOneApiSecret: PROVIDER_SECRET, fetchImpl,
    });
    expect(result.shadowResult).toBe('observed');
    expect(statements).toContain('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(statements).toContain('COMMIT');
    expect(statements.filter(x => x.includes('official_reader_portone_cancel_ingress_inbox_v1')))
      .toHaveLength(2);
    expect(statements.some(x => x.includes("and inbox_state='queued' for update"))).toBe(true);
    expect(statements.some(x => x.includes('internal_record_official_reader_portone_cancel_shadow_v1'))).toBe(true);
    expect(statements).not.toContain('ROLLBACK');
    expect(statements.join(' ')).not.toMatch(/\b(update|delete|grant|revoke)\s+public\./iu);
  });
});
