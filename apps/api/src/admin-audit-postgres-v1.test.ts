import { describe, expect, it } from 'vitest';
import { ADMIN_AUDIT_PRINCIPAL_SQL_V1, createAdminPostgresAuditPortV1 } from './admin-audit-postgres-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const OWNER = '123e4567-e89b-42d3-a456-426614174000';

function harness(role: string) {
  const queries: { text: string; values?: readonly unknown[] }[] = [];
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      return {
        async query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
          queries.push(values === undefined ? { text } : { text, values });
          return {
            rows: text.startsWith('SELECT current_user')
              ? [{ currentUser: role }] as unknown as Row[]
              : [] as Row[],
          };
        },
        release() {},
      };
    },
  };
  return { queries, port: createAdminPostgresAuditPortV1({ pool }) };
}
const event = {
  requestId: OWNER,
  actorAuthUserId: OWNER,
  targetRef: OWNER,
  action: 'read:users',
  outcome: 'allowed' as const,
  at: '2026-10-26T12:00:00.000Z',
};

describe('admin audit writer boundary', () => {
  it('rejects ordinary DB principal before insert', async () => {
    const h = harness('myeongha_api_executor');
    await expect(h.port.append(event)).rejects.toThrow();
    expect(h.queries.map(x => x.text)).toEqual([
      'BEGIN', ADMIN_AUDIT_PRINCIPAL_SQL_V1, 'ROLLBACK',
    ]);
  });
  it('inserts only fixed allowlisted event columns with values bound', async () => {
    const h = harness('myeongha_admin_audit_writer');
    await h.port.append(event);
    expect(h.queries[2]?.text).toContain('INSERT INTO myeongha_admin_ops.admin_audit_events_v1');
    expect(h.queries[2]?.values).toEqual([
      OWNER, OWNER, OWNER, 'read:users', 'allowed', '2026-10-26T12:00:00.000Z',
    ]);
    expect(h.queries.at(-1)?.text).toBe('COMMIT');
  });
  it('rejects possible sensitive text in action before connecting', async () => {
    const h = harness('myeongha_admin_audit_writer');
    await expect(h.port.append({ ...event, action: 'read:users email=test@example.com' }))
      .rejects.toThrow();
    expect(h.queries).toHaveLength(0);
  });
});
