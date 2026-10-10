-- D4B-9: detached, server-owned settlement of an ALREADY RESERVED AI call.
-- Watchtower-Track: character-memory
-- No Guest token resurrection, new paid dispatch, Production credential, or ON switch.
-- Historical functions/roles/DB policies are unchanged.
begin;

do $preflight$
begin
  if pg_catalog.to_regprocedure(
      'public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)'
    ) is null
    or pg_catalog.to_regclass('public.seyeon_ai_call_cost_events') is null
    or pg_catalog.to_regprocedure(
      'public.assert_myeongha_subject_context_v1(uuid)'
    ) is null
    or not exists (
      select 1 from pg_catalog.pg_roles
      where rolname='myeongha_seyeon_cost_meter_owner'
        and not rolcanlogin and not rolsuper and not rolbypassrls
    )
  then
    raise exception 'D4B-9 trusted cost settlement prerequisites are missing';
  end if;
end
$preflight$;

do $worker_role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname='myeongha_seyeon_settlement_worker'
  ) then
    create role myeongha_seyeon_settlement_worker
      nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname='myeongha_seyeon_settlement_worker'
      and not rolcanlogin and not rolsuper and not rolcreatedb
      and not rolcreaterole and not rolinherit
      and not rolreplication and not rolbypassrls
  ) or pg_catalog.pg_has_role('myeongha_seyeon_settlement_worker',
    'myeongha_api_executor','MEMBER')
     or pg_catalog.pg_has_role('myeongha_seyeon_settlement_worker',
    'myeongha_seyeon_governed_executor','MEMBER')
     or pg_catalog.pg_has_role('myeongha_seyeon_settlement_worker',
    'myeongha_seyeon_cost_meter_owner','MEMBER')
  then
    raise exception 'D4B-9 settlement worker role is not isolated';
  end if;
end
$worker_role$;

grant usage on schema public to myeongha_seyeon_settlement_worker;

-- A detached worker has no bearer/JWT and must not claim an end-user context.
-- The authoritative Subject/Turn/Attempt/Phase AND already-reserved Call ID
-- must be supplied by the private server's persisted dispatch receipt.
-- The owner-scoped ledger is queried only AFTER setting the exact Subject
-- context. RLS remains enforced: no global SELECT policy or raw table grant.
create function public.cmd_settle_seyeon_ai_call_detached_v1(
  p_subject_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_phase text,p_event jsonb
)
returns table(
  call_id uuid,replayed boolean,occupied_micro_usd bigint,over_ceiling boolean
)
language plpgsql security definer
set search_path=pg_catalog,public
as $detached$
declare
  v_call uuid;
  v_result record;
begin
  if p_subject_id is null or p_turn_id is null or p_attempt_id is null
    or p_phase not in ('chat','post_turn')
    or pg_catalog.jsonb_typeof(p_event) is distinct from 'object'
    or p_event->>'callId' is null
    or p_event->>'callId' !~ '^[0-9a-fA-F-]{36}$'
  then
    raise exception using errcode='23514',
      constraint='seyeon_detached_settlement_invalid',
      message='Detached settlement requires a reserved call and exact source IDs';
  end if;
  v_call := (p_event->>'callId')::uuid;

  -- This capability is NEVER granted to an end-user DB principal.
  -- Bind only the caller-supplied exact Subject under the server-owned
  -- worker trust boundary; the following authoritative ledger probe
  -- prevents arbitrary unreserved/cross-Subject settlement.
  perform pg_catalog.set_config('myeongha.subject_id',p_subject_id::text,true);
  perform 1 from public.seyeon_ai_call_cost_events e
  where e.call_id=v_call
    and e.subject_id=p_subject_id
    and e.turn_id=p_turn_id
    and e.attempt_id=p_attempt_id
    and e.phase=p_phase
    and e.governor_bucket_utc_date is not null
    and e.governor_ceiling_micro_usd is not null
    and e.lifecycle_state in ('started','settled');
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_detached_settlement_not_reserved',
      message='Detached settlement cannot create or claim a missing reservation';
  end if;

  -- Reuse the sole atomic budget/ledger command and immutable receipt checks.
  -- It locks daily budget before the exact row and is replay-safe.
  select x.* into strict v_result
  from public.cmd_governed_settle_seyeon_ai_call_v1(
    p_subject_id,p_turn_id,p_attempt_id,p_phase,p_event
  ) x;
  return query
  select v_result.call_id,v_result.replayed,
    v_result.occupied_micro_usd,v_result.over_ceiling;
end
$detached$;

grant myeongha_seyeon_cost_meter_owner to current_user;
grant create on schema public to myeongha_seyeon_cost_meter_owner;
alter function public.cmd_settle_seyeon_ai_call_detached_v1(
  uuid,uuid,uuid,text,jsonb
) owner to myeongha_seyeon_cost_meter_owner;
revoke all on function public.cmd_settle_seyeon_ai_call_detached_v1(
  uuid,uuid,uuid,text,jsonb
) from public, myeongha_api_executor, myeongha_seyeon_governed_executor;
do $revoke_clients$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_settle_seyeon_ai_call_detached_v1(uuid,uuid,uuid,text,jsonb) from %I',
      v_role
    );
  end loop;
end
$revoke_clients$;
grant execute on function public.cmd_settle_seyeon_ai_call_detached_v1(
  uuid,uuid,uuid,text,jsonb
) to myeongha_seyeon_settlement_worker;
revoke create on schema public from myeongha_seyeon_cost_meter_owner;
revoke myeongha_seyeon_cost_meter_owner from current_user;

do $check_acl$
begin
  if not pg_catalog.has_function_privilege(
       'myeongha_seyeon_settlement_worker',
       'public.cmd_settle_seyeon_ai_call_detached_v1(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE')
    or pg_catalog.has_function_privilege(
       'myeongha_seyeon_governed_executor',
       'public.cmd_settle_seyeon_ai_call_detached_v1(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE')
    or pg_catalog.has_function_privilege(
       'myeongha_api_executor',
       'public.cmd_settle_seyeon_ai_call_detached_v1(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE')
    or pg_catalog.has_function_privilege(
       'myeongha_seyeon_settlement_worker',
       'public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)',
       'EXECUTE')
    or pg_catalog.has_function_privilege(
       'myeongha_seyeon_settlement_worker',
       'public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE')
    or pg_catalog.has_table_privilege(
       'myeongha_seyeon_settlement_worker',
       'public.seyeon_ai_call_cost_events','SELECT')
    or pg_catalog.has_table_privilege(
       'myeongha_seyeon_settlement_worker',
       'public.seyeon_ai_governor_daily_budgets_v1','SELECT')
  then
    raise exception 'D4B-9 detached settlement exceeded one-RPC worker boundary';
  end if;
end
$check_acl$;
commit;
