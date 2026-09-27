import type {
  MemberAuthRateLimitAdmissionPortV1,
  MemberAuthRateLimitAdmissionV1,
} from './member-auth-rate-limit.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

export const MEMBER_AUTH_RATE_LIMIT_BINDINGS_V1 = Object.freeze({
  executionRole: 'myeongha_api_executor',
  admissionCommand: 'public.cmd_admit_member_auth_request_v1',
} as const);

const BEGIN_SQL = 'BEGIN';
const ENTER_EXECUTION_ROLE_SQL = 'SET LOCAL ROLE myeongha_api_executor';
const COMMIT_SQL = 'COMMIT';
const ROLLBACK_SQL = 'ROLLBACK';
const ADMIT_SQL = `
select
  allowed,
  request_count as "requestCount",
  reset_at::text as "resetAt"
from public.cmd_admit_member_auth_request_v1($1::text, $2::bytea)
`.trim();

type AdmissionRowV1 = Readonly<{
  allowed?: unknown;
  requestCount?: unknown;
  resetAt?: unknown;
}>;

function requireAdmission(rows: readonly AdmissionRowV1[]): MemberAuthRateLimitAdmissionV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error('Member Auth rate-limit authority did not return exactly one row.');
  }
  if (typeof row.allowed !== 'boolean') {
    throw new Error('Member Auth rate-limit authority returned an invalid allow marker.');
  }
  if (
    typeof row.requestCount !== 'number' ||
    !Number.isInteger(row.requestCount) ||
    row.requestCount < 1 ||
    row.requestCount > 31
  ) {
    throw new Error('Member Auth rate-limit authority returned an invalid request count.');
  }
  if (
    typeof row.resetAt !== 'string' ||
    !Number.isFinite(Date.parse(row.resetAt))
  ) {
    throw new Error('Member Auth rate-limit authority returned an invalid reset timestamp.');
  }

  return Object.freeze({
    allowed: row.allowed,
    requestCount: row.requestCount,
    resetAt: new Date(row.resetAt).toISOString(),
  });
}

export class PostgresMemberAuthRateLimitAdmissionPortV1
  implements MemberAuthRateLimitAdmissionPortV1
{
  constructor(private readonly pool: PostgresSubjectPoolV1) {}

  async admit(input: Parameters<MemberAuthRateLimitAdmissionPortV1['admit']>[0]) {
    if (input.clientFingerprint.byteLength !== 32) {
      throw new Error('Member Auth rate-limit fingerprint must be exactly 32 bytes.');
    }

    const connection = await this.pool.connect();
    let transactionStarted = false;
    let discardConnectionError: unknown;

    try {
      await connection.query(BEGIN_SQL);
      transactionStarted = true;
      await connection.query(ENTER_EXECUTION_ROLE_SQL);
      const result = await connection.query<AdmissionRowV1>(ADMIT_SQL, [
        input.action,
        Buffer.from(input.clientFingerprint),
      ]);
      const admission = requireAdmission(result.rows);
      await connection.query(COMMIT_SQL);
      transactionStarted = false;
      return admission;
    } catch (error) {
      if (transactionStarted) {
        try {
          await connection.query(ROLLBACK_SQL);
        } catch (rollbackError) {
          discardConnectionError = rollbackError;
          throw new AggregateError(
            [error, rollbackError],
            'Member Auth rate-limit transaction failed and rollback also failed.',
          );
        }
      }
      throw error;
    } finally {
      connection.release(discardConnectionError);
    }
  }
}
