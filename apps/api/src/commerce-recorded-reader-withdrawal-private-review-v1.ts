import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  prepareDigitalReadingWithdrawalReviewV1,
} from './commerce-digital-reading-withdrawal-review-preflight-v1.js';
import type {
  DigitalReadingWithdrawalReviewV1,
} from './commerce-digital-reading-withdrawal-review-v1.js';
import {
  readRecordedReaderS7ClaimTimelineV1,
  type RecordedReaderS7ClaimTimelineV1,
} from './commerce-recorded-reader-s7-evidence-v1.js';
import {
  createPostgresDigitalReadingWithdrawalEvidencePrivateV1,
} from './postgres-digital-reading-withdrawal-evidence-private-v1.js';

/**
 * Internal owner-operations bridge:
 * immutable, already-RECEIVED customer Claim -> its original exact purchased
 * Reading unit -> existing server-owned Receipt/checkout notice reviewer.
 *
 * No public API, status change, legal conclusion, durable delivery assertion,
 * PortOne POST, or Reader Entitlement writer is installed here.
 */
export const RECORDED_READING_WITHDRAWAL_PRIVATE_REVIEW_V1 = Object.freeze({
  publicRouteMounted: false,
  ownerOperationsOnly: true,
  readOnly: true,
  customerClaimIntakePerformed: false,
  deliveryProvenByPreflight: false,
  automaticLegalDecision: false,
  providerRefundEnabled: false,
  entitlementMutationEnabled: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REASONS = new Set([
  'change_of_mind', 'not_provided', 'delivery_failed', 'not_as_described',
  'defect', 'duplicate_charge', 'unprovided_separable_part', 'other',
]);
const ROLE_SQL = `
select
 (rolsuper or rolbypassrls) as "fullVisibility",
 current_setting('transaction_read_only')='on' as "readOnly"
from pg_catalog.pg_roles
where rolname=current_user
`;
const CLAIM_SQL = `
select
 c.id::text as "claimId",
 c.subject_id::text as "subjectId",
 c.purchase_intent_id::text as "purchaseIntentId",
 c.unit_id::text as "unitId",
 c.reason_code as "reasonCode",
 c.state as "state",
 c.contract_version as "contractVersion",
 c.received_at::text as "receivedAt"
from public.digital_reading_withdrawal_claims_private_v1 c
join public.subjects s on s.id=c.subject_id
 and s.kind='member' and s.status in ('active','deletion_pending')
where c.id=$1::uuid
limit 2
`;
const CLAIM_CONTRACT = 'digital-reading-withdrawal-claim-v1' as const;

type ClaimRow = Readonly<{
  claimId:unknown;
  subjectId:unknown;
  purchaseIntentId:unknown;
  unitId:unknown;
  reasonCode:unknown;
  state:unknown;
  contractVersion:unknown;
  receivedAt:unknown;
}>;

export type RecordedReadingWithdrawalPrivateReviewV1 = Readonly<{
  claimId: string;
  receivedAt: string;
  recordedCustomerClaim: true;
  kind:
    | 'general_unlinked_manual_review'
    | 'exact_unit_manual_review'
    | 'exact_unit_evidence_unavailable';
  /**
   * S7 retained transport evidence is descriptive and NEVER establishes
   * actual consumer supply or a legal decision.
   */
  review: DigitalReadingWithdrawalReviewV1 | null;
  retainedReaderS7Timeline: RecordedReaderS7ClaimTimelineV1 | null;
  sourceClaimImmutable: true;
  requiresSeparateLegalDecision: true;
  consumerDeliveryProven: false;
  automaticDenialAuthorized: false;
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
  writesPerformed: false;
}>;

export class RecordedReadingWithdrawalPrivateReviewErrorV1 extends Error {
  readonly code = 'RECORDED_READING_WITHDRAWAL_PRIVATE_REVIEW_UNAVAILABLE' as const;
  constructor() {
    super('Private withdrawal review authority is unavailable.');
    this.name = 'RecordedReadingWithdrawalPrivateReviewErrorV1';
  }
}
const failure = (): never => {
  throw new RecordedReadingWithdrawalPrivateReviewErrorV1();
};
function id(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value) &&
    value === value.toLowerCase();
}
function receivedInstant(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 20 && value.length <= 64 &&
    Number.isFinite(Date.parse(value));
}
function view(
  claimId:string, receivedAt:string,
  kind:RecordedReadingWithdrawalPrivateReviewV1['kind'],
  review:DigitalReadingWithdrawalReviewV1|null,
  retainedReaderS7Timeline:RecordedReaderS7ClaimTimelineV1|null=null,
): RecordedReadingWithdrawalPrivateReviewV1 {
  return Object.freeze({
    claimId, receivedAt, kind, review, retainedReaderS7Timeline,
    recordedCustomerClaim:true,
    sourceClaimImmutable:true,
    requiresSeparateLegalDecision:true,
    consumerDeliveryProven:false,
    automaticDenialAuthorized:false,
    providerRefundAuthorized:false,
    entitlementMutationAuthorized:false,
    writesPerformed:false,
  });
}

/**
 * One read-only REPEATABLE READ transaction, including the Claim and all
 * original-purchase/notice reads. The Subject and claimed unit are sourced
 * exclusively from the immutable private DB row, never request parameters.
 *
 * Missing purchased/verified evidence does not erase a legally submitted
 * customer Claim; it leaves that Claim available for manual review.
 * A general claim is never mapped onto a guessed or sibling purchase.
 */
export async function reviewRecordedReadingWithdrawalPrivateV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  claimId: string;
}>): Promise<RecordedReadingWithdrawalPrivateReviewV1|null> {
  if (!input.pool || typeof input.pool.connect !== 'function' ||
      !id(input.claimId)) return failure();

  let connection: PostgresSubjectConnectionV1|undefined;
  let began = false;
  let discarded: unknown;
  let cleanupFailed = false;
  try {
    connection = await input.pool.connect();
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    began = true;

    const roles = await connection.query<{fullVisibility:unknown;readOnly:unknown}>(ROLE_SQL);
    if (roles.rows.length !== 1 ||
        roles.rows[0]?.fullVisibility !== true ||
        roles.rows[0]?.readOnly !== true) return failure();

    const result = await connection.query<ClaimRow>(CLAIM_SQL,[input.claimId]);
    if (result.rows.length === 0) return null;
    if (result.rows.length !== 1) return failure();
    const claim = result.rows[0]!;
    if (!id(claim.claimId) || claim.claimId !== input.claimId ||
        !id(claim.subjectId) || !receivedInstant(claim.receivedAt) ||
        claim.state !== 'received' ||
        claim.contractVersion !== CLAIM_CONTRACT ||
        typeof claim.reasonCode !== 'string' || !REASONS.has(claim.reasonCode) ||
        (claim.purchaseIntentId === null) !== (claim.unitId === null) ||
        (claim.purchaseIntentId !== null &&
          (!id(claim.purchaseIntentId) || !id(claim.unitId)))) return failure();

    const receivedAt = new Date(claim.receivedAt).toISOString();
    if (claim.purchaseIntentId === null) {
      return view(claim.claimId,receivedAt,
        'general_unlinked_manual_review',null);
    }

    const preflight = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: claim.subjectId,
      request: {
        purchaseIntentId: claim.purchaseIntentId,
        unitId: claim.unitId,
        reason: claim.reasonCode,
      },
      evidencePort: createPostgresDigitalReadingWithdrawalEvidencePrivateV1(connection),
    });

    // A revoked/missing Receipt, missing original notice, DB failure or an
    // ambiguous unit must NEVER be converted into positive refund/denial proof.
    if (preflight.kind !== 'manual_review_candidate') {
      return view(claim.claimId,receivedAt,
        'exact_unit_evidence_unavailable',null);
    }

    // Correlate the original paid S5 body and currently retained S7 attempts
    // only after the exact Claim->paid Receipt/checkout evidence is established.
    // The DB derives the Grant/body from the immutable Claim's Subject/Unit.
    const retainedReaderS7Timeline = await readRecordedReaderS7ClaimTimelineV1(
      connection,{
        subjectId:claim.subjectId,
        purchaseIntentId:claim.purchaseIntentId,
        unitId:claim.unitId,
      },
    );
    return view(claim.claimId,receivedAt,
      'exact_unit_manual_review',preflight.review,retainedReaderS7Timeline);
  } catch {
    return failure();
  } finally {
    if (connection) {
      if (began) {
        try { await connection.query('ROLLBACK'); }
        catch { cleanupFailed=true; discarded=new Error('Private review transaction rollback failed.'); }
      } else {
        // Failed BEGIN may still have opened a server-side transaction.
        discarded=new Error('Private review transaction initialization failed.');
      }
      try { connection.release(discarded); }
      catch { cleanupFailed=true; }
      if(cleanupFailed) failure();
    }
  }
}
