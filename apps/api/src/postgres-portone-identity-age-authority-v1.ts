import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import type { PortOneV2IdentityOwnedAttemptV1 } from './portone-v2-identity-verification-contract-v1.js';
import type { PortOneV2IdentityAgeAuthorityPortV1 } from './portone-v2-identity-age-finalization-v1.js';

/**
 * Short, subject-scoped PostgreSQL transactions; never hold a DB transaction
 * across the external PortOne HTTP lookup. Requires the still-unapplied SQL
 * proposal 1740_portone_identity_age_authority_v1.proposed.sql.
 * This adapter is not connected to a production route.
 */
export const POSTGRES_PORTONE_IDENTITY_AUTHORITY_BINDINGS_V1 = Object.freeze({
  issue: 'public.cmd_issue_legal_portone_identity_v1',
  readPending: 'public.qry_pending_legal_portone_identity_v1',
  consume: 'public.cmd_consume_legal_portone_identity_v1',
  executionRole: 'myeongha_api_executor',
  proposalOnly: true,
} as const);

const ISSUE_SQL = [
  'select identity_verification_id as "identityVerificationId",',
  'expires_at::text as "expiresAt"',
  'from public.cmd_issue_legal_portone_identity_v1($1::uuid)',
].join('\n');
const READ_SQL = [
  'select subject_id::text as "subjectId",',
  'identity_verification_id as "identityVerificationId", status',
  'from public.qry_pending_legal_portone_identity_v1($1::uuid, $2::text)',
].join('\n');
const CONSUME_SQL =
  'select public.cmd_consume_legal_portone_identity_v1($1::uuid, $2::text, $3::text) as "consumed"';

export interface PostgresPortOneIdentityIssuedAttemptV1 {
  readonly identityVerificationId: string;
  readonly expiresAt: string;
}
export interface PostgresPortOneIdentityAgeAuthorityV1 extends PortOneV2IdentityAgeAuthorityPortV1 {
  issueIdentityAttempt(): Promise<PostgresPortOneIdentityIssuedAttemptV1>;
}
type IssueRow = Readonly<{ identityVerificationId?: unknown; expiresAt?: unknown }>;
type ReadRow = Readonly<{ subjectId?: unknown; identityVerificationId?: unknown; status?: unknown }>;
type ConsumeRow = Readonly<{ consumed?: unknown }>;

function checkIssue(rows: readonly IssueRow[]): PostgresPortOneIdentityIssuedAttemptV1 {
  if (rows.length !== 1) throw new Error('PortOne identity issue authority returned invalid row count.');
  const row = rows[0]!;
  if (
    typeof row.identityVerificationId !== 'string' ||
    !/^iv_[a-f0-9]{32}$/u.test(row.identityVerificationId) ||
    typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt))
  ) throw new Error('PortOne identity issue authority returned invalid output.');
  return Object.freeze({
    identityVerificationId: row.identityVerificationId,
    expiresAt: new Date(row.expiresAt).toISOString(),
  });
}

function requireSubject(requested: string, resolved: string): void {
  if (requested !== resolved) {
    throw new Error('PortOne identity attempt does not belong to the authenticated subject.');
  }
}

export function createPostgresPortOneIdentityAgeAuthorityV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
}>): PostgresPortOneIdentityAgeAuthorityV1 {
  return Object.freeze({
    async issueIdentityAttempt() {
      return executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence: input.verifiedEvidence,
        execute: async scope => {
          const result = await scope.client.query<IssueRow>(ISSUE_SQL, [scope.resolvedSubject.subjectId]);
          return checkIssue(result.rows);
        },
      });
    },
    async readPendingOwnedAttempt(
      request: Parameters<PortOneV2IdentityAgeAuthorityPortV1['readPendingOwnedAttempt']>[0],
    ): Promise<PortOneV2IdentityOwnedAttemptV1 | null> {
      return executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence: input.verifiedEvidence,
        execute: async scope => {
          requireSubject(request.subjectId, scope.resolvedSubject.subjectId);
          const result = await scope.client.query<ReadRow>(READ_SQL, [
            scope.resolvedSubject.subjectId,
            request.identityVerificationId,
          ]);
          if (result.rows.length === 0) return null;
          if (result.rows.length !== 1) {
            throw new Error('PortOne identity read authority returned invalid row count.');
          }
          const row = result.rows[0]!;
          if (
            row.subjectId !== scope.resolvedSubject.subjectId ||
            row.identityVerificationId !== request.identityVerificationId ||
            row.status !== 'pending'
          ) {
            throw new Error('PortOne identity read authority returned inconsistent identity.');
          }
          return Object.freeze({
            subjectId: scope.resolvedSubject.subjectId,
            identityVerificationId: request.identityVerificationId,
            status: 'pending' as const,
          });
        },
      });
    },
    async consumeAndRecordAgeBand(
      request: Parameters<PortOneV2IdentityAgeAuthorityPortV1['consumeAndRecordAgeBand']>[0],
    ) {
      return executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence: input.verifiedEvidence,
        execute: async scope => {
          requireSubject(request.subjectId, scope.resolvedSubject.subjectId);
          if (request.ageBand !== 'adult' && request.ageBand !== 'free_minor') {
            throw new Error('PortOne identity age band is invalid.');
          }
          const result = await scope.client.query<ConsumeRow>(CONSUME_SQL, [
            scope.resolvedSubject.subjectId,
            request.identityVerificationId,
            request.ageBand,
          ]);
          if (result.rows.length !== 1 || typeof result.rows[0]?.consumed !== 'boolean') {
            throw new Error('PortOne identity consume authority returned invalid output.');
          }
          return result.rows[0].consumed;
        },
      });
    },
  });
}
