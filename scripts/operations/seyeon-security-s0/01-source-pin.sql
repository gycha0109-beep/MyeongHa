-- Watchtower-Track: security
-- S3/G1: a real production-table positive Memory Pin on the EXISTING
-- immutable chat_turn_attempts.seyeon_personal_source_pin_jsonb column.
-- No new subject-linked tables: account deletion retains its existing graph.
-- SOURCE ONLY: no Production deployment, paid Provider, or public Reveal.
begin;

-- SRC-25 has NO approved production Memory type/schema/projector pair.
-- The table starts empty and no write/grant path is published in this PR.
create table public.seyeon_positive_source_type_registry_v1 (
  record_kind text not null check (record_kind='memory'),
  record_type text not null check (length(record_type) between 1 and 100),
  schema_version text not null check (length(schema_version) between 1 and 100),
  projector_version text not null check (length(projector_version) between 1 and 100),
  -- Independent gates. Approving private persistence must NEVER enable
  -- retrieval/AI inference. No rows or permissions are enabled by this DDL.
  enabled boolean not null default false,
  writable_enabled boolean not null default false,
  primary key(record_kind,record_type,schema_version,projector_version)
);
alter table public.seyeon_positive_source_type_registry_v1
  enable row level security;
revoke all on public.seyeon_positive_source_type_registry_v1
  from public,anon,authenticated,service_role;

-- NOLOGIN runtime owner uses RLS and the canonical Subject GUC for the
-- real original source. No INSERT/UPDATE/DELETE privileges are granted
-- on personal records to the API executor.
grant select (kind) on public.subjects
  to myeongha_seyeon_chat_runtime_owner;
grant select (id,subject_id,memory_type,schema_version,content_jsonb,
  source_kind,revoked_at)
  on public.memory_items to myeongha_seyeon_chat_runtime_owner;
grant select (id,subject_id,life_fact_id,memory_item_id,
  grantee_character_id,grant_reason,granted_at,revoked_at)
  on public.record_access_grants to myeongha_seyeon_chat_runtime_owner;
create policy seyeon_positive_pin_memory_subject_select_v1
on public.memory_items for select
to myeongha_seyeon_chat_runtime_owner
using (subject_id=public.current_myeongha_subject_id());
create policy seyeon_positive_pin_grant_subject_select_v1
on public.record_access_grants for select
to myeongha_seyeon_chat_runtime_owner
using (subject_id=public.current_myeongha_subject_id());

grant myeongha_seyeon_chat_runtime_owner to current_user;
alter table public.seyeon_positive_source_type_registry_v1
  owner to myeongha_seyeon_chat_runtime_owner;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;

create function public.cmd_mark_seyeon_positive_context_ready_pinned_v1(
  p_subject_id uuid, p_thread_id uuid, p_turn_id uuid,
  p_attempt_id uuid, p_record_id uuid, p_original_grant_id uuid,
  p_record_type text, p_schema_version text, p_projector_version text,
  p_selected_sources_digest text, p_projected_memory_digest text,
  p_final_model_context_digest text,
  p_expected_record_pg_digest text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog, public
as $g1$
declare
  v_memory record;
  v_pg_digest text;
  v_positive jsonb;
  v_replayed boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_turn_id is null or p_attempt_id is null
     or p_record_id is null or p_original_grant_id is null
     or p_record_type is null or p_schema_version is null
     or p_projector_version is null
     or p_selected_sources_digest is null
     or p_projected_memory_digest is null
     or p_final_model_context_digest is null
     or p_expected_record_pg_digest is null
     or p_expected_record_pg_digest !~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
     or p_selected_sources_digest !~ '^sha256:v1:[a-f0-9]{64}$'
     or p_projected_memory_digest !~ '^sha256:v1:[a-f0-9]{64}$'
     or p_final_model_context_digest !~ '^sha256:v1:[a-f0-9]{64}$'
  then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g1_input_invalid',
      message='Positive G1 requires exact original Memory and source identity';
  end if;

  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  -- No positive type is enabled in this migration. Missing authoritative
  -- Source contract ALWAYS denies BEFORE any private Record/Grant read.
  perform 1 from public.seyeon_positive_source_type_registry_v1
  where record_kind='memory'
    and record_type=p_record_type and schema_version=p_schema_version
    and projector_version=p_projector_version and enabled
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g1_unregistered_type',
      message='Positive Memory type and schema are not registered';
  end if;

  -- Same authoritative lock order as existing Subject-bound Chat:
  -- Subject -> Turn -> Attempt -> original Grant and Memory.

  perform 1 from public.chat_turns t
  where t.id=p_turn_id and t.thread_id=p_thread_id
    and t.subject_id=p_subject_id and t.state='planned'
  for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g1_turn_invalid',
      message='Positive source must be pinned before model execution';
  end if;
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(
    p_subject_id,p_thread_id
  );

  perform 1 from public.chat_turn_attempts a
  where a.id=p_attempt_id and a.turn_id=p_turn_id
    and a.subject_id=p_subject_id and a.state='running'
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pin_jsonb is null
  for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g1_attempt_invalid',
      message='Original running Attempt must not already have a Pin';
  end if;

  -- Original Grant ID, not a replacement for the same Record.
  perform seyeon_private.lock_original_memory_grant_v1(
    p_subject_id,p_record_id,p_original_grant_id
  );
  select m.memory_type,m.schema_version,m.content_jsonb,g.granted_at
    into v_memory
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=p_original_grant_id and g.subject_id=p_subject_id
    and g.memory_item_id=p_record_id and g.life_fact_id is null
    and g.grantee_character_id='seyeon' and g.grant_reason='user_choice'
    and g.revoked_at is null and m.revoked_at is null
    and m.source_kind='user_approved'
    and m.memory_type=p_record_type and m.schema_version=p_schema_version
  ;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g1_original_grant_invalid',
      message='Original Memory and active Grant must agree';
  end if;
  v_pg_digest:='sha256:pg-jsonb:v1:'||
    encode(sha256(convert_to(v_memory.content_jsonb::text,'UTF8')),'hex');
  if v_pg_digest is distinct from p_expected_record_pg_digest then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g1_original_payload_changed',
      message='Original Memory payload differs from model-context source read';
  end if;

  -- The only durable positive evidence is on the EXISTING attempt.
  -- The original 1640 immutable trigger protects this source material.
  v_positive:=jsonb_build_object(
    'schemaVersion','seyeon-positive-original-memory-source-pin-v1',
    'subjectId',p_subject_id::text,
    'threadId',p_thread_id::text,
    'turnId',p_turn_id::text,
    'attemptId',p_attempt_id::text,
    'characterId','seyeon',
    'recordKind','memory',
    'recordId',p_record_id::text,
    'originalGrantId',p_original_grant_id::text,
    'originalGrantedAt',v_memory.granted_at,
    'recordType',p_record_type,
    'recordSchemaVersion',p_schema_version,
    'projectorVersion',p_projector_version,
    'selectedSourcesDigest',p_selected_sources_digest,
    'projectedMemoryDigest',p_projected_memory_digest,
    'originalPgJsonbDigest',v_pg_digest,
    'finalModelContextDigest',p_final_model_context_digest
  );
  update public.chat_turn_attempts
  set seyeon_personal_source_pin_jsonb=jsonb_build_object(
      'positiveProof',v_positive
    ),
    seyeon_personal_source_pinned_at=clock_timestamp()
  where id=p_attempt_id and turn_id=p_turn_id
    and subject_id=p_subject_id and state='running';

  -- The G1 Pin and context_ready transition succeed/fail together.
  v_replayed:=public.cmd_mark_chat_turn_context_ready_v1(
    p_subject_id,p_turn_id,p_attempt_id
  );
  if v_replayed then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g1_unexpected_replay',
      message='Positive G1 cannot adopt an earlier context_ready transition';
  end if;
  return v_positive;
end
$g1$;

alter function public.cmd_mark_seyeon_positive_context_ready_pinned_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text
) owner to myeongha_seyeon_chat_runtime_owner;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
revoke all on function public.cmd_mark_seyeon_positive_context_ready_pinned_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text
) from public,anon,authenticated,service_role;

-- Intentionally NO GRANT EXECUTE TO myeongha_api_executor and no type
-- registration, positive Projector, model call or HTTP Reveal.
commit;
