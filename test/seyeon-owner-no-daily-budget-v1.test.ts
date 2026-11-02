import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(new URL(
  '../scripts/operations/seyeon-security-s0/production-23-owner-no-daily-spend-cap-20261102.sql',
  import.meta.url),'utf8');

const start=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.cmd_governed_start_seyeon_ai_call_v1'),
 sql.indexOf('CREATE OR REPLACE FUNCTION public.cmd_governed_settle_seyeon_ai_call_v1'));
const settle=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.cmd_governed_settle_seyeon_ai_call_v1'),
 sql.indexOf('RESET ROLE;'));

describe('Se-yeon Owner unlimited daily spending — verified identity, not unlimited model calls',()=>{
  it('does not invent a daily monetary limit or create a fake budget row',()=>{
    expect(start).toContain('a.is_owner_admin and a.chat_credit_exempt');
    expect(start).toContain('if not v_owner_unlimited then');
    expect(start).toContain('seyeon_ai_governor_day_not_configured');
    expect(start).toContain('seyeon_ai_governor_global_exhausted');
    expect(start).toContain('seyeon_ai_governor_subject_exhausted');
    expect(start).toContain('governor_owner_no_daily_limit=v_owner_unlimited');
    expect(settle).toContain('e.governor_owner_no_daily_limit into v_day,v_owner_unlimited');
    expect(settle).toContain('if not v_owner_unlimited then');
    expect(sql).not.toMatch(/insert\s+into\s+public\.seyeon_ai_governor_daily_budgets_v1/iu);
    expect(sql).not.toContain('9223372036854775807::bigint AS global_limit_micro_usd');
  });
  it('preserves the protected per-call dispatch, exact model quote and final settlement',()=>{
    expect(start).toContain('public.seyeon_ai_start_internal_v1(');
    expect(start).toContain('seyeon_ai_governor_model_policy_mismatch');
    expect(start).toContain('p_verified_input_token_bound');
    expect(start).toContain('p_enforced_output_limit');
    expect(start).toContain('seyeon_ai_governor_ledger_write_failed');
    expect(settle).toContain('public.seyeon_ai_settle_internal_v1(');
    expect(settle).toContain('seyeon_ai_governor_settlement_identity_drift');
    expect(settle).toContain('seyeon_ai_governor_settlement_price_drift');
    expect(settle).toContain('seyeon_ai_governor_settlement_lost_reservation');
    expect(sql).toContain('governor_owner_no_daily_limit boolean NOT NULL DEFAULT false');
  });
  it('does not open unverified Member or public RPC access',()=>{
    expect(sql).toContain('public.qry_myeongha_owner_admin_access_v1(p_subject_id)');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.qry_myeongha_owner_admin_access_v1(uuid)');
    expect(sql).toContain('TO myeongha_seyeon_cost_meter_owner;');
    expect(sql).toContain("has_function_privilege('anon'");
    expect(sql).toContain("has_function_privilege('authenticated'");
    expect(sql).toContain("has_function_privilege('service_role'");
    expect(sql).toContain('REVOKE CREATE ON SCHEMA public FROM myeongha_seyeon_cost_meter_owner');
    expect(sql).toMatch(/COMMIT;\s*$/u);
  });
});
