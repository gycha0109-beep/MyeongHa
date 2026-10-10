import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type {
  ResolvedSubjectContextV1,
  ResolvedSubjectKindV1,
  SubjectIdentityResolutionPortV1,
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';
import { resolveSubjectIdentity } from './subject-identity-resolver.js';
import type {
  SeyeonProductionSubjectTransactionRunnerV1,
} from './seyeon-production-subject-transaction-v1.js';
import {
  SEYEON_GOVERNED_DB_ROLE_V1,
  type SeyeonGovernedPostgresSubjectPoolV1,
} from './seyeon-governed-postgres-pool-v1.js';

const ENTER_GOVERNED_ROLE_SQL_V1 =
  'SET LOCAL ROLE myeongha_seyeon_governed_executor';

const MEMBER_SQL = `
select subject_id::text as "subjectId",subject_kind as "subjectKind"
from public.begin_member_subject_context_v1($1::uuid)
`.trim();
const GUEST_SQL = `
select subject_id::text as "subjectId",subject_kind as "subjectKind"
from public.begin_guest_subject_context_v1($1::text)
`.trim();
const ASSERT_SQL = 'select public.assert_myeongha_subject_context_v1($1::uuid)';

function requireSubjectId(value: string): string {
  const result=value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(result)) {
    throw new Error('Governed DB transaction expected Subject id is invalid.');
  }
  return result;
}

function contextRow(
  rows: readonly Record<string,unknown>[],
  kind: ResolvedSubjectKindV1,
): ResolvedSubjectContextV1 {
  const row=rows[0];
  if (rows.length!==1 || !row || typeof row.subjectId!=='string' ||
      row.subjectKind!==kind) {
    throw new Error('Governed DB Subject resolver returned invalid canonical identity.');
  }
  return Object.freeze({subjectId:requireSubjectId(row.subjectId),subjectKind:kind});
}
function contextPort(client:PostgresTransactionQueryV1):
  SubjectIdentityResolutionPortV1 {
  return {
    async resolveMemberSubject({verifiedAuthUserId}) {
      const result=await client.query(MEMBER_SQL,[verifiedAuthUserId]);
      return contextRow(result.rows,'member');
    },
    async resolveGuestSubject({verifiedGuestTokenHash}) {
      const result=await client.query(GUEST_SQL,[verifiedGuestTokenHash]);
      return contextRow(result.rows,'guest');
    },
  };
}

/**
 * B2 dormant cost-only transaction runner; no Production Provider is wired.
 * A verified LOGIN principal is checked by the isolated pool before BEGIN,
 * then a trusted role and canonical Subject are bound transaction-locally.
 * No public role-name injection; OFF's ordinary Subject runner is unchanged.
 */
export function createSeyeonGovernedCostTransactionRunnerV1(input: {
  readonly pool: SeyeonGovernedPostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
}): SeyeonProductionSubjectTransactionRunnerV1 {
  if (input.pool.authority !== 'seyeon-governed-only-v1' ||
      SEYEON_GOVERNED_DB_ROLE_V1!=='myeongha_seyeon_governed_executor') {
    throw new Error('Governed cost runner requires the isolated DB pool contract.');
  }
  async function run<T>(
    expectedSubjectId: string|null,
    callback: (
      client:PostgresTransactionQueryV1,
      subject:ResolvedSubjectContextV1,
    ) => T|Promise<T>,
  ): Promise<T> {
    const connection=await input.pool.connect();
    let started=false;
    let discard:unknown;
    try {
      await connection.query('BEGIN');
      started=true;
      await connection.query(ENTER_GOVERNED_ROLE_SQL_V1);
      const subject=await resolveSubjectIdentity({
        verifiedEvidence:input.verifiedEvidence,
        resolutionPort:contextPort(connection),
      });
      if(expectedSubjectId!==null &&
          requireSubjectId(subject.subjectId)!==requireSubjectId(expectedSubjectId)) {
        throw new Error('Governed DB canonical Subject changed across cost transactions.');
      }
      await connection.query(ASSERT_SQL,[subject.subjectId]);
      const result=await callback(connection,subject);
      await connection.query('COMMIT');
      started=false;
      return result;
    } catch(error) {
      if (started) {
        try { await connection.query('ROLLBACK'); }
        catch(rollbackError) {
          discard=rollbackError;
          throw new AggregateError(
            [error,rollbackError],
            'Governed PostgreSQL cost transaction and rollback both failed.',
          );
        }
      }
      throw error;
    } finally {
      connection.release(discard);
    }
  }
  return Object.freeze({
    resolveSubject() {
      return run(null,(_client,subject)=>subject);
    },
    run<T>(
      expectedSubjectId:string,
      callback:(
        client:PostgresTransactionQueryV1,
        subject:ResolvedSubjectContextV1,
      ) => T|Promise<T>,
    ):Promise<T> {
      return run(requireSubjectId(expectedSubjectId),callback);
    },
  });
}
