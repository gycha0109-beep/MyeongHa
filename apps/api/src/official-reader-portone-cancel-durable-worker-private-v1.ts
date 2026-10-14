/**
 * D3e5 PRIVATE, EXPLICITLY INVOKED ONE-ITEM WORKER CANDIDATE.
 *
 * 1910 durable inbox / 1920 SKIP LOCKED claim+fencing -> K1 HMAC source check
 * -> independent bounded PortOne GET outside DB transaction -> locked source
 * recheck + 1860 shadow record + 1920 completion in ONE transaction.
 *
 * Failures persist only allowlisted failure codes, with retry/backoff or HOLD.
 * No production runtime caller, network scheduler, automatic TTL deletion,
 * raw provider payload persistence, refund or entitlement authorization.
 */
import type { PortOneV2PaymentHttpFetchV1 } from './portone-v2-payment-verification-adapter.js';
import {
  verifyPortOneV2CancelEnvelopeAgainstProviderV1,
  PortOneV2CancelSourceErrorV1,
} from './portone-v2-cancellation-source-v1.js';
import {
  validateCommittedPortOneInboxRowPrivateV1,
  identicalCommittedPortOneInboxRowPrivateV1,
  type OfficialReaderCancelStoredInboxRowV1,
} from './official-reader-portone-cancel-inbox-replay-worker-private-v1.js';
import {
  recordVerifiedPortOneV2CancellationShadowV1,
  type OfficialReaderCancelObservationRecorderV1,
} from './official-reader-portone-cancel-observation-bridge-v1.js';

export type PrivateCancelWorkFailureCodeV1 =
  | 'LOOKUP_FAILED' | 'LOOKUP_TIMEOUT' | 'LOOKUP_TOO_LARGE'
  | 'INVALID_SOURCE' | 'SOURCE_MISMATCH' | 'INBOX_INVALID'
  | 'INBOX_INTEGRITY' | 'INBOX_CHANGED' | 'SHADOW_CONFLICT'
  | 'INTERNAL_FAILURE' | 'INVALID_WORKER_RESULT';

export type PrivateCancelWorkStateV1 = 'completed' | 'held' | 'retry_wait' | 'dead_letter';

export type PrivateCancelLeaseV1 = Readonly<{
  inboxId: string;
  claimToken: string;
  claimAttemptCount: number;
  claimExpiresAt: string;
  effectAuthorized: false;
}>;

export type PrivateCancelLeasedInboxRowV1 = Readonly<OfficialReaderCancelStoredInboxRowV1<'leased'> & {
  leaseOwner: string;
  leaseToken: string;
  attemptCount: number;
}>;

export interface PrivateCancelWorkTransactionV1 extends OfficialReaderCancelObservationRecorderV1 {
  /** SELECT exact ID, owner, token, state='leased' FOR UPDATE. */
  readLeasedForUpdate(inboxId: string, owner: string, token: string): Promise<unknown>;
  /** 1920 completion checks lease (incl expiry) and matching 1860 on the same TX. */
  completeObservation(inboxId: string, owner: string, token: string): Promise<unknown>;
}

export interface PrivateCancelWorkStoreV1 {
  /** One SQL transaction commits before returning, no uncommitted claim leaks. */
  claimNext(workerId: string, leaseSeconds: number): Promise<unknown>;
  /** Read the durable, claimed source, never a user-supplied webhook body. */
  readLeased(inboxId: string, owner: string, token: string): Promise<unknown>;
  /** COMMIT on success; ROLLBACK on any failure. */
  withReadCommittedTransaction<T>(
    run: (tx: PrivateCancelWorkTransactionV1) => Promise<T>,
  ): Promise<T>;
  /** Separate durable transaction; only allowed failure code, no exception strings. */
  failClaim(
    inboxId: string, owner: string, token: string,
    code: PrivateCancelWorkFailureCodeV1, retryable: boolean,
  ): Promise<unknown>;
}

export type PrivateCancelWorkTickResultV1 =
  | Readonly<{ kind: 'idle'; effectAuthorized: false }>
  | Readonly<{
      kind: PrivateCancelWorkStateV1;
      attemptCount: number;
      failureCode: PrivateCancelWorkFailureCodeV1 | 'ORDERING_REVIEW' | null;
      nextAttemptAt: string | null;
      effectAuthorized: false;
      providerRefundAuthorized: false;
      entitlementMutationAuthorized: false;
    }>;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const WORKER = /^[A-Za-z0-9_-]{1,96}$/u;

class PrivateCancelWorkerFailureV1 extends Error {
  constructor(readonly code: PrivateCancelWorkFailureCodeV1,
    readonly retryable: boolean) {
    super('Private PortOne cancellation worker held or retried.');
    this.name = 'PrivateCancelWorkerFailureV1';
  }
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function parsedDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString() === value;
}

function claimed(value: unknown): PrivateCancelLeaseV1 | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Private cancellation claim returned invalid DB shape.');
  }
  const x = value as Record<string, unknown>;
  if (!uuid(x.inboxId) || !uuid(x.claimToken)
    || typeof x.claimAttemptCount !== 'number'
    || !Number.isSafeInteger(x.claimAttemptCount)
    || x.claimAttemptCount < 1 || x.claimAttemptCount > 8
    || !parsedDate(x.claimExpiresAt) || x.effectAuthorized !== false) {
    throw new Error('Private cancellation claim returned invalid DB shape.');
  }
  return Object.freeze({
    inboxId: x.inboxId, claimToken: x.claimToken,
    claimAttemptCount: x.claimAttemptCount, claimExpiresAt: x.claimExpiresAt,
    effectAuthorized: false as const,
  });
}

function leasedRow(
  value: unknown, lease: PrivateCancelLeaseV1, owner: string, key: string,
): PrivateCancelLeasedInboxRowV1 {
  const row = validateCommittedPortOneInboxRowPrivateV1(
    value, lease.inboxId, key, 'leased',
  );
  const x = value as Record<string, unknown>;
  if (x.leaseToken !== lease.claimToken || x.leaseOwner !== owner
    || x.attemptCount !== lease.claimAttemptCount) {
    throw new PrivateCancelWorkerFailureV1('INBOX_CHANGED', false);
  }
  return Object.freeze({
    ...row, leaseOwner: owner, leaseToken: lease.claimToken,
    attemptCount: lease.claimAttemptCount,
  });
}

function classify(error: unknown): Readonly<{
  code: PrivateCancelWorkFailureCodeV1; retryable: boolean;
}> {
  if (error instanceof PrivateCancelWorkerFailureV1) {
    return { code: error.code, retryable: error.retryable };
  }
  if (error instanceof PortOneV2CancelSourceErrorV1) {
    return {
      code: error.code,
      retryable: error.code === 'LOOKUP_FAILED' || error.code === 'LOOKUP_TIMEOUT',
    };
  }
  if (typeof error === 'object' && error !== null
    && 'constraint' in error
    && (error as { constraint?: unknown }).constraint === 'd3e2_shadow_webhook_identity_conflict') {
    return { code: 'SHADOW_CONFLICT', retryable: false };
  }
  if (error instanceof Error && /authenticity recheck failed|fingerprint is invalid/u.test(error.message)) {
    return { code: 'INBOX_INTEGRITY', retryable: false };
  }
  if (error instanceof Error && /inbox row|source ID is invalid|timestamp is invalid/u.test(error.message)) {
    return { code: 'INBOX_INVALID', retryable: false };
  }
  return { code: 'INTERNAL_FAILURE', retryable: true };
}

function failureResult(value: unknown, code: PrivateCancelWorkFailureCodeV1,
  attemptCount: number): PrivateCancelWorkTickResultV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Private worker failure did not produce a durable state.');
  }
  const x = value as Record<string, unknown>;
  if (!['retry_wait', 'held', 'dead_letter'].includes(x.failureState as string)
    || x.effectAuthorized !== false
    || (x.failureState === 'retry_wait' ? !parsedDate(x.retryDueAt) : x.retryDueAt !== null)) {
    throw new Error('Private worker failure returned an invalid durable status.');
  }
  return Object.freeze({
    kind: x.failureState as 'retry_wait' | 'held' | 'dead_letter',
    attemptCount, failureCode: code,
    nextAttemptAt: x.retryDueAt as string | null,
    effectAuthorized: false as const, providerRefundAuthorized: false as const,
    entitlementMutationAuthorized: false as const,
  });
}

function completionResult(value: unknown, attemptCount: number): PrivateCancelWorkTickResultV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PrivateCancelWorkerFailureV1('INVALID_WORKER_RESULT', false);
  }
  const x = value as Record<string, unknown>;
  if ((x.completionState !== 'completed' && x.completionState !== 'held')
    || !uuid(x.linkedObservationId) || x.effectAuthorized !== false) {
    throw new PrivateCancelWorkerFailureV1('INVALID_WORKER_RESULT', false);
  }
  return Object.freeze({
    kind: x.completionState,
    attemptCount,
    failureCode: x.completionState === 'held' ? 'ORDERING_REVIEW' as const : null,
    nextAttemptAt: null,
    effectAuthorized: false as const, providerRefundAuthorized: false as const,
    entitlementMutationAuthorized: false as const,
  });
}

function staleLeaseError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'constraint' in error
    && ['d3e5_stale_completion_lease', 'd3e5_stale_failure_lease'].includes(
      (error as { constraint?: unknown }).constraint as string,
    );
}

/**
 * Explicit, OFFLINE one-tick candidate. Fetch adapter is REQUIRED, so using
 * default global fetch or connecting to live PortOne cannot happen here.
 * A later approved scheduler can trigger this only after role/retention gates.
 */
export async function processOnePrivatePortOneCancelWorkV1(input: Readonly<{
  store: PrivateCancelWorkStoreV1;
  workerId: string;
  leaseSeconds: number;
  lookupTimeoutMs: number;
  evidenceHmacSecret: string;
  portOneApiSecret: string;
  fetchImpl: PortOneV2PaymentHttpFetchV1;
}>): Promise<PrivateCancelWorkTickResultV1> {
  if (typeof input.workerId !== 'string' || !WORKER.test(input.workerId)
    || !Number.isSafeInteger(input.leaseSeconds)
    || input.leaseSeconds < 45 || input.leaseSeconds > 900
    || !Number.isSafeInteger(input.lookupTimeoutMs)
    || input.lookupTimeoutMs < 1 || input.lookupTimeoutMs > 30000
    || input.leaseSeconds <= Math.ceil(input.lookupTimeoutMs / 1000) + 10
    || typeof input.fetchImpl !== 'function') {
    throw new Error('Private cancellation worker execution configuration is invalid.');
  }

  const lease = claimed(await input.store.claimNext(input.workerId, input.leaseSeconds));
  if (lease === null) return Object.freeze({ kind: 'idle', effectAuthorized: false as const });

  try {
    const original = leasedRow(
      await input.store.readLeased(lease.inboxId, input.workerId, lease.claimToken),
      lease, input.workerId, input.evidenceHmacSecret,
    );
    const verified = await verifyPortOneV2CancelEnvelopeAgainstProviderV1({
      envelope: Object.freeze({
        environment: original.environment,
        webhookId: original.webhookId,
        paymentId: original.paymentId,
        transactionId: original.transactionId,
        storeId: original.storeId,
        cancellationId: original.cancellationId,
        eventType: original.eventType,
        eventOccurredAt: original.eventOccurredAt,
      }),
      apiSecret: input.portOneApiSecret,
      fetchImpl: input.fetchImpl,
      timeoutMs: input.lookupTimeoutMs,
    });
    if (verified.disposition === 'ignored') {
      throw new PrivateCancelWorkerFailureV1('INVALID_SOURCE', false);
    }

    // No network call while any row lock is held. Completion and shadow
    // creation both live in this exact DB transaction, with fencing.
    return await input.store.withReadCommittedTransaction(async (tx) => {
      const fresh = leasedRow(
        await tx.readLeasedForUpdate(lease.inboxId, input.workerId, lease.claimToken),
        lease, input.workerId, input.evidenceHmacSecret,
      );
      if (!identicalCommittedPortOneInboxRowPrivateV1(original, fresh)) {
        throw new PrivateCancelWorkerFailureV1('INBOX_CHANGED', false);
      }
      const saved = await recordVerifiedPortOneV2CancellationShadowV1({
        verifiedSource: verified, recorder: tx,
      });
      if (saved.kind !== 'observed' || saved.shadowResult === null) {
        throw new PrivateCancelWorkerFailureV1('INVALID_WORKER_RESULT', false);
      }
      const done = completionResult(
        await tx.completeObservation(lease.inboxId, input.workerId, lease.claimToken),
        lease.claimAttemptCount,
      );
      // An ordering conflict must remain HELD, never marked completed.
      if ((saved.shadowResult === 'out_of_order' || saved.shadowResult === 'ordering_unproven')
        && done.kind !== 'held') {
        throw new PrivateCancelWorkerFailureV1('INVALID_WORKER_RESULT', false);
      }
      return done;
    });
  } catch (error) {
    // An expired/stolen lease may have been reissued. Do not write any
    // failure state with a stale claim; caller can only observe an exception.
    if (staleLeaseError(error)) throw error;
    const classification = classify(error);
    // This failure write is a separate, committed DB transaction. If the
    // previous COMMIT succeeded but its ACK was lost, SQL fencing rejects the
    // stale failure instead of corrupting a completed record.
    const failed = await input.store.failClaim(
      lease.inboxId, input.workerId, lease.claimToken,
      classification.code, classification.retryable,
    );
    return failureResult(failed, classification.code, lease.claimAttemptCount);
  }
}
