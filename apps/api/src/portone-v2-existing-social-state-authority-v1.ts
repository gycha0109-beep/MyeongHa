import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const DIGEST = /^[a-f0-9]{64}$/u;
type BooleanRow = Readonly<{ accepted: unknown }>;

/** A1 1742 proposal-only, server executor-owned single-use state authority. */
export function createPostgresExistingMemberSocialStateAuthorityV1(pool: PostgresSubjectPoolV1) {
  async function invoke(functionName: 'cmd_issue_existing_member_social_state_v1' |
    'cmd_consume_existing_member_social_state_v1', digest: string): Promise<boolean> {
    if (!DIGEST.test(digest)) return false;
    const connection = await pool.connect();
    let begun = false;
    let discard: unknown;
    try {
      await connection.query('BEGIN');
      begun = true;
      await connection.query('SET LOCAL ROLE myeongha_api_executor');
      const { rows } = await connection.query<BooleanRow>(
        `select public.${functionName}($1::text) as "accepted"`, [digest],
      );
      if (rows.length !== 1 || typeof rows[0]?.accepted !== 'boolean') {
        throw new Error('Existing Member OAuth state authority returned malformed evidence.');
      }
      await connection.query('COMMIT');
      begun = false;
      return rows[0].accepted;
    } catch (error) {
      if (begun) {
        try { await connection.query('ROLLBACK'); }
        catch (rollbackError) {
          discard = rollbackError;
          throw new AggregateError([error, rollbackError], 'OAuth state rollback failed.');
        }
      }
      throw error;
    } finally {
      connection.release(discard);
    }
  }

  return Object.freeze({
    issue(digest: string): Promise<boolean> {
      return invoke('cmd_issue_existing_member_social_state_v1', digest);
    },
    consume(digest: string): Promise<boolean> {
      return invoke('cmd_consume_existing_member_social_state_v1', digest);
    },
  });
}
