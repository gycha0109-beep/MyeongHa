import type { AdminAuditEventV1, AdminAuditPortV1 } from './admin-read-http-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

export const ADMIN_AUDIT_ROLE_V1 = 'myeongha_admin_audit_writer' as const;
export const ADMIN_AUDIT_PRINCIPAL_SQL_V1 = 'SELECT current_user::text AS "currentUser" FROM pg_catalog.pg_roles r WHERE r.rolname=current_user AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolinherit AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)';

const INSERT_SQL = [
  'INSERT INTO myeongha_admin_ops.admin_audit_events_v1',
  '(request_id, actor_auth_user_id, target_ref, action, outcome, occurred_at)',
  'VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::timestamptz)',
].join(' ');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACTION = /^[a-z:-]{1,64}$/u;

function validate(event: AdminAuditEventV1) {
  if (!UUID.test(event.requestId) ||
    (event.actorAuthUserId !== null && !UUID.test(event.actorAuthUserId)) ||
    (event.targetRef !== undefined && event.targetRef !== null && !UUID.test(event.targetRef)) ||
    !ACTION.test(event.action) ||
    !['allowed', 'denied', 'failed'].includes(event.outcome) ||
    !Number.isFinite(Date.parse(event.at))) {
    throw new Error('Administrator audit event is invalid.');
  }
}

export function createAdminPostgresAuditPortV1(input: {
  readonly pool: PostgresSubjectPoolV1;
}): AdminAuditPortV1 {
  return Object.freeze({
    async append(event: AdminAuditEventV1): Promise<void> {
      validate(event);
      const connection = await input.pool.connect();
      let active = false;
      let discardError: unknown;
      try {
        await connection.query('BEGIN');
        active = true;
        const check = await connection.query<{ readonly currentUser: unknown }>(
          ADMIN_AUDIT_PRINCIPAL_SQL_V1,
        );
        if (check.rows.length !== 1 || check.rows[0]?.currentUser !== ADMIN_AUDIT_ROLE_V1) {
          throw new Error('Administrator audit writer role unavailable.');
        }
        await connection.query(INSERT_SQL, [
          event.requestId,
          event.actorAuthUserId,
          event.targetRef ?? null,
          event.action,
          event.outcome,
          event.at,
        ]);
        await connection.query('COMMIT');
        active = false;
      } catch (error) {
        if (active) {
          try { await connection.query('ROLLBACK'); }
          catch (rollbackError) {
            discardError = rollbackError;
            throw new AggregateError([error, rollbackError], 'Admin audit rollback failed.');
          }
        }
        throw error;
      } finally {
        connection.release(discardError);
      }
    },
  });
}
