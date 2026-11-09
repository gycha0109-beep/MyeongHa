import { ApiCommandError } from './api-error.js';
import {
  readCurrentSelfBirthProfileInTransactionV1,
  type ReadBoundCurrentBirthContextInputV1,
} from './current-subject-saju-calculation-http.js';
import { executePostgresSubjectTransactionV1 } from './postgres-subject-execution.js';
import { bindBirthRevisionForSajuV1 } from './saju-production-calculation-execution.js';
import { buildSajuProductionCalculationRequestV1 } from './saju-production-calculation-http-adapter.js';
import { TransactionTargetPersonReadPortV1 } from './target-person-read-http.js';
import { getTargetPerson } from './target-person-read.js';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

/**
 * Server-only input preparation for the protected two-chart Preview endpoint.
 * Ownership is established here. Use-specific consent and source interpretation
 * authority must be established separately before dispatching either birth.
 */
export async function readBoundSajuComparisonBirthsV1(input: ReadBoundCurrentBirthContextInputV1 & Readonly<{
  targetPersonId: string;
  sourceBirthRevisionId: string;
  targetBirthRevisionId: string;
}>) {
  if (input.verifiedEvidence.kind !== 'member') {
    throw new ApiCommandError('AUTH_REQUIRED', 'A verified member is required.');
  }
  const [targetPersonId, sourceRevision, targetRevision] = [
    input.targetPersonId, input.sourceBirthRevisionId, input.targetBirthRevisionId,
  ].map(value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : '');
  if (!targetPersonId || !sourceRevision || !targetRevision || sourceRevision === targetRevision) {
    throw new ApiCommandError('INVALID_REQUEST', 'Two distinct Birth revisions and a target are required.');
  }

  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ client, resolvedSubject }) => {
      if (resolvedSubject.subjectKind !== 'member') {
        throw new ApiCommandError('AUTH_REQUIRED', 'A verified member is required.');
      }
      const subjectId = resolvedSubject.subjectId;
      const self = await readCurrentSelfBirthProfileInTransactionV1(client, subjectId);
      if (self.currentRevision.revisionId !== sourceRevision) {
        throw new ApiCommandError('NOT_FOUND', 'The pinned comparison Birth revision is unavailable.');
      }
      const target = await getTargetPerson({
        resolvedSubjectId: subjectId,
        targetPersonId,
        authorityPort: new TransactionTargetPersonReadPortV1(client),
      });
      if (target.currentRevision.revisionId !== targetRevision || target.birthProfileId === self.birthProfileId) {
        throw new ApiCommandError('NOT_FOUND', 'The pinned comparison Birth revision is unavailable.');
      }
      return Object.freeze({
        subjectId,
        targetPersonId,
        sourceBirthRevisionId: sourceRevision,
        targetBirthRevisionId: targetRevision,
        previewRequest: Object.freeze({
          birth: buildSajuProductionCalculationRequestV1(
            bindBirthRevisionForSajuV1(self.currentRevision),
          ).birth,
          partnerBirth: buildSajuProductionCalculationRequestV1(
            bindBirthRevisionForSajuV1(target.currentRevision),
          ).birth,
        }),
      });
    },
  });
}
