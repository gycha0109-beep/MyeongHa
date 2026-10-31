import { createHash, createHmac } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import { prepareDigitalReadingWithdrawalReviewV1 } from
  './commerce-digital-reading-withdrawal-review-preflight-v1.js';
import { createPostgresDigitalReadingWithdrawalEvidencePrivateV1 } from
  './postgres-digital-reading-withdrawal-evidence-private-v1.js';

export const DIGITAL_READING_WITHDRAWAL_PRIVATE_INTAKE_V1 = Object.freeze({
  productionMounted: false,
  publicRouteMounted: false,
  accountDeletionPolicyDecided: true,
  claimDispositionGraphIntegrated: false,
  consumerAcknowledgmentEnabled: false,
  providerRefundEnabled: false,
  entitlementMutationEnabled: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REASONS: ReadonlySet<string> = new Set([
  'change_of_mind', 'not_provided', 'delivery_failed',
  'not_as_described', 'defect', 'duplicate_charge',
  'unprovided_separable_part', 'other',
]);
const CONTRACT = 'digital-reading-withdrawal-claim-v1';

type ClaimRequest = Readonly<{
  purchaseIntentId: string;
  unitId: string;
  reason: string;
  idempotencyKey: string;
}>;

type StoredClaimRow = Readonly<{
  id: unknown;
  subjectId: unknown;
  purchaseIntentId: unknown;
  unitId: unknown;
  reasonCode: unknown;
  idempotencyHmac: unknown;
  requestHash: unknown;
  contractVersion: unknown;
}>;

export type PrivateDigitalReadingClaimIntakeResultV1 =
  | Readonly<{
    kind: 'not_activated' | 'not_admitted';
    requestRecorded: false;
    consumerAcknowledgmentIssued: false;
    providerRefundAuthorized: false;
    entitlementMutationAuthorized: false;
  }>
  | Readonly<{
    kind: 'outcome_unknown';
    requestRecorded: 'unknown';
    consumerAcknowledgmentIssued: false;
    providerRefundAuthorized: false;
    entitlementMutationAuthorized: false;
  }>
  | Readonly<{
    kind: 'stored_private_claim';
    replayed: boolean;
    requestRecorded: true;
    consumerAcknowledgmentIssued: false;
    providerRefundAuthorized: false;
    entitlementMutationAuthorized: false;
  }>;

const NOT_ACTIVATED = Object.freeze({
  kind: 'not_activated',
  requestRecorded: false,
  consumerAcknowledgmentIssued: false,
  providerRefundAuthorized: false,
  entitlementMutationAuthorized: false,
} as const);
const NOT_ADMITTED = Object.freeze({
  ...NOT_ACTIVATED,
  kind: 'not_admitted',
} as const);
const OUTCOME_UNKNOWN = Object.freeze({
  kind: 'outcome_unknown',
  requestRecorded: 'unknown',
  consumerAcknowledgmentIssued: false,
  providerRefundAuthorized: false,
  entitlementMutationAuthorized: false,
} as const);

const INSERT = `
insert into public.digital_reading_withdrawal_claims_private_v1
  (subject_id,purchase_intent_id,unit_id,reason_code,idempotency_hmac,request_hash)
values ($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text)
on conflict (subject_id,idempotency_hmac) do nothing
returning id::text as "id",
  subject_id::text as "subjectId",
  purchase_intent_id::text as "purchaseIntentId",
  unit_id::text as "unitId",
  reason_code as "reasonCode", idempotency_hmac as "idempotencyHmac",
  request_hash as "requestHash", contract_version as "contractVersion"
`.trim();
const REPLAY = `
select id::text as "id",subject_id::text as "subjectId",
 purchase_intent_id::text as "purchaseIntentId",unit_id::text as "unitId",
 reason_code as "reasonCode",idempotency_hmac as "idempotencyHmac",
 request_hash as "requestHash",contract_version as "contractVersion"
from public.digital_reading_withdrawal_claims_private_v1
where subject_id=$1::uuid and idempotency_hmac=$2::text
limit 2
`.trim();

function parseRequest(value: unknown): ClaimRequest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !==
      'idempotencyKey,purchaseIntentId,reason,unitId') return null;
  if (typeof record.purchaseIntentId !== 'string' || !UUID.test(record.purchaseIntentId) ||
      typeof record.unitId !== 'string' || !UUID.test(record.unitId) ||
      typeof record.idempotencyKey !== 'string' || !UUID.test(record.idempotencyKey) ||
      typeof record.reason !== 'string' || !REASONS.has(record.reason)) return null;
  return Object.freeze({
    purchaseIntentId: record.purchaseIntentId,
    unitId: record.unitId,
    reason: record.reason,
    idempotencyKey: record.idempotencyKey,
  });
}

function requireMatchingClaim(
  row: StoredClaimRow,
  expected: Readonly<{
    subjectId: string;
    purchaseIntentId: string;
    unitId: string;
    reason: string;
    idempotencyHmac: string;
    requestHash: string;
  }>,
): void {
  if (typeof row.id !== 'string' || !UUID.test(row.id) ||
      row.subjectId !== expected.subjectId ||
      row.purchaseIntentId !== expected.purchaseIntentId ||
      row.unitId !== expected.unitId ||
      row.reasonCode !== expected.reason ||
      row.idempotencyHmac !== expected.idempotencyHmac ||
      row.requestHash !== expected.requestHash ||
      row.contractVersion !== CONTRACT) {
    throw Error('Private claim authority did not return matching immutable evidence.');
  }
}

/**
 * Internal, entirely unmounted staging candidate. A claim cannot be durably
 * recorded until the DECIDED P0-PR-01 graph covers this new table and specific private operations
 * authorization are supplied. The current release configuration supplies neither.
 *
 * This is not a consumer complaint endpoint. It deliberately demands exact
 * purchase-unit proof and cannot replace the general missing-receipt/support
 * intake needed for statutory claims.
 */
export async function recordPrivateDigitalReadingWithdrawalClaimCandidateV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  resolvedSubjectId: string | undefined;
  request: unknown;
  claimDispositionGraphIntegrated: boolean;
  privateOperationsIntakeApproved: boolean;
  idempotencyHmacSecret: string | undefined;
}>): Promise<PrivateDigitalReadingClaimIntakeResultV1> {
  if (input.claimDispositionGraphIntegrated !== true ||
      input.privateOperationsIntakeApproved !== true) return NOT_ACTIVATED;
  const request = parseRequest(input.request);
  if (!request || !input.resolvedSubjectId || !UUID.test(input.resolvedSubjectId) ||
      typeof input.idempotencyHmacSecret !== 'string' ||
      Buffer.byteLength(input.idempotencyHmacSecret, 'utf8') < 32) {
    return NOT_ADMITTED;
  }

  const subjectId = input.resolvedSubjectId;
  const idempotencyHmac = 'hmac-sha256:k1:' + createHmac(
    'sha256', input.idempotencyHmacSecret,
  ).update(canonicalJson([CONTRACT, subjectId, request.idempotencyKey]), 'utf8').digest('hex');
  const requestHash = 'sha256:v1:' + createHash('sha256')
    .update(canonicalJson([CONTRACT, subjectId, request.purchaseIntentId,
      request.unitId, request.reason]), 'utf8').digest('hex');
  const expected = Object.freeze({
    subjectId, purchaseIntentId: request.purchaseIntentId,
    unitId: request.unitId, reason: request.reason, idempotencyHmac, requestHash,
  });

  let connection: PostgresSubjectConnectionV1 | undefined;
  let transactionStarted = false;
  let committed = false;
  let commitAttempted = false;
  let discardConnectionError: unknown;
  try {
    connection = await input.pool.connect();
    await connection.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    transactionStarted = true;
    // This candidate is reserved for the complete-visibility, private operations
    // identity. The ordinary API and worker executors cannot read or insert claims.
    const authority = await connection.query<{
      readOnly: unknown; completeVisibility: unknown;
    }>(`select current_setting('transaction_read_only')='on' as "readOnly",
      (rolsuper or rolbypassrls) as "completeVisibility"
      from pg_catalog.pg_roles where rolname=current_user`);
    if (authority.rows.length !== 1 || authority.rows[0]?.readOnly !== false ||
        authority.rows[0]?.completeVisibility !== true) return NOT_ADMITTED;

    const preflight = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: subjectId,
      request: {
        purchaseIntentId: request.purchaseIntentId,
        unitId: request.unitId,
        reason: request.reason,
      },
      evidencePort: createPostgresDigitalReadingWithdrawalEvidencePrivateV1(connection),
    });
    if (preflight.kind !== 'manual_review_candidate') return NOT_ADMITTED;

    const args = [subjectId, request.purchaseIntentId, request.unitId,
      request.reason, idempotencyHmac, requestHash];
    let replayed = false;
    const inserted = await connection.query<StoredClaimRow>(INSERT, args);
    let row: StoredClaimRow | undefined = inserted.rows[0];
    if (inserted.rows.length === 0) {
      replayed = true;
      const replay = await connection.query<StoredClaimRow>(REPLAY, [subjectId, idempotencyHmac]);
      if (replay.rows.length !== 1) return NOT_ADMITTED;
      row = replay.rows[0];
    } else if (inserted.rows.length !== 1) {
      return NOT_ADMITTED;
    }
    if (row === undefined) return NOT_ADMITTED;
    requireMatchingClaim(row, expected);
    commitAttempted = true;
    await connection.query('COMMIT');
    transactionStarted = false;
    committed = true;
    return Object.freeze({
      kind: 'stored_private_claim', replayed,
      requestRecorded: true, consumerAcknowledgmentIssued: false,
      providerRefundAuthorized: false, entitlementMutationAuthorized: false,
    });
  } catch {
    // A COMMIT network error may occur AFTER durable storage. Never assert
    // absence of a claim; same-key replay must resolve the uncertain result.
    if (commitAttempted) return OUTCOME_UNKNOWN;
    return NOT_ADMITTED;
  } finally {
    if (connection !== undefined) {
      if (transactionStarted || !committed) {
        try { await connection.query('ROLLBACK'); }
        catch { discardConnectionError = new Error('Private claim rollback failed.'); }
      }
      try { connection.release(discardConnectionError); }
      catch { /* Release failure does not undo a confirmed COMMIT. */ }
    }
  }
}
