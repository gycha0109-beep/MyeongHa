-- Watchtower-Track: character-memory
-- G2 actual v2/legacy call graph and 1640 immutability: READ-ONLY catalog
-- inspection inside the named disposable PostgreSQL DB.
-- This is a *negative readiness gate*, NOT Production G2 approval.
\set ON_ERROR_STOP on
begin;
do $guard$
declare
  v_v2 regprocedure;
  v_v1 regprocedure;
  v_zero_trigger oid;
  v_zero_fn regprocedure;
  v_v2def text;
  v_v1def text;
  v_zerodef text;
  v_legacy_access jsonb;
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer < 150000 then
    raise exception 'G2 read-only catalog verification refuses non-disposable DB';
  end if;

  v_v2 := to_regprocedure(
    'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)'
  );
  v_v1 := to_regprocedure(
    'public.cmd_commit_seyeon_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)'
  );
  v_zero_fn := to_regprocedure('public.tr_seyeon_zero_source_pin_immutable_v1()');
  if v_v2 is null or v_v1 is null or v_zero_fn is null then
    raise exception 'Existing Production G2/1640 function chain is missing';
  end if;
  v_v2def := pg_get_functiondef(v_v2::oid);
  v_v1def := pg_get_functiondef(v_v1::oid);
  v_zerodef := pg_get_functiondef(v_zero_fn::oid);

  if position('cmd_commit_seyeon_chat_turn_runtime_v1' in v_v2def) = 0
    or position('cmd_commit_chat_turn_v1' in v_v1def) = 0
  then
    raise exception 'Production G2 v2→v1→core call chain changed: re-review required';
  end if;

  select t.oid into v_zero_trigger
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='chat_turn_attempts'
    and t.tgname='tr_seyeon_zero_source_pin_immutable_v1'
    and not t.tgisinternal and t.tgenabled in ('O','A');
  if v_zero_trigger is null
    or position('seyeon_commit_requires_original_zero_source_pin' in v_zerodef)=0
    or position('zeroProof,records' in v_zerodef)=0
  then
    raise exception 'Existing zero-only 1640 safety trigger no longer matches expected baseline';
  end if;

  -- The API executor still uses the established v2 path for zero-only Chat.
  -- Any future positive commit must close OTHER eligible routes too, and
  -- must never simply disable 1640 to make the new path pass.
  if not has_function_privilege('myeongha_api_executor',v_v2::oid,'EXECUTE')
    or has_function_privilege('public',v_v2::oid,'EXECUTE')
    or has_function_privilege('anon',v_v2::oid,'EXECUTE')
    or has_function_privilege('authenticated',v_v2::oid,'EXECUTE')
    or has_function_privilege('service_role',v_v2::oid,'EXECUTE') then
    raise exception 'Production G2 v2 EXECUTE scope changed: re-review required';
  end if;

  -- Existing legacy/core functions are inspected, never dynamically called:
  -- an API role may need their current zero-only behavior, but a future
  -- positive cutover MUST first close any direct legacy bypass.
  select coalesce(jsonb_agg(jsonb_build_object(
      'function',p.proname,
      'apiExecutorHasExecute',has_function_privilege(
        'myeongha_api_executor',p.oid,'EXECUTE')
    ) order by p.proname),'[]'::jsonb)
  into v_legacy_access
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'cmd_commit_chat_turn_v1',
      'cmd_commit_chat_turn_legacy_v1',
      'cmd_commit_seyeon_chat_turn_runtime_v1',
      'cmd_commit_seyeon_chat_turn_runtime_v2'
    );
  if jsonb_array_length(v_legacy_access)<>4 then
    raise exception 'Legacy/core Commit catalog set differs from reviewed baseline';
  end if;

  if not exists(
    select 1
    from seyeon_positive_candidate.source_sets_r1 s
    join public.chat_turn_attempts a on a.id=s.attempt_id
    where s.source_count>0
      and a.planner_version='seyeon-production-chat-planner-v1'
      and a.seyeon_personal_source_pin_jsonb is null
      and a.state='running'
  ) then
    raise exception 'Positive test Pin fixture not present for zero-only baseline proof';
  end if;

  -- The real Production attempt remains running, even though G1/G2 test
  -- sidecars are capable of synthetic stage/commit receipts. No leakage of
  -- experimental state into authoritative chat turn progression is allowed.
  if exists(
    select 1
    from seyeon_positive_candidate.attempt_source_pins p
    join public.chat_turn_attempts a on a.id=p.attempt_id
    where p.state='committed'
      and a.state in ('committed','delivered')
  ) then
    raise exception 'Synthetic commit leaked into real Production attempt';
  end if;

  raise notice 'G2 HOLDS: real v2 still calls v1/core; active 1640 still requires zero-only evidence. API/legacy privilege inventory: %',v_legacy_access;
  raise notice 'G2 gate NOT satisfied: forward-only positive XOR/atomic v2/outbox cutover and Owner sign-off remain required';
end $guard$;
commit;
\echo 'PASS: disposable catalog guard confirms existing v2/v1/core and 1640 zero-only safety; positive Production remains HOLD'
