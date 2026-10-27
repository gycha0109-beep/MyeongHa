import { describe, expect, it } from 'vitest';
import { ADMIN_READ_SQL_V1, createAdminPostgresReadPortV1 } from './admin-postgres-read-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { AdminListFiltersV1 } from './admin-read-contract-v1.js';

const SUBJECT = '123e4567-e89b-42d3-a456-426614174002';
function harness(role = 'myeongha_admin_reader', rows: Record<string, unknown>[] = []) {
  const sql: string[] = [];
  const params: (readonly unknown[] | undefined)[] = [];
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      return {
        async query<Row = Record<string, unknown>>(query: string, args?: readonly unknown[]) {
          sql.push(query);
          params.push(args);
          if (query.startsWith('SELECT current_user')) return { rows: [{ currentUser: role }] as unknown as Row[] };
          if (query.startsWith('SELECT')) return { rows: rows as unknown as Row[] };
          return { rows: [] as Row[] };
        },
        release() {},
      };
    },
  };
  return { sql, params, port: createAdminPostgresReadPortV1({ pool }) };
}
const filters = (kind: AdminListFiltersV1['kind'] = 'users'): AdminListFiltersV1 =>
  ({ kind, limit: 20, cursor: null, subjectId: null, from: null, to: null });

describe('admin dedicated readonly PostgreSQL adapter', () => {
  it('blocks ordinary subject role before querying data', async () => {
    const h = harness('myeongha_api_executor');
    await expect(h.port.read(filters())).rejects.toThrow('Dedicated administrative');
    expect(h.sql).toEqual(['BEGIN READ ONLY','SELECT current_user::text AS "currentUser"','ROLLBACK']);
  });
  it('binds user reference and date filters only as parameters', async () => {
    const h = harness();
    await h.port.read({ ...filters('commerce'), subjectId: SUBJECT, from: '2026-10-01', to: '2026-10-26' });
    expect(h.sql[2]).not.toContain(SUBJECT);
    expect(h.sql[2]).toContain('$2::uuid');
    expect(h.params[2]).toEqual([21, SUBJECT, '2026-10-01','2026-10-26',0]);
  });
  it('rejects unsupported analytics data source and excludes sensitive payloads', async () => {
    const h = harness();
    await expect(h.port.read(filters('analytics'))).rejects.toThrow();
    expect(ADMIN_READ_SQL_V1['credit-reservations']).toContain('public.chat_credit_turn_reservations_v1');
    expect(ADMIN_READ_SQL_V1['credit-reservations']).toContain('r.required_credits');
    expect(ADMIN_READ_SQL_V1['ai-errors']).toContain("l.status IN ('failed','blocked')");
    expect(ADMIN_READ_SQL_V1['ai-errors']).not.toContain('output_ref_jsonb');
    expect(h.sql.at(-1)).toBe('ROLLBACK');
    expect(Object.values(ADMIN_READ_SQL_V1).filter(Boolean)
      .every(query => !/verified_payload_jsonb|request_snapshot_jsonb|event_jsonb|payload_jsonb|birth_input/iu.test(query!)))
      .toBe(true);
  });
  it('looks up exactly one verified receipt reference without accepting user SQL', async () => {
    const receiptId = '123e4567-e89b-42d3-a456-426614174003';
    const h = harness();
    await h.port.read({ ...filters('commerce-detail'), recordId: receiptId });
    expect(h.sql[2]).toContain('r.id=$1::uuid');
    expect(h.sql[2]).not.toContain(receiptId);
    expect(h.params[2]).toEqual([receiptId]);
  });
  it('counts only authority-backed active Members and 7-day verified operations', async () => {
    const sql = ADMIN_READ_SQL_V1.overview ?? '';
    expect(sql).toContain("s.kind='member' AND s.status='active'");
    expect(sql).toContain("r.verification_status='verified'");
    expect(sql).toContain("r.execution_status='succeeded'");
    expect(sql).toContain("INTERVAL '7 days'");
    expect(sql).not.toMatch(/SUM\(.*amount|payload_jsonb|raw_birth/iu);
    const h = harness();
    await h.port.read(filters('overview'));
    expect(h.sql[2]).toContain('COUNT(*)');
    expect(h.params[2]).toEqual([]);
  });
  it('binds exactly the highest SQL placeholder for every supported read', async () => {
    const kinds = Object.keys(ADMIN_READ_SQL_V1) as AdminListFiltersV1['kind'][];
    for (const kind of kinds) {
      if (kind === 'analytics') continue;
      const h = harness();
      const arg = {
        ...filters(kind),
        ...(kind === 'user-detail' ? { subjectId: SUBJECT } : {}),
        ...(kind === 'commerce-detail' ? { recordId: SUBJECT } : {}),
      };
      await h.port.read(arg);
      const sql = h.sql[2] ?? '';
      const highest = [...sql.matchAll(/\$(\d+)/gu)].reduce((n, match) => Math.max(n, Number(match[1])), 0);
      expect(h.params[2]?.length, kind).toBe(highest);
    }
  });
  it('identifies only reviewable receipt-to-grant discrepancies, without performing writes', async () => {
    const sql = ADMIN_READ_SQL_V1['commerce-alerts'] ?? '';
    expect(sql).toContain("r.verification_status = 'verified'");
    expect(sql).toContain("r.verification_status = 'revoked'");
    expect(sql).toContain("e.source_receipt_id = r.id");
    expect(sql).toContain("g.status = 'active'");
    expect(sql).toContain("INTERVAL '30 minutes'");
    expect(sql).toContain("'manual_review_only'");
    expect(sql).not.toMatch(/verified_payload_jsonb|\bUPDATE\b|\bDELETE\b/iu);
    const f = harness();
    await f.port.read({ ...filters('commerce-alerts'), subjectId: SUBJECT });
    expect(f.params[2]).toEqual([21, SUBJECT, null, null, 0]);
  });
  it('reports AI latency sample size, unknown token usage and blocked calls separately', () => {
    const sql = ADMIN_READ_SQL_V1['ai-costs'] ?? '';
    expect(sql).toContain('ROUND(AVG(l.latency_ms))');
    expect(sql).toContain('COUNT(l.latency_ms)');
    expect(sql).toContain("l.status='blocked'");
    expect(sql).toContain('l.input_tokens IS NULL OR l.output_tokens IS NULL');
    expect(sql).toContain('PERCENTILE_CONT(0.95)');
    expect(sql).toContain('NULL::text AS "costKrw"');
  });
  it('binds guest/member and deletion lifecycle selection as SQL parameters', async () => {
    const h = harness();
    await h.port.read({
      ...filters('users'), subjectKind: 'guest', subjectStatus: 'merged',
    });
    expect(h.sql[2]).toContain('s.kind=$6::text');
    expect(h.sql[2]).toContain('s.status=$7::text');
    expect(h.params[2]).toEqual([21, null, null, null, 0, 'guest', 'merged']);
  });
  it('reads Reading attempt metadata without response snapshots, birth input or prompts', async () => {
    const query = ADMIN_READ_SQL_V1['reading-detail'] ?? '';
    expect(query).toContain('public.reading_execution_attempts');
    expect(query).toContain('public.reading_refs');
    expect(query).toContain('execution_attempt_no DESC');
    expect(query).toContain('ref.reading_contract_version');
    expect(query).not.toMatch(/response_snapshot_jsonb|request_snapshot_jsonb|source_birth_input_hash|payload_jsonb/iu);
    const f = harness();
    await f.port.read({ ...filters('reading-detail'), recordId: SUBJECT });
    expect(f.params[2]).toEqual([SUBJECT]);
  });
  it('binds Reading status server-side and never interpolates filter text', async () => {
    const f = harness();
    await f.port.read({ ...filters('readings'), readingStatus: 'failed' });
    expect(f.sql[2]).toContain('r.execution_status=$6::text');
    expect(f.params[2]).toEqual([21, null, null, null, 0, 'failed']);
  });
  it('provides bounded pagination', async () => {
    const h = harness('myeongha_admin_reader',Array.from({length:3},()=>({subjectId:SUBJECT})));
    const result = await h.port.read({ ...filters(),limit:2 });
    expect(result.rows).toHaveLength(2);
    expect(result.nextCursor).toBe('2');
    await expect(h.port.read({ ...filters(), cursor:'1;DELETE' })).rejects.toThrow();
  });
});
