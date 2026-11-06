-- PR-04D3B2B-3B1: actual PostgreSQL least-privilege role regression.
-- DB principal is NOLOGIN; this simulates role execution under test-admin
-- SET LOCAL ROLE. Real separate LOGIN credential isolation remains 3B2 HOLD.
begin;

do $acl$
declare
  v_role pg_catalog.pg_roles%rowtype;
  v_rpc record;
  v_can boolean;
begin
  select * into strict v_role from pg_catalog.pg_roles
  where rolname='myeongha_seyeon_governed_executor';
  if v_role.rolcanlogin or v_role.rolsuper or v_role.rolbypassrls
    or v_role.rolinherit or v_role.rolcreatedb or v_role.rolcreaterole
    or v_role.rolreplication then
    raise exception 'Governed executor has unsafe PostgreSQL role flags';
  end if;
  if pg_catalog.pg_has_role('myeongha_seyeon_governed_executor',
      'myeongha_api_executor','MEMBER')
    or pg_catalog.pg_has_role('myeongha_seyeon_governed_executor',
      'myeongha_seyeon_cost_meter_owner','MEMBER')
    or pg_catalog.pg_has_role('myeongha_api_executor',
      'myeongha_seyeon_governed_executor','MEMBER') then
    raise exception 'Governed executor crossed forbidden role boundary';
  end if;
  if exists (
    select 1 from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles member_role on member_role.oid=m.member
    where member_role.rolname='myeongha_seyeon_governed_executor'
  ) then
    raise exception 'Governed executor has an unexpected role membership';
  end if;

  for v_rpc in
    select * from (values
      ('public.current_myeongha_subject_id()',true),
      ('public.assert_myeongha_subject_context_v1(uuid)',true),
      ('public.begin_member_subject_context_v1(uuid)',true),
      ('public.begin_guest_subject_context_v1(text)',false),
      ('public.begin_seyeon_governed_guest_subject_context_v1(text)',true),
      ('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)',true),
      ('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)',true),
      ('public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)',true),
      ('public.cmd_claim_seyeon_provider_receipt_v1()',false),
      ('public.cmd_ack_seyeon_provider_receipt_v1(uuid,uuid)',false),
      ('public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)',false),
      ('public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)',false),
      ('public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)',false),
      ('public.seyeon_ai_start_internal_v1(uuid,uuid,uuid,text,uuid,text,text,text)',false),
      ('public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb)',false),
      ('public.qry_seyeon_ai_turn_cost_v1(uuid,uuid)',false)
    ) as privs(signature,allowed)
  loop
    v_can:=pg_catalog.has_function_privilege(
      'myeongha_seyeon_governed_executor',
      v_rpc.signature::pg_catalog.regprocedure,'EXECUTE'
    );
    if v_can is distinct from v_rpc.allowed then
      raise exception 'Governed executor function ACL mismatch %: expected %, got %',
        v_rpc.signature,v_rpc.allowed,v_can;
    end if;
  end loop;
  if not pg_catalog.has_schema_privilege(
      'myeongha_seyeon_governed_executor','public','USAGE')
    or pg_catalog.has_schema_privilege(
      'myeongha_seyeon_governed_executor','public','CREATE') then
    raise exception 'Governed executor has unsafe public schema privileges';
  end if;
  if pg_catalog.has_table_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_call_cost_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_table_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_daily_budgets_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_table_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_model_policies_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_table_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_provider_receipt_queue_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_call_cost_events','SELECT')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_call_cost_events','INSERT')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_call_cost_events','UPDATE')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_call_cost_events','REFERENCES')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_daily_budgets_v1','SELECT')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_daily_budgets_v1','INSERT')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_daily_budgets_v1','UPDATE')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_daily_budgets_v1','REFERENCES')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_model_policies_v1','SELECT')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_model_policies_v1','INSERT')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_model_policies_v1','UPDATE')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_governor_model_policies_v1','REFERENCES')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_provider_receipt_queue_v1','SELECT')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_provider_receipt_queue_v1','INSERT')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_provider_receipt_queue_v1','UPDATE')
    or pg_catalog.has_any_column_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_provider_receipt_queue_v1','REFERENCES') then
    raise exception 'Governed executor has unauthorized direct cost/policy/receipt table access';
  end if;
end $acl$;

-- W121: the runtime checkout must detect ACL drift on the effective executor,
-- not merely on the LOGIN. Every injected grant is rolled back in this fixture.
savepoint w121_schema_create;
grant create on schema public to myeongha_seyeon_governed_executor;
do $w121_schema$
begin
  if not pg_catalog.has_schema_privilege(
      'myeongha_seyeon_governed_executor','public','CREATE') then
    raise exception 'W121 schema CREATE grant was not visible to governed executor';
  end if;
end
$w121_schema$;
rollback to savepoint w121_schema_create;
release savepoint w121_schema_create;

savepoint w121_receipt_table;
grant select on public.seyeon_ai_provider_receipt_queue_v1
  to myeongha_seyeon_governed_executor;
do $w121_table$
begin
  if not pg_catalog.has_table_privilege(
      'myeongha_seyeon_governed_executor',
      'public.seyeon_ai_provider_receipt_queue_v1','SELECT') then
    raise exception 'W121 receipt table grant was not visible to governed executor';
  end if;
end
$w121_table$;
rollback to savepoint w121_receipt_table;
release savepoint w121_receipt_table;

savepoint w121_receipt_column;
grant select (call_id) on public.seyeon_ai_provider_receipt_queue_v1
  to myeongha_seyeon_governed_executor;
do $w121_columns$
begin
  if not pg_catalog.has_any_column_privilege(
      'myeongha_seyeon_governed_executor',
      'public.seyeon_ai_provider_receipt_queue_v1','SELECT') then
    raise exception 'W121 column-level receipt grant was not visible';
  end if;
end
$w121_columns$;
rollback to savepoint w121_receipt_column;
release savepoint w121_receipt_column;

savepoint w121_legacy_rpc;
grant execute on function public.cmd_start_seyeon_ai_call_v1(
  uuid,uuid,uuid,text,uuid,text,text,text) to myeongha_seyeon_governed_executor;
do $w121_rpc$
begin
  if not pg_catalog.has_function_privilege(
      'myeongha_seyeon_governed_executor',
      'public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)','EXECUTE') then
    raise exception 'W121 legacy RPC grant was not visible to governed executor';
  end if;
end
$w121_rpc$;
rollback to savepoint w121_legacy_rpc;
release savepoint w121_legacy_rpc;

savepoint w121_role_membership;
grant myeongha_api_executor to myeongha_seyeon_governed_executor
  with inherit false, set true;
do $w121_membership$
begin
  if not pg_catalog.pg_has_role('myeongha_seyeon_governed_executor',
      'myeongha_api_executor','MEMBER')
    or not pg_catalog.pg_has_role('myeongha_seyeon_governed_executor',
      'myeongha_api_executor','SET') then
    raise exception 'W121 private-role membership grant was not visible';
  end if;
end
$w121_membership$;
rollback to savepoint w121_role_membership;
release savepoint w121_role_membership;

-- Operator-only test policies. Production policies are neither
-- activated; all DML is rolled back.
insert into public.seyeon_ai_governor_model_policies_v1(
 provider_key,model_key,policy_version,price_version,allowed_purposes,
 context_window_tokens,maximum_input_tokens,maximum_output_tokens,
 maximum_serialized_request_bytes,input_micro_usd_per_million,
 cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active
) values (
 'openai-responses','governed-role-offline-model',
 'governed-role-policy-v1','governed-role-rate-v1',
 array['event_extraction']::text[],
 2000,1200,800,20000,1000000,250000,4000000,true
);
insert into public.seyeon_ai_governor_daily_budgets_v1(
 bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd
) values ((clock_timestamp() at time zone 'UTC')::date,10000,8000);

set local role myeongha_seyeon_governed_executor;
set local myeongha.subject_id = 'a0000000-0000-0000-0000-000000000001';

do $execution$
declare
  v_subject uuid:='a0000000-0000-0000-0000-000000000001';
  v_turn uuid:='a4000000-0000-0000-0000-000000000006';
  v_attempt uuid:='a6000000-0000-0000-0000-000000000006';
  v_call uuid:='b0600000-0000-4000-8000-000000000001';
  v_reply record;
  v_event jsonb;
  v_denied boolean;
begin
  if current_user is distinct from 'myeongha_seyeon_governed_executor' then
    raise exception 'Governed executor role context was not activated';
  end if;
  -- Check real PostgreSQL EXECUTE denial, not just pg_proc metadata.
  v_denied:=false;
  begin
    perform * from public.cmd_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_call,
      'event_extraction','openai-responses','governed-role-offline-model'
    );
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Governed role could invoke legacy Start'; end if;

  v_denied:=false;
  begin
    perform * from public.cmd_record_seyeon_ai_call_cost_v1(
      v_subject,v_turn,v_attempt,'post_turn','{}'::jsonb
    );
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Governed role could invoke legacy Record'; end if;

  v_denied:=false;
  begin
    perform * from public.cmd_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn','{}'::jsonb
    );
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Governed role could invoke legacy Settle'; end if;

  v_denied:=false;
  begin
    perform count(*) from public.seyeon_ai_call_cost_events;
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Governed role could read the raw ledger'; end if;

  select * into strict v_reply from public.cmd_governed_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_call,
    'event_extraction','openai-responses','governed-role-offline-model',
    'governed-role-policy-v1','governed-role-rate-v1',500,800,2500
  );
  if v_reply.call_id is distinct from v_call
    or v_reply.ceiling_micro_usd<>3700 then
    raise exception 'Governed role failed to reserve bounded call';
  end if;
  v_event:=pg_catalog.jsonb_build_object(
    'schemaVersion','seyeon-ai-cost-v1','callId',v_call::text,
    'purpose','event_extraction','providerKey','openai-responses',
    'modelKey','governed-role-offline-model',
    'outcome','response_received','httpStatus',200,'elapsedMs',8,
    'inputTokens',100,'cachedInputTokens',0,'outputTokens',50,
    'reasoningTokens',0,'priceVersion','governed-role-rate-v1',
    'estimatedCostMicroUsd',300,'costStatus','estimated',
    'invoiceReconciled',false
  );
  select * into strict v_reply from public.cmd_governed_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_event
  );
  if v_reply.replayed or v_reply.occupied_micro_usd<>300
    or v_reply.over_ceiling then
    raise exception 'Governed role failed atomic settlement';
  end if;
  select * into strict v_reply from public.cmd_governed_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_event
  );
  if not v_reply.replayed or v_reply.occupied_micro_usd<>300 then
    raise exception 'Governed role replay double-counted cost';
  end if;
end $execution$;

reset role;
do $audit$
declare v_used bigint; v_actual bigint;
begin
  select occupied_micro_usd into strict v_used
  from public.seyeon_ai_governor_daily_budgets_v1
  where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date;
  select governor_effective_micro_usd into strict v_actual
  from public.seyeon_ai_call_cost_events
  where call_id='b0600000-0000-4000-8000-000000000001';
  if v_used<>300 or v_actual<>300 then
    raise exception 'Governed-only role mutated cost accounting: %, %',v_used,v_actual;
  end if;
end $audit$;
rollback;

select 'D3B2B-3B1 dormant governed DB role: PASS (LOGIN credential HOLD)' as status;
