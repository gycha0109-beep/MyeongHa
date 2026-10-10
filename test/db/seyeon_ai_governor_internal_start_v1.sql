-- D3B2B-2: isolate trusted governed admission from public legacy Start.
-- Offline: uses committed post-turn fixture; all mutations ROLLBACK.
begin;

-- A direct user-mode call must not reach the raw lifecycle INSERT.
do $acl$
declare
  v_owner oid;
  v_governed text;
  v_legacy text;
  v_procid oid := 'public.seyeon_ai_start_internal_v1(uuid,uuid,uuid,text,uuid,text,text,text)'::regprocedure::oid;
begin
  select p.proowner into strict v_owner
  from pg_catalog.pg_proc p where p.oid=v_procid;
  if v_owner is distinct from 'myeongha_seyeon_cost_meter_owner'::regrole::oid then
    raise exception 'Internal Start owner is not the NOLOGIN cost authority';
  end if;
  if not exists(
    select 1 from pg_catalog.pg_proc p
    where p.oid=v_procid and p.prosecdef
  ) then
    raise exception 'Internal Start lost SECURITY DEFINER';
  end if;
  if pg_catalog.has_function_privilege(
    'myeongha_api_executor',v_procid,'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',v_procid,'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',v_procid,'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',v_procid,'EXECUTE'
  ) then
    raise exception 'API/browser principal gained private Start privilege';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)'::regprocedure
  ) into strict v_governed;
  select pg_catalog.pg_get_functiondef(
    'public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)'::regprocedure
  ) into strict v_legacy;
  if pg_catalog.strpos(v_governed,'from public.seyeon_ai_start_internal_v1(')=0
     or pg_catalog.strpos(v_governed,'from public.cmd_start_seyeon_ai_call_v1(')<>0
     or pg_catalog.strpos(v_legacy,'from public.seyeon_ai_start_internal_v1(')=0 then
    raise exception 'Governed/legacy Start still depends on unsafe RPC dispatch';
  end if;
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)',
    'EXECUTE'
  ) then
    raise exception 'OFF/ENFORCE public RPC entry grant unexpectedly removed';
  end if;
end
$acl$;

insert into public.seyeon_ai_governor_model_policies_v1(
  provider_key,model_key,policy_version,price_version,allowed_purposes,
  context_window_tokens,maximum_input_tokens,maximum_output_tokens,
  maximum_serialized_request_bytes,input_micro_usd_per_million,
  cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active
) values (
  'openai-responses','offline-private-start-model','offline-private-start-policy-v1',
  'offline-private-start-rate-v1',array['event_extraction']::text[],
  2000,1200,800,20000,1000000,250000,4000000,true
);
insert into public.seyeon_ai_governor_daily_budgets_v1(
  bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd
) values ((clock_timestamp() at time zone 'UTC')::date,10000,4200);

set local role myeongha_api_executor;
set local myeongha.subject_id = 'a0000000-0000-0000-0000-000000000001';
do $test$
declare
  v_subject uuid:='a0000000-0000-0000-0000-000000000001';
  v_turn uuid:='a4000000-0000-0000-0000-000000000006';
  v_attempt uuid:='a6000000-0000-0000-0000-000000000006';
  v_legacy uuid:='b0500000-0000-4000-8000-000000000001';
  v_governed uuid:='b0500000-0000-4000-8000-000000000002';
  v_bad uuid:='b0500000-0000-4000-8000-000000000003';
  v_denied boolean;
  v_rcpt record;
  v_summary record;
begin
  -- The same principal that uses public Start cannot invoke its private core.
  v_denied:=false;
  begin
    perform * from public.seyeon_ai_start_internal_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_bad,
      'event_extraction','openai-responses','offline-private-start-model'
    );
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then
    raise exception 'API executor invoked private Start';
  end if;

  -- OFF compatibility: pre-existing public lifecycle still admits ordinary
  -- post-turn calls, including even when an unrelated Governor policy exists.
  select * into strict v_rcpt from public.cmd_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_legacy,
    'event_extraction','openai-responses','offline-private-start-model'
  );
  if v_rcpt.call_id is distinct from v_legacy then
    raise exception 'Legacy OFF Start receipt drift';
  end if;

  -- Atomic Governor admission must still reserve exactly the quoted limit.
  select * into strict v_rcpt from public.cmd_governed_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_governed,
    'event_extraction','openai-responses','offline-private-start-model',
    'offline-private-start-policy-v1','offline-private-start-rate-v1',
    500,800,2500
  );
  if v_rcpt.call_id is distinct from v_governed
    or v_rcpt.ceiling_micro_usd<>3700 then
    raise exception 'Governed Start did not reserve approved worst-case cost';
  end if;

  -- A duplicate call ID must never re-authorize a second paid request.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_governed,
      'event_extraction','openai-responses','offline-private-start-model',
      'offline-private-start-policy-v1','offline-private-start-rate-v1',
      500,800,2500
    );
  exception when unique_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Governed Start duplicate replay accepted'; end if;

  v_denied:=false;
  begin
    perform * from public.cmd_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_legacy,
      'event_extraction','openai-responses','offline-private-start-model'
    );
  exception when unique_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Legacy Start duplicate replay accepted'; end if;

  -- Both paths retain the same canonical Subject/Attempt authority.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      'a0000000-0000-0000-0000-000000000099',
      v_turn,v_attempt,'post_turn',v_bad,
      'event_extraction','openai-responses','offline-private-start-model',
      'offline-private-start-policy-v1','offline-private-start-rate-v1',
      500,800,2500
    );
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Foreign Subject governed Start permitted'; end if;

  select * into strict v_summary
  from public.qry_seyeon_ai_turn_cost_v1(v_subject,v_turn);
  if v_summary.call_count<>2 or v_summary.unknown_cost_calls<>2
    or v_summary.total_estimated_cost_micro_usd is not null then
    raise exception 'Non-governed/Governed Start cost ledger drift';
  end if;
end
$test$;
reset role;

do $verify$
declare v_count bigint; v_held bigint; v_ceiling bigint;
begin
  select occupied_micro_usd into strict v_held
  from public.seyeon_ai_governor_daily_budgets_v1
  where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date;
  select count(*) into v_count
  from public.seyeon_ai_call_cost_events
  where call_id in (
    'b0500000-0000-4000-8000-000000000001',
    'b0500000-0000-4000-8000-000000000002'
  );
  select governor_ceiling_micro_usd into strict v_ceiling
  from public.seyeon_ai_call_cost_events
  where call_id='b0500000-0000-4000-8000-000000000002';
  if v_count<>2 or v_held<>3700 or v_ceiling<>3700 then
    raise exception 'Separated Start paths mutated budget or cost ledger: %/%/%',
      v_count,v_held,v_ceiling;
  end if;
  if exists(
    select 1 from public.seyeon_ai_call_cost_events
    where call_id='b0500000-0000-4000-8000-000000000001'
      and governor_bucket_utc_date is not null
  ) then
    raise exception 'Legacy OFF Start was incorrectly stamped as governed';
  end if;
end
$verify$;
rollback;
select 'Seyeon D3B2B-2 private Start authority PASS' as status;
