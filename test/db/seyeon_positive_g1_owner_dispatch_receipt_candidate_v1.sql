-- Watchtower-Track: character-memory
-- G1 Owner-RPC-style source-to-wire receipt, DISPOSABLE DB ONLY.
-- Not a Production migration, not SRC-25 approval, and not provider authority.
\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer < 150000 then
    raise exception 'refusing non-disposable G1 dispatch DB';
  end if;
end $guard$;

-- The only durable test evidence is a no-content metadata receipt.
-- Bytes are hashed by the DB during the same call; no prompts/Memory plaintext
-- are written to these rows, SQL errors, telemetry, or application logs.
create table seyeon_positive_candidate.provider_stage_receipts_r2 (
  attempt_id uuid not null references public.chat_turn_attempts(id),
  purpose text not null check (purpose in (
    'integrity_classification','disclosure_classification',
    'turn_interpretation','dialogue_render','semantic_review'
  )),
  call_id uuid not null,
  selected_sources_digest text not null
    check (selected_sources_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  native_request_digest text not null
    check (native_request_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  raw_wire_digest text not null
    check (raw_wire_digest ~ '^sha256:utf8:v1:[a-f0-9]{64}$'),
  wire_byte_length integer not null check (wire_byte_length between 1 and 1000000),
  original_record_id uuid not null references public.memory_items(id),
  original_grant_id uuid not null references public.record_access_grants(id),
  pg_payload_digest text not null
    check (pg_payload_digest ~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'),
  admitted_at timestamptz not null default clock_timestamp(),
  primary key (attempt_id,purpose),
  unique (call_id)
);

create trigger immutable_provider_stage_receipt_r2
before update or delete on seyeon_positive_candidate.provider_stage_receipts_r2
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

-- The Provider adapter supplies the finalized body at its existing awaited
-- meteredBeforeDispatch boundary. This RPC computes byte digest INSIDE the
-- database after current Grant/Memory recheck and before simulated fetch.
-- The caller-supplied Native digest is a correlation value, never DB authority.
create function seyeon_positive_candidate.claim_owner_dispatch_r2(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_purpose text,p_call_id uuid,p_native_digest text,p_serialized_body text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $claim$
declare
  v_attempt record;
  v_set seyeon_positive_candidate.source_sets_r1%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_current record;
  v_body jsonb;
  v_len integer;
  v_digest text;
  v_name text;
  v_receipt jsonb;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_subject is null or p_thread is null or p_turn is null
    or p_attempt is null or p_call_id is null
    or p_purpose not in ('integrity_classification','disclosure_classification',
                        'turn_interpretation','dialogue_render','semantic_review')
    or p_native_digest is null
    or p_native_digest !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_serialized_body is null
    or octet_length(p_serialized_body) not between 1 and 1000000 then
    return null;
  end if;

  -- Subject first: revoke commands lock Subject before the Grant. A running
  -- claim holds this lock until its own transaction COMMIT; do not invert it.
  perform 1 from public.subjects s
  where s.id=p_subject and s.status='active'
    and s.merged_into_subject_id is null
  for share;
  if not found then return null; end if;

  select a.id,a.state as attempt_state,a.planner_version,
         a.seyeon_personal_source_pin_jsonb as zero_pin,
         t.state as turn_state
  into v_attempt
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.turn_id=t.id and a.subject_id=t.subject_id
  join public.conversation_threads th
    on th.id=t.thread_id and th.subject_id=t.subject_id
  where a.id=p_attempt and a.subject_id=p_subject and t.id=p_turn
    and t.thread_id=p_thread and th.status='active'
  for share of t,th
  for update of a;
  if not found or v_attempt.attempt_state is distinct from 'running'
    or v_attempt.turn_state is distinct from 'planned'
    or v_attempt.planner_version is distinct from 'seyeon-production-chat-planner-v1'
    or v_attempt.zero_pin is not null then return null; end if;

  select * into v_set
  from seyeon_positive_candidate.source_sets_r1 s
  where s.attempt_id=p_attempt and s.subject_id=p_subject
    and s.thread_id=p_thread and s.turn_id=p_turn
    and s.source_count=1 and s.schema_version='offline-source-set-parent-edge-v1'
  for share;
  if not found then return null; end if;
  if (select count(*) from seyeon_positive_candidate.source_edges_r1
      where attempt_id=p_attempt) <> 1 then return null; end if;

  select * into v_edge
  from seyeon_positive_candidate.source_edges_r1 e
  where e.attempt_id=p_attempt and e.ordinal=0
    and e.record_kind='memory' and e.record_type='shared_detail'
    and e.schema_version='memory-v1'
  for share;
  if not found then return null; end if;

  select m.memory_type,m.schema_version,m.content_jsonb,g.granted_at
  into v_current
  from public.record_access_grants g
  join public.memory_items m on m.id=g.memory_item_id
    and m.subject_id=g.subject_id
  where g.id=v_edge.original_grant_id
    and g.subject_id=p_subject and g.memory_item_id=v_edge.memory_id
    and g.grantee_character_id='seyeon'
    and g.revoked_at is null and m.revoked_at is null
    and m.source_kind='user_approved'
  for share of g,m;
  if not found or v_current.memory_type is distinct from v_edge.record_type
    or v_current.schema_version is distinct from v_edge.schema_version
    or v_current.granted_at is distinct from v_edge.original_granted_at
    or v_edge.pg_payload_digest is distinct from
      'sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex')
  then return null; end if;

  -- Enforce exactly once and native stage order. The two initial classifiers
  -- commute; no Interpreter/Renderer/Reviewer can bypass a missing predecessor.
  if exists(select 1 from seyeon_positive_candidate.provider_stage_receipts_r2
            where attempt_id=p_attempt and purpose=p_purpose) then return null; end if;
  if p_purpose='turn_interpretation' and
      (select count(*) from seyeon_positive_candidate.provider_stage_receipts_r2
       where attempt_id=p_attempt and purpose in (
         'integrity_classification','disclosure_classification')) <> 2
  then return null; end if;
  if p_purpose='dialogue_render' and
      not exists(select 1 from seyeon_positive_candidate.provider_stage_receipts_r2
                 where attempt_id=p_attempt and purpose='turn_interpretation')
  then return null; end if;
  if p_purpose='semantic_review' and
      not exists(select 1 from seyeon_positive_candidate.provider_stage_receipts_r2
                 where attempt_id=p_attempt and purpose='dialogue_render')
  then return null; end if;

  begin
    v_body := p_serialized_body::jsonb;
  exception when others then
    return null;
  end;
  v_name := 'myeongha_'||p_purpose||'_v2';
  if jsonb_typeof(v_body) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(v_body)) <> 5
    or not (v_body ?& array['model','store','instructions','input','text'])
    or v_body ->> 'model' is distinct from 'offline-model'
    or v_body -> 'store' is distinct from 'false'::jsonb
    or jsonb_typeof(v_body -> 'instructions') is distinct from 'string'
    or jsonb_typeof(v_body -> 'input') is distinct from 'array'
    or jsonb_array_length(v_body -> 'input') <> 1
    or v_body #>> '{input,0,role}' is distinct from 'user'
    or v_body #>> '{input,0,content,0,type}' is distinct from 'input_text'
    or jsonb_typeof(v_body #> '{input,0,content,0,text}') is distinct from 'string'
    or v_body #>> '{text,format,type}' is distinct from 'json_schema'
    or v_body #>> '{text,format,name}' is distinct from v_name
    or v_body #> '{text,format,strict}' is distinct from 'true'::jsonb
  then return null; end if;
  v_len := octet_length(p_serialized_body);
  v_digest := 'sha256:utf8:v1:'||
    encode(sha256(convert_to(p_serialized_body,'UTF8')),'hex');

  insert into seyeon_positive_candidate.provider_stage_receipts_r2(
    attempt_id,purpose,call_id,selected_sources_digest,
    native_request_digest,raw_wire_digest,wire_byte_length,
    original_record_id,original_grant_id,pg_payload_digest
  ) values (
    p_attempt,p_purpose,p_call_id,v_set.selected_sources_digest,
    p_native_digest,v_digest,v_len,
    v_edge.memory_id,v_edge.original_grant_id,v_edge.pg_payload_digest
  );
  v_receipt := jsonb_build_object(
    'attemptId',p_attempt,'purpose',p_purpose,'callId',p_call_id,
    'selectedSourcesDigest',v_set.selected_sources_digest,
    'wireDigest',v_digest,'wireByteLength',v_len,
    'originalRecordId',v_edge.memory_id,
    'originalGrantId',v_edge.original_grant_id,
    'pgPayloadDigest',v_edge.pg_payload_digest
  );
  return v_receipt;
end $claim$;

revoke all on seyeon_positive_candidate.provider_stage_receipts_r2
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function seyeon_positive_candidate.claim_owner_dispatch_r2(
  uuid,uuid,uuid,uuid,text,uuid,text,text
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.claim_owner_dispatch_r2(
  uuid,uuid,uuid,uuid,text,uuid,text,text
) to myeongha_api_executor;

do $acl$
begin
  if has_table_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.provider_stage_receipts_r2','SELECT')
    or has_table_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.provider_stage_receipts_r2','INSERT')
    or has_function_privilege('public',
      'seyeon_positive_candidate.claim_owner_dispatch_r2(uuid,uuid,uuid,uuid,text,uuid,text,text)',
      'EXECUTE')
  then raise exception 'G1 offline stage authority ACL leaks'; end if;
end $acl$;
commit;
\echo 'PASS: disposable G1 Owner-style exact original Grant + UTF-8 stage receipt RPC installed (no Production rights)'
