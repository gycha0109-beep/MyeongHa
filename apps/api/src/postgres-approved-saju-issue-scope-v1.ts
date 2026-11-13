import {
  SAJU_READING_COMPONENTS_V1,
  type SajuReadingComponentV1,
} from '../../../packages/contracts/src/approved-saju-catalog.js';
import type { SajuBirthRevisionBindingV1 } from '../../../packages/domain/src/index.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type { SajuOfficialIssuancePreflightPortV1 } from './saju-production-reading-execution.js';
import { buildSajuProductionReadingRequestV1 } from './saju-production-reading-http-adapter.js';
import { buildSajuProductionCalculationRequestV1 } from './saju-production-calculation-http-adapter.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';

export interface ApprovedSajuIssueAttemptBindingV1 {
  readonly purchaseIntentId: string;
  readonly component: SajuReadingComponentV1;
  readonly sourceRequestHash: string;
}

interface ScopeRow {
  readonly birthRevisionId: string;
  readonly sourceBirthInputHash: string;
  readonly releaseRef: string;
  readonly periodReferenceDateTime: string | null;
  readonly birth: Omit<SajuBirthRevisionBindingV1, 'birthRevisionRef'>;
}

interface PairScopeRow extends ScopeRow {
  readonly admissionHash: string;
  readonly targetBirthRevisionId: string;
  readonly targetBirthInputHash: string;
  readonly targetBirth: ScopeRow['birth'];
}

/** Issuer-only input, scoped to the current paid comparison and target use. */
export async function readApprovedSajuPairIssueScopeV1(
  client: PostgresTransactionQueryV1,
  input: { readonly subjectId: string; readonly purchaseIntentId: string },
) {
  const { rows } = await client.query<{ scope: PairScopeRow | null }>(
    'select public.qry_approved_saju_pair_issue_scope_v1($1::uuid,$2::uuid) as scope',
    [input.subjectId, input.purchaseIntentId],
  );
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error('Approved Saju comparison scope returned invalid authority.');
  }
  const { scope } = rows[0];
  if (scope === null) return null;
  if (scope.periodReferenceDateTime !== null || scope.birthRevisionId === scope.targetBirthRevisionId ||
      !scope.admissionHash || !scope.releaseRef || !scope.sourceBirthInputHash || !scope.targetBirthInputHash) {
    throw new Error('Approved Saju comparison scope does not match the pinned pair.');
  }
  const { birth } = buildSajuProductionCalculationRequestV1({
    ...scope.birth, birthRevisionRef: scope.birthRevisionId,
  });
  const { birth: partnerBirth } = buildSajuProductionCalculationRequestV1({
    ...scope.targetBirth, birthRevisionRef: scope.targetBirthRevisionId,
  });
  const request = Object.freeze({ birth, partnerBirth });
  return Object.freeze({
    birthRevisionId: scope.birthRevisionId, targetBirthRevisionId: scope.targetBirthRevisionId,
    sourceBirthInputHash: scope.sourceBirthInputHash, targetBirthInputHash: scope.targetBirthInputHash,
    admissionHash: scope.admissionHash, releaseRef: scope.releaseRef,
    request, sourceRequestHash: hashSajuHeldSourceProofRequestV1(request),
  });
}

export async function readApprovedSajuIssueScopeV1(
  client: PostgresTransactionQueryV1,
  input: { readonly subjectId: string; readonly purchaseIntentId: string; readonly component: SajuReadingComponentV1 },
) {
  if (input.component === 'compatibility') return null;
  const result = await client.query<{ scope: ScopeRow | null }>(
    'select public.qry_approved_saju_issue_scope_v1($1::uuid,$2::uuid,$3::text) as scope',
    [input.subjectId, input.purchaseIntentId, input.component],
  );
  if (result.rows.length !== 1 || result.rows[0] === undefined) {
    throw new Error('Approved Saju issue scope returned invalid authority.');
  }
  const { scope } = result.rows[0];
  if (scope === null) return null;
  const { periodReferenceDateTime } = scope;
  const { text: readingText, temporalScope } = SAJU_READING_COMPONENTS_V1[input.component];
  if ((periodReferenceDateTime === null) !== (temporalScope === 'natal')) {
    throw new Error('Approved Saju issue scope does not match the purchased period.');
  }
  const birthRevision = Object.freeze({ ...scope.birth, birthRevisionRef: scope.birthRevisionId });
  const period = periodReferenceDateTime ?? undefined;
  const request = buildSajuProductionReadingRequestV1({
    birthRevision, readingText, ...(period === undefined ? {} : { periodReferenceDateTime: period }),
  });
  const sourceRequestHash = hashSajuHeldSourceProofRequestV1(request);
  return Object.freeze({
    birthRevision,
    sourceBirthInputHash: scope.sourceBirthInputHash,
    releaseRef: scope.releaseRef,
    readingText,
    request,
    periodReferenceDateTime: period,
    binding: Object.freeze({ purchaseIntentId: input.purchaseIntentId, component: input.component, sourceRequestHash }),
  });
}

export async function admitApprovedSajuIssueAttemptV1(
  client: PostgresTransactionQueryV1,
  binding: ApprovedSajuIssueAttemptBindingV1,
  request: Parameters<SajuOfficialIssuancePreflightPortV1['admitBeforeSourceCall']>[0],
): Promise<boolean> {
  const result = await client.query<{ admitted: unknown }>(
    'select public.admit_approved_saju_issue_attempt_v1($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::text) as admitted',
    [request.subjectId, binding.purchaseIntentId, binding.component, request.readingId,
      request.readingSessionId, request.executionAttemptId,
      request.sourceBirthRevisionId, binding.sourceRequestHash],
  );
  if (result.rows.length !== 1 || typeof result.rows[0]?.admitted !== 'boolean') {
    throw new Error('Approved Saju attempt returned invalid authority.');
  }
  return result.rows[0].admitted;
}
