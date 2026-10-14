/**
 * D3e6 PRIVATE bounded operations adapter. Not a hosted scheduler and
 * deliberately does not create timers, HTTP requests, DB clients or role GRANTs.
 * Caller injects the already-reviewed D3e5 worker tick and a read-only,
 * aggregate-only DB snapshot. Never returns webhook IDs or consumer identifiers.
 */
import type {
  PrivateCancelWorkTickResultV1,
} from './official-reader-portone-cancel-durable-worker-private-v1.js';

export type PrivateCancelHealthSnapshotV1 = Readonly<{
  queuedDue: number;
  retryDue: number;
  leasedActive: number;
  leasedExpired: number;
  held: number;
  deadLetter: number;
  completed: number;
  oldestUnresolvedAgeSeconds: number;
  effectAuthorized: false;
}>;

export type PrivateCancelHealthAlertCodeV1 =
  | 'HELD_REVIEW_REQUIRED'
  | 'DEAD_LETTER_REVIEW_REQUIRED'
  | 'EXPIRED_LEASES_PRESENT'
  | 'UNRESOLVED_AGE_EXCEEDED';

export type PrivateCancelBatchSummaryV1 = Readonly<{
  attempts: number;
  outcomes: Readonly<{
    completed: number; held: number; retryWait: number; deadLetter: number;
  }>;
  before: PrivateCancelHealthSnapshotV1;
  after: PrivateCancelHealthSnapshotV1;
  alerts: readonly PrivateCancelHealthAlertCodeV1[];
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
}>;

export interface PrivateCancelHealthPortV1 {
  /** Read from 1930 aggregate-only function using private DB owner. */
  snapshot(): Promise<unknown>;
}

const FIELDS = [
  'queuedDue','retryDue','leasedActive','leasedExpired',
  'held','deadLetter','completed','oldestUnresolvedAgeSeconds',
] as const;

export function validatePrivateCancelHealthV1(input: unknown): PrivateCancelHealthSnapshotV1 {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Private cancellation queue health must be a single aggregate record.');
  }
  const row = input as Record<string, unknown>;
  if (row.effectAuthorized !== false || FIELDS.some(key =>
    typeof row[key] !== 'number' || !Number.isSafeInteger(row[key]) || row[key] < 0
  )) {
    throw new Error('Private cancellation queue health violates zero-effect aggregate contract.');
  }
  // Explicit projection prevents accidental leakage of future DB identifier columns.
  return Object.freeze({
    queuedDue: row.queuedDue as number,
    retryDue: row.retryDue as number,
    leasedActive: row.leasedActive as number,
    leasedExpired: row.leasedExpired as number,
    held: row.held as number,
    deadLetter: row.deadLetter as number,
    completed: row.completed as number,
    oldestUnresolvedAgeSeconds: row.oldestUnresolvedAgeSeconds as number,
    effectAuthorized: false,
  });
}

export function classifyPrivateCancelHealthAlertsV1(
  snapshot: PrivateCancelHealthSnapshotV1, staleThresholdSeconds: number,
): readonly PrivateCancelHealthAlertCodeV1[] {
  if (!Number.isSafeInteger(staleThresholdSeconds)
    || staleThresholdSeconds < 60 || staleThresholdSeconds > 604800) {
    throw new Error('Private cancellation queue age alert threshold invalid.');
  }
  const alerts: PrivateCancelHealthAlertCodeV1[] = [];
  if (snapshot.held > 0) alerts.push('HELD_REVIEW_REQUIRED');
  if (snapshot.deadLetter > 0) alerts.push('DEAD_LETTER_REVIEW_REQUIRED');
  if (snapshot.leasedExpired > 0) alerts.push('EXPIRED_LEASES_PRESENT');
  if (snapshot.oldestUnresolvedAgeSeconds >= staleThresholdSeconds) {
    alerts.push('UNRESOLVED_AGE_EXCEEDED');
  }
  return Object.freeze(alerts);
}

/**
 * Explicit, sequential, non-recurring work window. Never "auto runs".
 * Loop stops on idle or at most 20 ticks and exposes only aggregate counts.
 * Any thrown error is propagated: no implicit success/alert suppression.
 */
export async function runPrivateCancelBoundedWindowV1(input: Readonly<{
  health: PrivateCancelHealthPortV1;
  tick: () => Promise<PrivateCancelWorkTickResultV1>;
  maxTicks: number;
  staleThresholdSeconds: number;
}>): Promise<PrivateCancelBatchSummaryV1> {
  if (!Number.isSafeInteger(input.maxTicks)
    || input.maxTicks < 1 || input.maxTicks > 20
    || typeof input.tick !== 'function'
    || !Number.isSafeInteger(input.staleThresholdSeconds)
    || input.staleThresholdSeconds < 60 || input.staleThresholdSeconds > 604800) {
    throw new Error('Private cancellation bounded work window config invalid.');
  }
  const before = validatePrivateCancelHealthV1(await input.health.snapshot());
  const counters = { completed: 0, held: 0, retryWait: 0, deadLetter: 0 };
  let attempts = 0;
  for (let i = 0; i < input.maxTicks; i += 1) {
    const value = await input.tick();
    if (value.effectAuthorized !== false) {
      throw new Error('Private cancellation runner denied an effect-authorizing result.');
    }
    if (value.kind === 'idle') break;
    if (value.providerRefundAuthorized !== false
      || value.entitlementMutationAuthorized !== false) {
      throw new Error('Private cancellation runner denied a financial/right effect.');
    }
    if (value.kind === 'completed') counters.completed += 1;
    else if (value.kind === 'held') counters.held += 1;
    else if (value.kind === 'retry_wait') counters.retryWait += 1;
    else if (value.kind === 'dead_letter') counters.deadLetter += 1;
    else throw new Error('Private cancellation runner received unknown work state.');
    attempts += 1;
  }
  const after = validatePrivateCancelHealthV1(await input.health.snapshot());
  return Object.freeze({
    attempts,
    outcomes: Object.freeze(counters),
    before, after,
    alerts: classifyPrivateCancelHealthAlertsV1(after, input.staleThresholdSeconds),
    providerRefundAuthorized: false,
    entitlementMutationAuthorized: false,
  });
}
