-- D3B2B-3A: authority audit BEFORE credential split and REVOKE.
-- This is intentionally an exposure-catalog test, not an ENFORCE certification.
-- Watchtower-Track: character-memory
-- Runs against PostgreSQL after migrations; does not change ACL or data.
\set ON_ERROR_STOP on

do $audit$
declare
  v_role pg_catalog.pg_roles%rowtype;
  v_rpc record;
  v_proc pg_catalog.pg_proc%rowtype;
  v_allowed boolean;
begin
  select * into strict v_role from pg_catalog.pg_roles
    where rolname='myeongha_api_executor';
  if v_role.rolcanlogin or v_role.rolsuper or v_role.rolbypassrls
    or v_role.rolinherit then
    raise exception 'P0 common API executor privilege shape drifted';
  end if;
  select * into strict v_role from pg_catalog.pg_roles
    where rolname='myeongha_seyeon_cost_meter_owner';
  if v_role.rolcanlogin or v_role.rolsuper or v_role.rolbypassrls
    or v_role.rolinherit then
    raise exception 'Se-yeon cost meter authority privilege shape drifted';
  end if;
  if pg_catalog.pg_has_role('myeongha_api_executor',
      'myeongha_seyeon_cost_meter_owner','MEMBER') then
    raise exception 'Ordinary API executor inherited cost meter owner';
  end if;

  -- Positive grants are an explicitly documented pre-cutover HOLD. A
  -- future GRANT/REVOKE change must update the contract and rollout gate.
  for v_rpc in
    select * from (values
      ('public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)', true, 'legacy-start'),
      ('public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)', true, 'legacy-settle'),
      ('public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)', true, 'legacy-record'),
      ('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)', true, 'governed-start'),
      ('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)', true, 'governed-settle'),
      ('public.seyeon_ai_start_internal_v1(uuid,uuid,uuid,text,uuid,text,text,text)', false, 'private-start'),
      ('public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb)', false, 'private-settle')
    ) as allowed(signature, api_can_execute, label)
  loop
    select * into strict v_proc from pg_catalog.pg_proc
      where oid=v_rpc.signature::pg_catalog.regprocedure;
    if not v_proc.prosecdef
      or v_proc.proowner is distinct from
        'myeongha_seyeon_cost_meter_owner'::pg_catalog.regrole::oid then
      raise exception 'Governor function is not NOLOGIN-owned SECURITY DEFINER: %',
        v_rpc.label;
    end if;
    v_allowed:=pg_catalog.has_function_privilege(
      'myeongha_api_executor',v_rpc.signature::pg_catalog.regprocedure,'EXECUTE');
    if v_allowed is distinct from v_rpc.api_can_execute then
      raise exception 'Pre-cutover API executor ACL drift on %: expected %, got %',
        v_rpc.label,v_rpc.api_can_execute,v_allowed;
    end if;
    if pg_catalog.has_function_privilege('anon',
        v_rpc.signature::pg_catalog.regprocedure,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',
        v_rpc.signature::pg_catalog.regprocedure,'EXECUTE')
      or pg_catalog.has_function_privilege('service_role',
        v_rpc.signature::pg_catalog.regprocedure,'EXECUTE') then
      raise exception 'Browser/service principal may execute %',v_rpc.label;
    end if;
  end loop;

  if pg_catalog.has_table_privilege('myeongha_api_executor',
      'public.seyeon_ai_call_cost_events','INSERT')
    or pg_catalog.has_table_privilege('myeongha_api_executor',
      'public.seyeon_ai_call_cost_events','UPDATE')
    or pg_catalog.has_table_privilege('myeongha_api_executor',
      'public.seyeon_ai_call_cost_events','DELETE')
    or pg_catalog.has_table_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_daily_budgets_v1','SELECT')
    or pg_catalog.has_table_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_daily_budgets_v1','UPDATE')
    or pg_catalog.has_table_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_model_policies_v1','SELECT') then
    raise exception 'Common API executor obtained direct cost or policy table rights';
  end if;

  -- Critical: the same executor still owns all legacy+governed EXECUTEs.
  -- It is NOT yet a least-privilege ENFORCE execution identity.
  raise notice 'D3B2B-3A verified TEMPORARY LEGACY EXPOSURE: Start/Settle/Record available under myeongha_api_executor; Production ENFORCE remains HOLD';
end $audit$;

begin;
set local role myeongha_api_executor;
do $invoker$
begin
  if current_user is distinct from 'myeongha_api_executor' then
    raise exception 'ACL role-switch negative test was not under API executor';
  end if;
  if not pg_catalog.has_function_privilege(
       current_user,'public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)','EXECUTE')
    or not pg_catalog.has_function_privilege(
       current_user,'public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)','EXECUTE')
    or not pg_catalog.has_function_privilege(
       current_user,'public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)','EXECUTE')
  then
    raise exception 'OFF compatibility cut over without a scoped rollout';
  end if;

  if pg_catalog.has_function_privilege(
      current_user,'public.seyeon_ai_start_internal_v1(uuid,uuid,uuid,text,uuid,text,text,text)','EXECUTE')
    or pg_catalog.has_function_privilege(
      current_user,'public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb)','EXECUTE')
  then
    raise exception 'Common role reached an internal budget ledger helper';
  end if;
end $invoker$;
rollback;

select 'D3B2B-3A ACL audit: PASS (legacy exposure is expected HOLD)' as status;
