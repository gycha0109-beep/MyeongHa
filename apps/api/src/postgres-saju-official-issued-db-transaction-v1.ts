import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  executePostgresSubjectTransactionV1,
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
  SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1,
} from './saju-official-reading-issuer-db-persistence-v1.js';

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
}>): SajuOfficialIssuedDbTransactionPortV1 {
  return Object.freeze({
    async run(request: Parameters<SajuOfficialIssuedDbTransactionPortV1['run']>[0]) {
      return executePostgresSubjectTransactionV1({
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
          return request.commit({
            currentAuthority: createPostgresSajuOfficialCurrentAuthorityPortV1(client),
            commitPort: createPostgresSajuOfficialImmutableCommitPortV1(client),
          });
        },
      });
    },
  });
}
