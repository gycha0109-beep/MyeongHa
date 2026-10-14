/**
 * D3e4 PRIVATE offline one-item replay bridge:
 * committed 1910 inbox -> keyed-fingerprint check -> independent PortOne GET
 * -> same-transaction 1910 row-lock recheck + 1860 private observation.
 *
 * No HTTP mount, scheduler, runtime credentials/GRANT, state advancement,
 * legal Commerce evidence promotion, refund or entitlement mutation.
 * Queued-only rows deliberately remain queued; 1860 makes replay idempotent.
 * A future lifecycle/retention worker needs separate audited approval.
 */
import { timingSafeEqual } from 'node:crypto';
import {
  fingerprintOfficialReaderCancelInboxEnvelopeV1,
  type OfficialReaderCancelInboxEnvelopeV1,
} from './official-reader-portone-cancel-inbox-private-v1.js';
import {
  verifyPortOneV2CancelEnvelopeAgainstProviderV1,
  type PortOneV2PersistedCancelEnvelopeV1,
} from './portone-v2-cancellation-source-v1.js';
import {
  recordVerifiedPortOneV2CancellationShadowV1,
  type OfficialReaderCancelObservationRecorderV1,
  type OfficialReaderCancelObservationResultV1,
} from './official-reader-portone-cancel-observation-bridge-v1.js';
import type { PortOneV2PaymentHttpFetchV1 } from './portone-v2-payment-verification-adapter.js';

export type OfficialReaderCancelStoredInboxRowV1<S extends 'queued' | 'leased' = 'queued'> = Readonly<{
  id: string;
  provider: 'portone_v2';
  inboxState: S;
  ingressFingerprint: string;
} & OfficialReaderCancelInboxEnvelopeV1>;

export interface OfficialReaderCancelInboxObservationTransactionV1
  extends OfficialReaderCancelObservationRecorderV1 {
  /** Must SELECT ... FOR UPDATE and return exactly one queued persisted row. */
  readQueuedForUpdate(inboxId: string): Promise<unknown>;
}

export interface OfficialReaderCancelPrivateInboxStoreV1 {
  /** DB read; row must be from committed 1910 state (never caller payload). */
  readQueued(inboxId: string): Promise<unknown>;
  /** Callback returns only after a READ COMMITTED DB transaction COMMIT. */
  withReadCommittedTransaction<T>(
    execute: (tx: OfficialReaderCancelInboxObservationTransactionV1) => Promise<T>,
  ): Promise<T>;
}

export type OfficialReaderCancelPrivateReplayResultV1 = Readonly<{
  kind: 'observed';
  sourceDisposition: Exclude<OfficialReaderCancelObservationResultV1['sourceDisposition'], 'ignored'>;
  shadowResult: Exclude<OfficialReaderCancelObservationResultV1['shadowResult'], null>;
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FINGERPRINT = /^hmac-sha256:k1:([a-f0-9]{64})$/u;
const SOURCE_ID = /^[^\u0000-\u001f\u007f]+$/u;

function safeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512
    || value.trim() !== value || !SOURCE_ID.test(value)) {
    throw new Error('Stored cancellation inbox ' + label + ' is invalid.');
  }
  return value;
}

export function validateCommittedPortOneInboxRowPrivateV1<S extends 'queued' | 'leased'>(
  value: unknown, requestedId: string, secret: string, expectedState: S,
): OfficialReaderCancelStoredInboxRowV1<S> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Committed PortOne cancellation inbox row is unavailable.');
  }
  const item = value as Record<string, unknown>;
  if (item.id !== requestedId || item.provider !== 'portone_v2'
    || item.inboxState !== expectedState
    || (item.environment !== 'production' && item.environment !== 'sandbox')
    || (item.eventType !== 'Transaction.CancelPending'
      && item.eventType !== 'Transaction.PartialCancelled'
      && item.eventType !== 'Transaction.Cancelled')
    || typeof item.eventOccurredAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(item.eventOccurredAt)
    || !Number.isFinite(Date.parse(item.eventOccurredAt))
    || new Date(Date.parse(item.eventOccurredAt)).toISOString() !== item.eventOccurredAt
    || typeof item.ingressFingerprint !== 'string') {
    throw new Error('Committed PortOne cancellation inbox row violates private contract.');
  }
  const actual = FINGERPRINT.exec(item.ingressFingerprint);
  if (actual === null) throw new Error('Committed PortOne cancellation inbox fingerprint is invalid.');
  const envelope: OfficialReaderCancelInboxEnvelopeV1 = Object.freeze({
    environment: item.environment,
    webhookId: safeId(item.webhookId, 'webhook'),
    paymentId: safeId(item.paymentId, 'payment'),
    transactionId: safeId(item.transactionId, 'transaction'),
    storeId: safeId(item.storeId, 'store'),
    cancellationId: safeId(item.cancellationId, 'cancellation'),
    eventType: item.eventType,
    eventOccurredAt: item.eventOccurredAt,
  });
  const expected = fingerprintOfficialReaderCancelInboxEnvelopeV1(envelope, secret);
  const match = FINGERPRINT.exec(expected);
  if (match === null || !timingSafeEqual(
    Buffer.from(actual[1]!, 'hex'), Buffer.from(match[1]!, 'hex'),
  )) {
    throw new Error('Committed PortOne cancellation inbox authenticity recheck failed.');
  }
  return Object.freeze({
    id: requestedId, provider: 'portone_v2' as const, inboxState: expectedState,
    ...envelope, ingressFingerprint: item.ingressFingerprint,
  });
}

export function identicalCommittedPortOneInboxRowPrivateV1<S extends 'queued' | 'leased'>(
  a: OfficialReaderCancelStoredInboxRowV1<S>, b: OfficialReaderCancelStoredInboxRowV1<S>,
): boolean {
  return a.id === b.id && a.provider === b.provider && a.environment === b.environment
    && a.inboxState === b.inboxState && a.webhookId === b.webhookId
    && a.paymentId === b.paymentId && a.transactionId === b.transactionId
    && a.storeId === b.storeId && a.cancellationId === b.cancellationId
    && a.eventType === b.eventType && a.eventOccurredAt === b.eventOccurredAt
    && a.ingressFingerprint === b.ingressFingerprint;
}

/** One explicit ID only: scheduler, candidate claiming and lifetime are NOT built. */
export async function replayCommittedPortOneV2CancelInboxToShadowPrivateV1(input: Readonly<{
  inboxId: string;
  store: OfficialReaderCancelPrivateInboxStoreV1;
  evidenceHmacSecret: string;
  portOneApiSecret: string;
  fetchImpl?: PortOneV2PaymentHttpFetchV1;
  timeoutMs?: number;
}>): Promise<OfficialReaderCancelPrivateReplayResultV1> {
  if (typeof input.inboxId !== 'string' || !UUID.test(input.inboxId)) {
    throw new Error('Private cancellation replay requires a valid DB inbox UUID.');
  }
  const original = validateCommittedPortOneInboxRowPrivateV1(
    await input.store.readQueued(input.inboxId), input.inboxId, input.evidenceHmacSecret, 'queued',
  );
  // Do not construct a fake webhook or re-sign expired provider signatures.
  // The HMAC is verified above and GET is the independent source of truth.
  const envelope: PortOneV2PersistedCancelEnvelopeV1 = Object.freeze({
    environment: original.environment, webhookId: original.webhookId,
    paymentId: original.paymentId, transactionId: original.transactionId,
    storeId: original.storeId, cancellationId: original.cancellationId,
    eventType: original.eventType, eventOccurredAt: original.eventOccurredAt,
  });
  const verifiedSource = await verifyPortOneV2CancelEnvelopeAgainstProviderV1({
    envelope,
    apiSecret: input.portOneApiSecret,
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
  if (verifiedSource.disposition === 'ignored') {
    throw new Error('Persisted cancellation cannot become an ignored source event.');
  }

  // One short transaction AFTER network GET: lock and re-validate stored row,
  // then record verified facts in existing 1860. The injected store must COMMIT
  // before resolving. If any step fails: rollback and retry/HOLD; no rights.
  return input.store.withReadCommittedTransaction(async (tx) => {
    const fresh = validateCommittedPortOneInboxRowPrivateV1(
      await tx.readQueuedForUpdate(input.inboxId),
      input.inboxId, input.evidenceHmacSecret, 'queued',
    );
    if (!identicalCommittedPortOneInboxRowPrivateV1(original, fresh)) {
      throw new Error('PortOne cancellation inbox changed during independent verification.');
    }
    const saved = await recordVerifiedPortOneV2CancellationShadowV1({
      verifiedSource, recorder: tx,
    });
    if (saved.shadowResult === null || saved.sourceDisposition === 'ignored') {
      throw new Error('Private PortOne cancellation observation returned invalid source result.');
    }
    return Object.freeze({
      kind: 'observed' as const,
      sourceDisposition: saved.sourceDisposition,
      shadowResult: saved.shadowResult,
      providerRefundAuthorized: false as const,
      entitlementMutationAuthorized: false as const,
    });
  });
}
