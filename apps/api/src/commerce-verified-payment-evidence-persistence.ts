import { ApiCommandError } from './api-error.js';
import type { PostgresCommerceInternalExecutionScopeV1 } from './postgres-commerce-internal-execution.js';
import {
  requireVerifiedCommerceEvidenceV2,
  type VerifiedCommerceEvidenceV2,
} from './verified-commerce-evidence.js';

export const COMMERCE_VERIFIED_PAYMENT_EVIDENCE_PERSIST_COMMAND_V1 =
  'public.cmd_persist_verified_payment_evidence_v1' as const;

const UUID_V1 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const PERSIST_SQL = `
select
  receipt_id::text as "receiptId",
  provider_event_id::text as "providerEventId",
  replayed
from public.cmd_persist_verified_payment_evidence_v1(
  $1::uuid,
  $2::uuid,
  $3::text,
  $4::text,
  $5::text,
  $6::text,
  $7::text,
  $8::text,
  $9::text,
  $10::text,
  $11::text,
  $12::text,
  $13::bigint,
  $14::text,
  $15::text,
  $16::text,
  $17::text,
  $18::text
)
`;

export interface PersistedVerifiedPaymentEvidenceV1 {
  readonly receiptId: string;
  readonly providerEventId: string;
  readonly replayed: boolean;
}

interface PersistedVerifiedPaymentEvidenceRowV1 {
  readonly receiptId?: unknown;
  readonly providerEventId?: unknown;
  readonly replayed?: unknown;
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_V1.test(value)) {
    throw new ApiCommandError('INVALID_REQUEST', `${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

function normalizeEvidence(value: unknown): VerifiedCommerceEvidenceV2 {
  try {
    return requireVerifiedCommerceEvidenceV2(value);
  } catch {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Verified Commerce evidence is invalid.',
    );
  }
}

function postgresConstraint(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : undefined;
}

const INVALID_REQUEST_CONSTRAINTS = new Set([
  'cmd_persist_verified_payment_evidence_v1_ids_required',
  'cmd_persist_verified_payment_evidence_v1_provider_required',
  'cmd_persist_verified_payment_evidence_v1_platform_invalid',
  'cmd_persist_verified_payment_evidence_v1_environment_invalid',
  'cmd_persist_verified_payment_evidence_v1_transaction_required',
  'cmd_persist_verified_payment_evidence_v1_original_transaction_invalid',
  'cmd_persist_verified_payment_evidence_v1_event_identity_invalid',
  'cmd_persist_verified_payment_evidence_v1_product_required',
  'cmd_persist_verified_payment_evidence_v1_state_invalid',
  'cmd_persist_verified_payment_evidence_v1_fingerprint_invalid',
  'cmd_persist_verified_payment_evidence_v1_verifier_required',
  'cmd_persist_verified_payment_evidence_v1_amount_invalid',
  'cmd_persist_verified_payment_evidence_v1_currency_invalid',
  'cmd_persist_verified_payment_evidence_v1_verified_at_invalid',
  'cmd_persist_verified_payment_evidence_v1_provider_occurred_at_invalid',
  'cmd_persist_verified_payment_evidence_v1_ordering_invalid',
  'cmd_persist_verified_payment_evidence_v1_valid_until_invalid',
]);

const NOT_FOUND_CONSTRAINTS = new Set([
  'cmd_persist_verified_payment_evidence_v1_attempt_unavailable',
  'cmd_persist_verified_payment_evidence_v1_attempt_state_ineligible',
  'cmd_persist_verified_payment_evidence_v1_attempt_authority_mismatch',
  'cmd_persist_verified_payment_evidence_v1_intent_unavailable',
  'cmd_persist_verified_payment_evidence_v1_intent_authority_mismatch',
  'cmd_persist_verified_payment_evidence_v1_intent_state_ineligible',
  'cmd_persist_verified_payment_evidence_v1_charge_authority_unavailable',
  'cmd_persist_verified_payment_evidence_v1_charge_authority_mismatch',
  'cmd_persist_verified_payment_evidence_v1_snapshot_unavailable',
  'cmd_persist_verified_payment_evidence_v1_product_authority_mismatch',
]);

const IDEMPOTENCY_CONFLICT_CONSTRAINTS = new Set([
  'cmd_persist_verified_payment_evidence_v1_idempotency_conflict',
  'commerce_receipts_provider_transaction_unique',
  'commerce_provider_events_provider_external_unique',
  'commerce_payment_attempts_provider_transaction_unique',
]);

function mapPersistError(error: unknown): never {
  const constraint = postgresConstraint(error);
  if (constraint !== undefined) {
    if (INVALID_REQUEST_CONSTRAINTS.has(constraint)) {
      throw new ApiCommandError(
        'INVALID_REQUEST',
        'Verified payment evidence cannot be persisted.',
      );
    }
    if (NOT_FOUND_CONSTRAINTS.has(constraint)) {
      throw new ApiCommandError(
        'NOT_FOUND',
        'Verified payment persistence authority is unavailable.',
      );
    }
    if (IDEMPOTENCY_CONFLICT_CONSTRAINTS.has(constraint)) {
      throw new ApiCommandError(
        'IDEMPOTENCY_CONFLICT',
        'Verified payment evidence conflicts with existing Commerce authority.',
      );
    }
  }
  throw error;
}

function projectPersistedEvidence(
  row: PersistedVerifiedPaymentEvidenceRowV1,
): PersistedVerifiedPaymentEvidenceV1 {
  const receiptId = requireUuid(row.receiptId, 'receiptId');
  const providerEventId = requireUuid(row.providerEventId, 'providerEventId');
  if (typeof row.replayed !== 'boolean') {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Verified payment persistence returned an invalid replay marker.',
    );
  }
  return Object.freeze({ receiptId, providerEventId, replayed: row.replayed });
}

export async function persistVerifiedPaymentEvidenceV1(input: {
  readonly scope: PostgresCommerceInternalExecutionScopeV1;
  readonly paymentAttemptId: unknown;
  readonly evidence: unknown;
}): Promise<PersistedVerifiedPaymentEvidenceV1> {
  const paymentAttemptId = requireUuid(input.paymentAttemptId, 'paymentAttemptId');
  const evidence = normalizeEvidence(input.evidence);

  if (evidence.currentState !== 'active') {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Initial verified-payment persistence requires active evidence.',
    );
  }
  if (evidence.ownerBinding.kind !== 'purchase_intent') {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Verified payment evidence must be bound to a Purchase Intent.',
    );
  }

  const purchaseIntentId = requireUuid(
    evidence.ownerBinding.purchaseIntentId,
    'evidence.ownerBinding.purchaseIntentId',
  );

  let result: { readonly rows?: readonly PersistedVerifiedPaymentEvidenceRowV1[] };
  try {
    result = await input.scope.client.query(PERSIST_SQL, [
      paymentAttemptId,
      purchaseIntentId,
      evidence.provider,
      evidence.platform,
      evidence.environment,
      evidence.externalTransactionId,
      evidence.externalOriginalTransactionId ?? null,
      evidence.externalEventId ?? null,
      evidence.externalProductId,
      evidence.currentState,
      evidence.evidenceFingerprint,
      evidence.verifierRevision,
      evidence.verifiedAmountMinor,
      evidence.verifiedCurrency,
      evidence.verifiedAt,
      evidence.providerOccurredAt ?? null,
      evidence.providerOrderingKey ?? null,
      evidence.providerValidUntil ?? null,
    ]);
  } catch (error) {
    mapPersistError(error);
  }

  if (!Array.isArray(result.rows) || result.rows.length !== 1) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Verified payment persistence must return exactly one canonical row.',
    );
  }

  return projectPersistedEvidence(result.rows[0] ?? {});
}
