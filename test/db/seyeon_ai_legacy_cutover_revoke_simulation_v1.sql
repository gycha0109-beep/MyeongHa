-- D3B2B-3D1: OFF-preserving, rollback-only ACL rehearsal.
-- IMPORTANT: only run against disposable CI PostgreSQL after migrations.
-- The REVOKEs below are inside one transaction and always ROLLBACK.
-- No Production DB, migration, or operational grant changes.
-- Watchtower-Track: character-memory
\set ON_ERROR_STOP on

begin;

do $before$
begin
  if not (
    pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)',
      'EXECUTE')
    and pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)',
      'EXECUTE')
    and pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)',
      'EXECUTE')
  ) then
    raise exception 'D3B2B-3D1: OFF legacy authority has already drifted; stop';
  end if;
end $before$;

-- This is a disposable transaction-only demonstration of the planned
-- narrower common role. The transaction is NEVER COMMITTED.
revoke execute on function public.cmd_start_seyeon_ai_call_v1(
  uuid,uuid,uuid,text,uuid,text,text,text) from myeongha_api_executor;
revoke execute on function public.cmd_settle_seyeon_ai_call_v1(
  uuid,uuid,uuid,text,jsonb) from myeongha_api_executor;
revoke execute on function public.cmd_record_seyeon_ai_call_cost_v1(
  uuid,uuid,uuid,text,jsonb) from myeongha_api_executor;

do $matrix$
declare
  v_rpc record;
begin
  for v_rpc in
    select * from (values
      ('public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)',false,false),
      ('public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)',false,false),
      ('public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)',false,false),
      ('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)',true,true),
      ('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)',true,true)
    ) as acl(signature, common_execute, governed_execute)
  loop
    if pg_catalog.has_function_privilege(
        'myeongha_api_executor',v_rpc.signature::pg_catalog.regprocedure,
        'EXECUTE') is distinct from v_rpc.common_execute then
      raise exception 'D3B2B-3D1 simulation common RPC ACL mismatch: %',v_rpc.signature;
    end if;
    if pg_catalog.has_function_privilege(
        'myeongha_seyeon_governed_executor',
        v_rpc.signature::pg_catalog.regprocedure,
        'EXECUTE') is distinct from v_rpc.governed_execute then
      raise exception 'D3B2B-3D1 simulation governed RPC ACL mismatch: %',v_rpc.signature;
    end if;
  end loop;
end $matrix$;

set local role myeongha_api_executor;
do $deny$
declare
  v_denied boolean;
begin
  -- Real function execution must fail for ACL reasons, not input validity.
  v_denied:=false;
  begin
    perform * from public.cmd_start_seyeon_ai_call_v1(
      null,null,null,'chat',null,'turn_interpretation',
      'openai-responses','offline-model');
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'D3B2B-3D1 common legacy Start bypass'; end if;

  v_denied:=false;
  begin
    perform * from public.cmd_settle_seyeon_ai_call_v1(
      null,null,null,'chat','{}'::jsonb);
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'D3B2B-3D1 common legacy Settle bypass'; end if;

  v_denied:=false;
  begin
    perform * from public.cmd_record_seyeon_ai_call_cost_v1(
      null,null,null,'chat','{}'::jsonb);
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'D3B2B-3D1 common legacy Record bypass'; end if;
end $deny$;

reset role;
rollback;

-- The ordinary OFF rights MUST remain intact after test transaction rollback.
do $restored$
begin
  if not (
    pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)',
      'EXECUTE')
    and pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)',
      'EXECUTE')
    and pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)',
      'EXECUTE')
  ) then
    raise exception 'D3B2B-3D1 OFF ACL rollback did not restore legacy access';
  end if;
end $restored$;

select 'D3B2B-3D1 rollback-only simulated REVOKE: PASS (OFF unchanged; Production HOLD)' as status;
