import { describe, expect, it } from 'vitest';
import { ADMIN_READ_SQL_V1, ADMIN_READ_PRINCIPAL_SQL_V1, createAdminPostgresReadPortV1 } from './admin-postgres-read-v1.js';
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
  it('binds receipt-resolved provider lifecycle metadata without external IDs or verified payloads', async () => {
    const h = harness();
    await h.port.read({ ...filters('provider-events'), subjectId: SUBJECT, receiptId: SUBJECT, providerEventStatus: 'failed' });
    expect(h.params[2]).toEqual([21,SUBJECT,null,null,0,SUBJECT,'failed']);
    expect(h.sql[2]).toContain('e.resolved_receipt_id=$6::uuid');
    expect(h.sql[2]).not.toMatch(/external_event_id|external_transaction_id|verified_payload_jsonb|payload_fingerprint/iu);
    expect(ADMIN_READ_SQL_V1.credits).toContain("OR (lot.credits_remaining > 0 AND (lot.expires_at IS NULL OR lot.expires_at > CURRENT_TIMESTAMP))");
    expect(ADMIN_READ_PRINCIPAL_SQL_V1).toContain('NOT r.rolbypassrls');
    expect(ADMIN_READ_PRINCIPAL_SQL_V1).toContain('pg_catalog.pg_auth_members');
  });
  it('reads current entitlement metadata and exact receipt event lineage without payloads or dedupe secrets', async () => {
    const h = harness();
    await h.port.read({ ...filters('entitlements'), subjectId: SUBJECT });
    expect(h.params[2]).toEqual([21, SUBJECT, null, null, 0]);
    expect(h.sql[2]).toContain('e.effective_valid_until');
    // Current rights must remain visible even when their original creation is old.
    expect(h.sql[2]).not.toContain("INTERVAL '90 days'");
    const events = harness();
    await events.port.read({ ...filters('entitlement-events'), receiptId: SUBJECT });
    expect(events.params[2]).toEqual([21, null, null, null, 0, SUBJECT]);
    expect(events.sql[2]).toContain('e.source_receipt_id=$6::uuid');
    expect(events.sql[2]).not.toMatch(/payload_jsonb|event_dedupe_key|source_actor_ref/iu);
  });
  it('detects duplicate grant evidence by receipt, owner and logical capability scope', () => {
    const sql = ADMIN_READ_SQL_V1['commerce-alerts']!;
    expect(sql).toContain('g.subject_id=r.subject_id');
    expect(sql).toContain('e.subject_id=r.subject_id');
    expect(sql).toContain('GROUP BY g.entitlement_key,g.scope_key_norm');
    expect(sql).toContain('HAVING COUNT(DISTINCT g.id)>1');
    expect(sql).toContain('receipt_same_scope_multiple_active_grants');
    expect(ADMIN_READ_SQL_V1['credit-reservations']).toContain('r.client_turn_id::text AS "clientTurnId"');
  });
  it('blocks ordinary subject role before querying data', async () => {
    const h = harness('myeongha_api_executor');
    await expect(h.port.read(filters())).rejects.toThrow('Dedicated administrative');
    expect(h.sql).toEqual(['BEGIN READ ONLY',ADMIN_READ_PRINCIPAL_SQL_V1,'ROLLBACK']);
  });
  it('binds user reference and date filters only as parameters', async () => {
    const h = harness();
    await h.port.read({ ...filters('commerce'), subjectId: SUBJECT, from: '2026-10-01', to: '2026-10-26' });
    expect(h.sql[2]).not.toContain(SUBJECT);
    expect(h.sql[2]).toContain('$2::uuid');
    expect(h.params[2]).toEqual([21, SUBJECT, '2026-10-01','2026-10-26',0,null]);
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
    expect(sql).toContain("r.execution_status='failed'");
    expect(sql).toContain("l.status IN ('failed','blocked')");
    expect(sql).toContain("o.status IN ('failed','dead_lettered')");
    expect(sql).toContain("INTERVAL '7 days'");
    expect(sql).toContain("SUM(r.verified_amount_minor)");
    expect(sql).toContain("r.verified_currency='KRW'");
    expect(sql).toContain("r.verified_amount_minor IS NULL OR r.verified_currency IS NULL");
    expect(sql).not.toMatch(/payload_jsonb|raw_birth|display_price_minor/iu);
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
        ...(kind === 'commerce-detail' || kind === 'reading-detail' || kind === 'reading-attempts' || kind === 'reading-ai-usage' ? { recordId: SUBJECT } : {}),
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
  it('flags revoked paid-credit receipts only with an exact owner-bound remaining lot', () => {
    const sql=ADMIN_READ_SQL_V1['commerce-alerts'] ?? '';
    expect(sql).toContain("r.verification_status = 'revoked'");
    expect(sql).toContain("p.product_type = 'credit'");
    expect(sql).toContain("lot.source_kind = 'portone_topup'");
    expect(sql).toContain('lot.source_ref = r.id AND lot.credits_remaining > 0');
    expect(sql).toContain('lot.subject_id = r.subject_id');
    expect(sql).toContain('revoked_credit_receipt_with_remaining_lot');
    expect(sql).toContain("'manual_review_only'");
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b/iu);
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
  it('exposes source-linked AI usage without invented Reading costs or raw prompts',async()=>{
    const h=harness();
    await h.port.read({...filters('reading-ai-usage'),recordId:SUBJECT});
    expect(h.params[2]).toEqual([21,SUBJECT,0]);
    expect(h.sql[2]).toContain('rg.reading_id=$2::uuid');
    expect(h.sql[2]).toContain('g.ai_execution_log_id=l.id AND g.grounding_id=rg.id');
    expect(h.sql[2]).toContain('ORDER BY rg2.id LIMIT 1');
    expect(h.sql[2]).toContain('NULL::text AS "costKrw"');
    expect(h.sql[2]).not.toMatch(/input_ref_jsonb|output_ref_jsonb|response_snapshot_jsonb/iu);
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
  it('shows direct receipt-linked entitlement event evidence without claiming global ownership', () => {
    const sql = ADMIN_READ_SQL_V1['commerce-detail'] ?? '';
    expect(sql).toContain('e.source_receipt_id=r.id');
    expect(sql).toContain("e.event_type IN ('granted','renewed')");
    expect(sql).toContain('g.status=\'active\'');
    expect(sql).toContain('no_linked_active_grant_observed');
    expect(sql).not.toMatch(/payload_jsonb|verified_payload_jsonb|receipt_fingerprint/iu);
  });
  it('binds category and failure status as parameters', async () => {
    const h = harness();
    await h.port.read({ ...filters('issues'), issueCategory: 'reading.failed', issueStatus: 'failed' });
    expect(h.sql[2]).toContain('o.event_type=$6::text');
    expect(h.params[2]).toEqual([21, 'failed', null, null, 0, 'reading.failed']);
  });
  it('includes unbounded paid credit lots and shows their remaining/expiry evidence', () => {
    const userSql = ADMIN_READ_SQL_V1['user-detail'] ?? '';
    const lotsSql = ADMIN_READ_SQL_V1.credits ?? '';
    expect(userSql).toContain('l.expires_at IS NULL OR l.expires_at>CURRENT_TIMESTAMP');
    expect(lotsSql).toContain('lot.credits_remaining AS "creditsRemaining"');
    expect(lotsSql).toContain('lot.expires_at IS NULL');
    expect(lotsSql).toContain('lot.expires_at::text AS "expiresAt"');
  });
  it('distinguishes PortOne credit lots from entitlement event delivery', () => {
    const alerts = ADMIN_READ_SQL_V1['commerce-alerts'] ?? '';
    const detail = ADMIN_READ_SQL_V1['commerce-detail'] ?? '';
    expect(alerts).toContain("p.product_type = 'credit'");
    expect(alerts).toContain("p.product_type <> 'credit'");
    expect(alerts).toContain("lot.source_kind = 'portone_topup'");
    expect(alerts).toContain("lot.source_ref = r.id");
    expect(detail).toContain("lot.source_kind='portone_topup'");
    expect(detail).toContain('credit_lots.remaining::text AS "linkedCreditRemaining"');
  });
  it('displays money only from verified receipt evidence, never the catalog offer price', () => {
    for (const kind of ['commerce', 'commerce-detail'] as const) {
      const sql=ADMIN_READ_SQL_V1[kind] ?? '';
      expect(sql).toContain("r.verification_status='verified'");
      expect(sql).toContain('r.verified_amount_minor::text ELSE NULL::text END AS "amountMinor"');
      expect(sql).toContain('r.verified_currency ELSE NULL::text END AS "currency"');
      expect(sql).not.toContain('po.currency AS "currency"');
    }
  });
  it('never calls single execution latency a P95 aggregate', () => {
    const sql=ADMIN_READ_SQL_V1['ai-errors'] ?? '';
    expect(sql).toContain('l.latency_ms AS "latencyMs"');
    expect(sql).not.toContain('"p95LatencyMs"');
  });

  it('binds credit lot source and reservation state without SQL interpolation', async () => {
    const lot = harness();
    await lot.port.read({ ...filters('credits'), creditSource: 'reading_reward' });
    expect(lot.sql[2]).toContain('lot.source_kind=$6::text');
    expect(lot.params[2]).toEqual([21, null, null, null, 0, 'reading_reward']);
    const reservation = harness();
    await reservation.port.read({ ...filters('credit-reservations'), reservationState: 'reserved' });
    expect(reservation.sql[2]).toContain('r.state=$6::text');
    expect(reservation.params[2]).toEqual([21, null, null, null, 0, 'reserved', false]);
  });
  it('compares reservation required credits with its actual persisted lot allocation total', async () => {
    const sql=ADMIN_READ_SQL_V1['credit-reservations'] ?? '';
    expect(sql).toContain('public.chat_credit_turn_allocations_v1 a');
    expect(sql).toContain('a.reservation_id=r.id');
    expect(sql).toContain('allocations.allocated_credits,0)=r.required_credits');
    expect(sql).toContain('matching_allocation');
    expect(sql).toContain('allocation_mismatch');
    expect(sql).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b|payload_jsonb/iu);
    const h=harness();
    await h.port.read(filters('credit-reservations'));
    expect(h.params[2]).toEqual([21,null,null,null,0,null,false]);
  });

  it('offers a bounded manual-review filter for credit reservations with allocation mismatch', async () => {
    const h=harness();
    await h.port.read({ ...filters('credit-reservations'), allocationMismatchOnly:true });
    expect(h.sql[2]).toContain('allocations.allocated_credits,0)<>r.required_credits');
    expect(h.params[2]).toEqual([21,null,null,null,0,null,true]);
  });

  it('traces credit allocations through reservation and original lot without changing balances', async () => {
    const sql=ADMIN_READ_SQL_V1['credit-allocations'] ?? '';
    expect(sql).toContain('public.chat_credit_turn_allocations_v1');
    expect(sql).toContain('lot.subject_id=r.subject_id');
    expect(sql).toContain('r.state AS "reservationState"');
    expect(sql).toContain('a.credits AS "allocatedCredits"');
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b/iu);
    const h=harness();
    await h.port.read({ ...filters('credit-allocations'), subjectId: SUBJECT });
    expect(h.params[2]).toEqual([21, SUBJECT, null, null, 0, null]);
  });
  it('reads only 90-day audit metadata using a bounded read-only SELECT', async () => {
    const sql=ADMIN_READ_SQL_V1.audit ?? '';
    expect(sql).toContain('myeongha_admin_ops.admin_audit_events_v1');
    expect(sql).toContain("INTERVAL '90 days'");
    expect(sql).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/iu);
    expect(sql).not.toContain("payload_jsonb");
    const h=harness();
    await h.port.read({ ...filters('audit'), from: '2026-10-01', to: '2026-10-26' });
    expect(h.params[2]).toEqual([21,0,'2026-10-01','2026-10-26',null]);
  });
  it('binds a single reservation reference when inspecting its contributing credit lots', async () => {
    const h=harness();
    await h.port.read({ ...filters('credit-allocations'), reservationId: SUBJECT });
    expect(h.sql[2]).toContain('a.reservation_id=$6::uuid');
    expect(h.params[2]).toEqual([21,null,null,null,0,SUBJECT]);
  });
  it('limits Reading execution history to a single UUID without reading private snapshots', async () => {
    const query=ADMIN_READ_SQL_V1['reading-attempts'] ?? '';
    expect(query).toContain('a.reading_id=$2::uuid');
    expect(query).toContain('a.execution_attempt_no DESC');
    expect(query).not.toMatch(/request_snapshot_jsonb|response_snapshot_jsonb|output_ref_jsonb|external_request_ref/iu);
    const h=harness();
    await h.port.read({ ...filters('reading-attempts'), recordId: SUBJECT });
    expect(h.params[2]).toEqual([21, SUBJECT, 0]);
    await expect(h.port.read(filters('reading-attempts'))).rejects.toThrow('exact Reading reference');
  });
  it('binds AI failure stage and exact error code without SQL interpolation', async () => {
    const h=harness();
    await h.port.read({ ...filters('ai-errors'), aiStage: 'renderer', aiErrorCode: 'PROVIDER_TIMEOUT' });
    expect(h.sql[2]).toContain('l.stage=$6::text');
    expect(h.sql[2]).toContain('l.error_code=$7::text');
    expect(h.sql[2]).not.toContain('PROVIDER_TIMEOUT');
    expect(h.params[2]).toEqual([21,null,null,null,0,'renderer','PROVIDER_TIMEOUT',null]);
  });
  it('binds model and feature measurements and keeps UTC days and unattributed calls explicit', async () => {
    for (const kind of ['ai-costs', 'ai-estimates'] as const) {
      const h = harness();
      const feature = kind === 'ai-costs' ? 'renderer' : 'chat';
      await h.port.read({ ...filters(kind), aiFeature: feature, aiModel: 'provider/model-v1' });
      expect(h.params[2]).toEqual([21,null,null,null,0,feature,'provider/model-v1']);
      expect(h.sql[2]).toContain("AT TIME ZONE 'UTC'");
      expect(h.sql[2]).not.toContain('provider/model-v1');
    }
    expect(ADMIN_READ_SQL_V1['ai-costs']).toContain('l.turn_id IS NULL');
    expect(ADMIN_READ_SQL_V1['ai-costs']).toContain('"unclassifiedCalls"');
    expect(ADMIN_READ_SQL_V1.readings).toContain('attempt.error_code AS "errorCode"');
    expect(ADMIN_READ_SQL_V1['reading-detail']).toContain('r.request_contract_version');
  });
  it('shows only nondeleted conversation thread update time, not inferred global activity', () => {
    for (const kind of ['users','user-detail'] as const) {
      const sql=ADMIN_READ_SQL_V1[kind] ?? '';
      expect(sql).toContain('MAX(t.updated_at)::text');
      expect(sql).toContain("t.status<>'deleted'");
      expect(sql).toContain('t.subject_id=s.id');
      expect(sql).not.toContain('t.title');
      expect(sql).not.toContain('lastActivityAt');
    }
  });
  it('binds deletion lifecycle and scope from canonical enumerations', async () => {
    const h=harness();
    await h.port.read({ ...filters('deletion-jobs'), deletionStatus:'failed', deletionScope:'account' });
    expect(h.sql[2]).toContain('d.status=$6::text');
    expect(h.sql[2]).toContain('d.scope=$7::text');
    expect(h.params[2]).toEqual([21,null,null,null,0,'failed','account']);
  });
  it('filters content release and character states with verified SQL parameters', async () => {
    const release=harness();
    await release.port.read({ ...filters('content-releases'), releaseStatus:'active' });
    expect(release.sql[2]).toContain('r.status=$3::text');
    expect(release.params[2]).toEqual([21,0,'active']);
    const character=harness();
    await character.port.read({ ...filters('characters'), characterAvailability:'coming_soon' });
    expect(character.sql[2]).toContain('c.availability=$3::text');
    expect(character.params[2]).toEqual([21,0,'coming_soon']);
  });
  it('filters only verified receipt verification enum values through SQL arguments', async () => {
    const h=harness();
    await h.port.read({ ...filters('commerce'), receiptStatus:'revoked' });
    expect(h.sql[2]).toContain('r.verification_status=$6::text');
    expect(h.params[2]).toEqual([21,null,null,null,0,'revoked']);
  });
  it('binds operator audit outcomes without interpolating state or exposing audit payloads', async () => {
    const h=harness();
    await h.port.read({ ...filters('audit'), auditOutcome:'denied' });
    expect(h.sql[2]).toContain('a.outcome=$5::text');
    expect(h.params[2]).toEqual([21,0,null,null,'denied']);
    expect(h.sql[2]).not.toMatch(/request_body|payload_jsonb|auth_token/iu);
  });

  it('provides bounded pagination', async () => {
    const h = harness('myeongha_admin_reader',Array.from({length:3},()=>({subjectId:SUBJECT})));
    const result = await h.port.read({ ...filters(),limit:2 });
    expect(result.rows).toHaveLength(2);
    expect(result.nextCursor).toBe('2');
    await expect(h.port.read({ ...filters(), cursor:'1;DELETE' })).rejects.toThrow();
    const last = await h.port.read({ ...filters(), limit: 2, cursor: '10000' });
    expect(last.nextCursor).toBeNull();
    await expect(h.port.read({ ...filters('commerce-detail'), recordId: null })).rejects.toThrow();
    await expect(h.port.read({ ...filters(), limit: 100 })).rejects.toThrow();
  });
});
