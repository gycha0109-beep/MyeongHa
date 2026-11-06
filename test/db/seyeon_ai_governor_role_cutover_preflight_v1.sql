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
  v_supports_maintain boolean := current_setting('server_version_num')::integer >= 170000;
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
      'myeongha_seyeon_cost_meter_owner','MEMBER')
     or pg_catalog.pg_has_role('myeongha_api_executor',
      'myeongha_seyeon_governed_executor','MEMBER') then
    raise exception 'Ordinary API executor can SET ROLE into private AI authority';
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
      'public.seyeon_ai_call_cost_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or pg_catalog.has_table_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_daily_budgets_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or pg_catalog.has_table_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_model_policies_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_call_cost_events','SELECT')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_call_cost_events','INSERT')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_call_cost_events','UPDATE')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_call_cost_events','REFERENCES')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_daily_budgets_v1','SELECT')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_daily_budgets_v1','INSERT')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_daily_budgets_v1','UPDATE')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_daily_budgets_v1','REFERENCES')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_model_policies_v1','SELECT')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_model_policies_v1','INSERT')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_model_policies_v1','UPDATE')
    or pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_governor_model_policies_v1','REFERENCES') then
    raise exception 'Common API executor obtained direct cost or policy table rights';
  end if;

  -- MAINTAIN was introduced in PostgreSQL 17. Keep the audit compatible
  -- with the PostgreSQL 15 authority-core fixture while checking it on PG17+.
  if v_supports_maintain then
    if pg_catalog.has_table_privilege('myeongha_api_executor',
        'public.seyeon_ai_call_cost_events','MAINTAIN')
      or pg_catalog.has_table_privilege('myeongha_api_executor',
        'public.seyeon_ai_governor_daily_budgets_v1','MAINTAIN')
      or pg_catalog.has_table_privilege('myeongha_api_executor',
        'public.seyeon_ai_governor_model_policies_v1','MAINTAIN') then
      raise exception 'Common API executor obtained direct PostgreSQL 17 MAINTAIN table rights';
    end if;
  end if;

  -- Critical: the same executor still owns all legacy+governed EXECUTEs.
  -- It is NOT yet a least-privilege ENFORCE execution identity.
  raise notice 'D3B2B-3A verified TEMPORARY LEGACY EXPOSURE: Start/Settle/Record available under myeongha_api_executor; Production ENFORCE remains HOLD';
end $audit$;

-- W120: internal SECURITY DEFINER budget helpers must remain private too.
begin;
grant execute on function public.seyeon_ai_start_internal_v1(uuid,uuid,uuid,text,uuid,text,text,text) to myeongha_api_executor;
grant execute on function public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb) to myeongha_api_executor;
do $internal$
begin
  if not pg_catalog.has_function_privilege('myeongha_api_executor',
      'public.seyeon_ai_start_internal_v1(uuid,uuid,uuid,text,uuid,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('myeongha_api_executor',
      'public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb)','EXECUTE') then
    raise exception 'W120 private internal function grant was not visible to ordinary API role';
  end if;
end
$internal$;
rollback;

-- W119: the ordinary executor itself must have no direct ledger, budget or
-- model-rate table privileges, including read-only and maintenance rights.
begin;
grant select on public.seyeon_ai_call_cost_events to myeongha_api_executor;
do $direct$
begin
  if not pg_catalog.has_table_privilege('myeongha_api_executor',
      'public.seyeon_ai_call_cost_events','SELECT') then
    raise exception 'W119 direct table grant was not visible to ordinary API role';
  end if;
end
$direct$;
rollback;

-- W119: column-level grants are not reported by has_table_privilege.
begin;
grant select (call_id) on public.seyeon_ai_call_cost_events
  to myeongha_api_executor;
do $columns$
begin
  if not pg_catalog.has_any_column_privilege('myeongha_api_executor',
      'public.seyeon_ai_call_cost_events','SELECT') then
    raise exception 'W119 column-level ledger grant was not visible';
  end if;
end
$columns$;
rollback;

-- W118: NOINHERIT suppresses automatic privilege inheritance, but it does
-- NOT prevent SET ROLE. PostgreSQL 15 lacks per-membership INHERIT/SET grant
-- options and pg_has_role(...,'SET'); use MEMBER/USAGE plus actual SET ROLE
-- below to prove the same boundary across PostgreSQL 15 and 17.
begin;
create role w118_membership_test_login login noinherit;
grant myeongha_api_executor to w118_membership_test_login;
grant myeongha_seyeon_governed_executor to myeongha_api_executor;
do $membership$
begin
  if not pg_catalog.pg_has_role('myeongha_api_executor',
      'myeongha_seyeon_governed_executor','MEMBER')
     or pg_catalog.pg_has_role('myeongha_api_executor',
      'myeongha_seyeon_governed_executor','USAGE')
 then
    raise exception 'NOINHERIT governed membership was not exposed as MEMBER-only';
  end if;
end
$membership$;
set local session authorization w118_membership_test_login;
set local role myeongha_api_executor;
set local role myeongha_seyeon_governed_executor;
do $membership$
begin
  if session_user is distinct from 'w118_membership_test_login'
     or current_user is distinct from 'myeongha_seyeon_governed_executor' then
    raise exception 'NOINHERIT ordinary login could not SET ROLE governed';
  end if;
end
$membership$;
rollback;

begin;
create role w118_membership_test_login login noinherit;
grant myeongha_api_executor to w118_membership_test_login with inherit false, set true;
grant myeongha_seyeon_cost_meter_owner to myeongha_api_executor;
do $membership$
begin
  if not pg_catalog.pg_has_role('myeongha_api_executor',
      'myeongha_seyeon_cost_meter_owner','MEMBER')
     or pg_catalog.pg_has_role('myeongha_api_executor',
      'myeongha_seyeon_cost_meter_owner','USAGE')
 then
    raise exception 'NOINHERIT cost-owner membership was not exposed as MEMBER-only';
  end if;
end
$membership$;
set local session authorization w118_membership_test_login;
set local role myeongha_api_executor;
set local role myeongha_seyeon_cost_meter_owner;
do $membership$
begin
  if session_user is distinct from 'w118_membership_test_login'
     or current_user is distinct from 'myeongha_seyeon_cost_meter_owner' then
    raise exception 'NOINHERIT ordinary login could not SET ROLE cost owner';
  end if;
end
$membership$;
rollback;

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
