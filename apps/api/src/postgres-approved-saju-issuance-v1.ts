import type { SajuReadingComponentV1 } from '../../../packages/contracts/src/approved-saju-catalog.js';
import { readApprovedSajuIssueScopeV1 } from './postgres-approved-saju-issue-scope-v1.js';
import { createPostgresSajuOfficialAttemptPreparePortV1 } from './postgres-saju-official-attempt-prepare-v1.js';
import { createPostgresSajuOfficialIssuedDbTransactionPortV1 } from './postgres-saju-official-issued-db-transaction-v1.js';
import { executePostgresSubjectTransactionV1 } from './postgres-subject-execution.js';
import {
  SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1,
  type SajuOfficialIssuanceResultV1,
} from './saju-official-reading-issuer-db-persistence-v1.js';
import {
  executeAndPersistPinnedBirthSajuOfficialReadingV1,
  type SajuOfficialReadingExecutionInputV1,
} from './saju-production-reading-execution.js';

type PrepareOptions = Omit<Parameters<typeof createPostgresSajuOfficialAttemptPreparePortV1>[0], 'approvedPurchase'>;

function held(reason: 'production_source_unverified' | 'current_authority_unavailable'): SajuOfficialIssuanceResultV1 {
  return Object.freeze({
    contractVersion: SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1,
    state: 'held', reason, canDisclose: false, canSell: false,
  });
}

/** Private issuance candidate. The paid component determines the exact Birth
 * revision, Product intent and reference time. The caller supplies server-owned IDs. */
export async function executeApprovedSajuOfficialReadingV1<AdmittedResponse>(
  input: Readonly<PrepareOptions & Pick<SajuOfficialReadingExecutionInputV1<AdmittedResponse>,
    'subjectId' | 'readingId' | 'readingSessionId' | 'executionAttemptId' | 'outboxEventId'
      | 'adapter' | 'sourceVerifier' | 'mappingVerifier'> & {
    purchaseIntentId: string;
    component: SajuReadingComponentV1;
    readerCharacterId: string;
  }>,
): Promise<SajuOfficialIssuanceResultV1> {
  if (input.component === 'compatibility' || typeof input.sourceVerifier?.verifyProductionIssue !== 'function'
    || typeof input.mappingVerifier?.verifyIssuedReadingMapping !== 'function') {
    return held('production_source_unverified');
  }
  const prepared = await executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ client, resolvedSubject }) => {
      if (resolvedSubject.subjectId !== input.subjectId || resolvedSubject.subjectKind !== 'member') return null;
      const scope = await readApprovedSajuIssueScopeV1(client, input);
      if (scope === null) return null;
      const result = await client.query<{ readingId: string; readingSessionId: string }>(
        `select reading_id::text as "readingId",session_id::text as "readingSessionId"
         from commerce_saju_private.prepare_approved_component_reading_v1($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::text,$7::text)`,
        [input.subjectId, input.purchaseIntentId, input.component, input.readingId, input.readingSessionId,
          input.readerCharacterId, scope.binding.sourceRequestHash],
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      if (result.rows.length !== 1 || !row) throw new Error('Approved Saju prepare returned invalid Reading.');
      return { scope, ...row };
    },
  });
  if (prepared === null) return held('current_authority_unavailable');

  const { scope, readingId, readingSessionId } = prepared;
  const approvedPurchase = scope.binding;
  return executeAndPersistPinnedBirthSajuOfficialReadingV1({
    ...input,
    readingId,
    readingSessionId,
    resolveBirth: () => scope.birthRevision,
    sourceBirthRevisionId: scope.birthRevision.birthRevisionRef,
    readingText: scope.readingText,
    ...(scope.periodReferenceDateTime === undefined ? {} : { periodReferenceDateTime: scope.periodReferenceDateTime }),
    attemptPrepare: createPostgresSajuOfficialAttemptPreparePortV1({ ...input, approvedPurchase }),
    dbTransaction: createPostgresSajuOfficialIssuedDbTransactionPortV1({ ...input, approvedPurchase }),
  });
}
