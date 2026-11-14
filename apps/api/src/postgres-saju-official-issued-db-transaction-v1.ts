import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  executePostgresSubjectTransactionV1,
  executePostgresApprovedSajuIssuerTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {
  SajuOfficialIssuedDbTransactionPortV1,
} from './saju-production-reading-execution.js';
import {
  createPostgresSajuOfficialImmutableCommitPortV1,
} from './postgres-saju-official-immutable-commit-v1.js';
import {
  createPostgresSajuOfficialCurrentAuthorityPortV1,
} from './postgres-saju-official-current-authority-v1.js';
import {
  projectSajuOfficialStoredSnapshotV1,
  SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1,
  type SajuOfficialDbMappingVerificationPortV1,
} from './saju-official-reading-issuer-db-persistence-v1.js';
import {
  admitApprovedSajuIssueAttemptV1, type ApprovedSajuIssueAttemptBindingV1,
} from './postgres-approved-saju-issue-scope-v1.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';

/**
 * Concrete server-only composition for a Postgres subject transaction.
 * The canonical Subject must come from already VERIFIED member/guest evidence.
 *
 * Current-Grant/Privacy admission and the existing atomic writer share a DB
 * client and transaction. The current authority cannot be replaced by a
 * caller-supplied mock. No route registration or executor grant is introduced here.
 */
export function createPostgresSajuOfficialIssuedDbTransactionPortV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  approvedPurchase?: ApprovedSajuIssueAttemptBindingV1;
}>): SajuOfficialIssuedDbTransactionPortV1 {
  const { approvedPurchase } = input;
  return Object.freeze({
    ...(approvedPurchase === undefined ? {} : { mappingVerification: 'transaction' as const }),
    async run(request: Parameters<SajuOfficialIssuedDbTransactionPortV1['run']>[0]) {
      const transact = approvedPurchase === undefined
        ? executePostgresSubjectTransactionV1 : executePostgresApprovedSajuIssuerTransactionV1;
      return transact({
        pool: input.pool,
        verifiedEvidence: input.verifiedEvidence,
        execute: ({ resolvedSubject, client }) => {
          if (resolvedSubject.subjectId !== request.subjectId) {
            return Object.freeze({
              contractVersion: SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1,
              state: 'held' as const,
              reason: 'current_authority_unavailable' as const,
              canDisclose: false as const,
              canSell: false as const,
            });
          }
          const { executionAttemptId } = request;
          const mappingVerifier: SajuOfficialDbMappingVerificationPortV1 | undefined =
            approvedPurchase === undefined || executionAttemptId === undefined ? undefined : {
              async verifyIssuedReadingMapping(mapping) {
                const { source, originalResponse, subjectId, dbReadingId, readingSessionId, sourceBirthRevisionId } = mapping;
                if (subjectId !== resolvedSubject.subjectId
                  || source.sourceBirthRevisionId !== sourceBirthRevisionId
                  || source.sourceRequestHash !== approvedPurchase.sourceRequestHash
                  || source.sourceResponseHash !== hashSajuHeldSourceProofRequestV1(originalResponse)) return null;
                const stored = projectSajuOfficialStoredSnapshotV1(originalResponse, dbReadingId);
                if (stored === null || !await admitApprovedSajuIssueAttemptV1(client, approvedPurchase, {
                  subjectId, readingId: dbReadingId, readingSessionId, executionAttemptId, sourceBirthRevisionId,
                })) return null;
                return Object.freeze({
                  state: 'approved_mapping' as const,
                  subjectId, dbReadingId, readingSessionId, sourceBirthRevisionId,
                  nativeReadingId: source.nativeReadingId, originalResponseHash: source.sourceResponseHash,
                  storedResponseHash: hashSajuHeldSourceProofRequestV1(stored),
                });
              },
            };
          return request.commit({
            currentAuthority: createPostgresSajuOfficialCurrentAuthorityPortV1(client, approvedPurchase),
            commitPort: createPostgresSajuOfficialImmutableCommitPortV1(client, approvedPurchase),
            ...(mappingVerifier === undefined ? {} : { mappingVerifier }),
          });
        },
      });
    },
  });
}
