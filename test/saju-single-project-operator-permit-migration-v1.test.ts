import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SAJU_SINGLE_PROJECT_CONSUME_SQL_V1,
} from '../apps/api/src/saju-single-project-operator-permit-v1.js';

const sql = readFileSync(new URL(
  '../supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql',
  import.meta.url,
), 'utf8');

describe('Single-Supabase dormant DB authority SQL proposal', () => {\n  it('cannot trigger main-push Supabase production migrations', () => {\n    expect(existsSync(new URL(\n      '../supabase/migrations/1730_saju_bridge_single_project_operator_permit_v1.sql',\n      import.meta.url,\n    ))).toBe(false);\n    expect(existsSync(new URL(\n      '../supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql',\n      import.meta.url,\n    ))).toBe(true);\n  });
  it('uses one non-public schema and never creates another database or a login identity', () => {
    expect(sql).toContain('create schema saju_bridge_private;');
    expect(sql).toContain('revoke all on schema saju_bridge_private from public;');
    expect(sql).toContain('create table saju_bridge_private.operator_permits_v1');
    expect(sql).toContain('create table saju_bridge_private.audit_events_v1');
    expect(sql).toContain('nologin nosuperuser nocreatedb nocreaterole');
    expect(sql).toContain('noinherit noreplication nobypassrls');
    expect(sql).not.toMatch(/\bcreate\s+(?:database|project|login|extension)\b/iu);
    expect(sql).not.toMatch(/\bgrant\s+.*\b(?:myeongha_api_executor|service_role)\b/iu);
    expect(sql).not.toMatch(/\bcreate\s+table\s+public\./iu);
    expect(sql).not.toContain('create table saju_bridge_private.request_claims');
    expect(sql).not.toContain('create table saju_bridge_private.execution_ledger');
  });

  it('denies generic roles and delegates no direct table DML to consumer', () => {
    expect(sql).toContain('grant usage on schema saju_bridge_private');
    expect(sql).toContain('revoke all on function saju_bridge_private.cmd_consume_operator_permit_v1(');
    expect(sql).toContain('from public;');
    expect(sql).toContain('grant execute on function saju_bridge_private.cmd_consume_operator_permit_v1(');
    expect(sql).toContain('to myeongha_saju_bridge_permit_executor;');
    expect(sql).not.toMatch(/\bgrant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table\s+)?saju_bridge_private\./iu);
    expect(sql).toContain("'anon', 'authenticated', 'service_role', 'myeongha_api_executor',");
    expect(sql).toContain("'myeongha_runtime', 'myeongha_worker_runtime'");
    expect(sql).toContain('alter table saju_bridge_private.operator_permits_v1\n  force row level security;');
    expect(sql).toContain('alter table saju_bridge_private.audit_events_v1\n  force row level security;');
  });

  it('requires atomic issued->consumed + same-transaction audit, never activates commerce', () => {
    expect(sql).toContain("p.action = 'SINGLE_PROJECT_INTEGRATION_PROBE'");
    expect(sql).toContain("p.status = 'ISSUED'");
    expect(sql).toContain('p.consumed_at is null');
    expect(sql).toContain('p.expires_at > pg_catalog.clock_timestamp()');
    expect(sql).toContain('update saju_bridge_private.operator_permits_v1');
    expect(sql).toContain('insert into saju_bridge_private.audit_events_v1');
    expect(sql).toContain("values (\n    p_audit_event_id, v_permit_id, 'PERMIT_CONSUMED', p_audit_digest");
    expect(sql).toContain("check (project_ref = 'cnsfpcdiyofqvhpcegfc')");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain('unique\n    references saju_bridge_private.operator_permits_v1');
    expect(sql).not.toMatch(/\bcreate\s+(?:policy|function|trigger)\s+.*\b(?:canSell|canPublish)\b/iu);
    expect(SAJU_SINGLE_PROJECT_CONSUME_SQL_V1)
      .toContain('saju_bridge_private.cmd_consume_operator_permit_v1');
    expect(SAJU_SINGLE_PROJECT_CONSUME_SQL_V1).not.toContain('public.');
  });

  it('explicitly leaves independent Root, service deployment and Owner authentication unverified', () => {
    expect(sql).toContain('does NOT satisfy isolated 3DB staging, independent Root/KMS');
    expect(sql).toContain('No issuer role/login, seeded permit');
    expect(sql).toContain('Caller-bound SHA/digests are not independent Owner approval');
    expect(sql).not.toContain('MYEONGHA_SAJU_SERVICE_BEARER');
    expect(sql).not.toContain('supabase.auth.admin');
  });
});
