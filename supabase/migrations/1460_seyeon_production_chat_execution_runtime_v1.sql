-- MyeongHa Se-yeon Production Chat Execution Core V1 runtime authority.
-- Watchtower-Track: character-memory
--
-- Internal dark runtime only. This migration does not expose a browser Chat send
-- endpoint and does not resolve SRC-15 client/content compatibility semantics.
-- The ordinary API executor receives EXECUTE only on narrow SECURITY DEFINER
-- wrappers. It receives no direct Chat DML from this migration.
--
-- Existing chat state-machine commands remain calculation/persistence authority:
-- receive -> attempt -> context_ready -> generated -> validated -> commit.
-- Legacy caller-provided relationship/world/memory commit side effects remain NULL.

DO $$
DECLARE
  v_owner_oid oid;
  v_server_version_num integer := current_setting('server_version_num')::integer;
  v_membership_count integer;
  v_expected_admin_count integer;
  v_current_user_superuser boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_seyeon_chat_runtime_owner'
  ) THEN
    CREATE ROLE myeongha_seyeon_chat_runtime_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;

  SELECT r.oid
  INTO v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_seyeon_chat_runtime_owner'
    AND NOT r.rolcanlogin
    AND NOT r.rolsuper
    AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole
    AND NOT r.rolinherit
    AND NOT r.rolreplication
    AND NOT r.rolbypassrls;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'myeongha_seyeon_chat_runtime_owner is outside the least-privilege role contract';
  END IF;

  SELECT r.rolsuper
  INTO STRICT v_current_user_superuser
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = CURRENT_USER;

  SELECT count(*)
  INTO v_membership_count
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid = v_owner_oid;

  IF v_server_version_num >= 160000 THEN
    IF v_current_user_superuser THEN
      IF v_membership_count <> 0 THEN
        RAISE EXCEPTION 'myeongha_seyeon_chat_runtime_owner has unexpected PostgreSQL 16+ superuser membership';
      END IF;
    ELSE
      SELECT count(*)
      INTO v_expected_admin_count
      FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles member_role
        ON member_role.oid = m.member
      JOIN pg_catalog.pg_roles grantor_role
        ON grantor_role.oid = m.grantor
      WHERE m.roleid = v_owner_oid
        AND member_role.rolname = CURRENT_USER
        AND m.admin_option
        AND NOT m.inherit_option
        AND NOT m.set_option
        AND grantor_role.rolsuper;

      IF v_membership_count <> 1 OR v_expected_admin_count <> 1 THEN
        RAISE EXCEPTION 'myeongha_seyeon_chat_runtime_owner has unexpected PostgreSQL 16+ creator membership';
      END IF;
    END IF;
  ELSIF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_seyeon_chat_runtime_owner has unexpected pre-PostgreSQL-16 membership';
  END IF;
END
$$;

grant usage on schema public to myeongha_seyeon_chat_runtime_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_seyeon_chat_runtime_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_seyeon_chat_runtime_owner;

-- Core chat commands remain unchanged and execute as the narrow runtime owner.
grant execute on function public.cmd_receive_chat_turn_v1(
  uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,jsonb,text
) to myeongha_seyeon_chat_runtime_owner;
grant execute on function public.cmd_allocate_chat_turn_attempt_v1(
  uuid,uuid,uuid,text
) to myeongha_seyeon_chat_runtime_owner;
grant execute on function public.cmd_mark_chat_turn_context_ready_v1(
  uuid,uuid,uuid
) to myeongha_seyeon_chat_runtime_owner;
grant execute on function public.cmd_mark_chat_turn_failed_v1(
  uuid,uuid,uuid,text,text
) to myeongha_seyeon_chat_runtime_owner;
grant execute on function public.cmd_mark_chat_turn_generated_v1(
  uuid,uuid,uuid,uuid,text,uuid,text,jsonb,text,text,jsonb
) to myeongha_seyeon_chat_runtime_owner;
grant execute on function public.cmd_validate_chat_turn_attempt_v1(
  uuid,uuid,uuid,uuid,text,jsonb,boolean,text
) to myeongha_seyeon_chat_runtime_owner;
grant execute on function public.cmd_commit_chat_turn_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb
) to myeongha_seyeon_chat_runtime_owner;
grant execute on function public.cmd_commit_chat_turn_legacy_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb
) to myeongha_seyeon_chat_runtime_owner;

-- The owner is not reachable by the runtime login role. These relation privileges
-- exist solely so the SECURITY INVOKER core commands can execute inside wrappers.
grant select, insert, update on public.conversation_threads
  to myeongha_seyeon_chat_runtime_owner;
grant select on public.conversation_thread_characters
  to myeongha_seyeon_chat_runtime_owner;
grant select, insert on public.conversation_messages
  to myeongha_seyeon_chat_runtime_owner;
grant select, insert, update on public.chat_turns
  to myeongha_seyeon_chat_runtime_owner;
grant select, insert, update on public.chat_turn_attempts
  to myeongha_seyeon_chat_runtime_owner;
grant select, insert on public.ai_execution_logs
  to myeongha_seyeon_chat_runtime_owner;
grant select on public.ai_execution_groundings
  to myeongha_seyeon_chat_runtime_owner;
grant insert on public.outbox_events
  to myeongha_seyeon_chat_runtime_owner;

-- Existing capability/ownership triggers read the canonical Subject while the
-- SECURITY INVOKER Chat core commands persist turn/message rows.
grant select (id, status, merged_into_subject_id)
on public.subjects
to myeongha_seyeon_chat_runtime_owner;

-- conversation_threads/messages/participants already have RLS enabled by the
-- Production Chat read authority. Add only this owner-specific Subject slice.
drop policy if exists subjects_seyeon_chat_runtime_select_v1
  on public.subjects;
create policy subjects_seyeon_chat_runtime_select_v1
on public.subjects
for select
to myeongha_seyeon_chat_runtime_owner
using (id = public.current_myeongha_subject_id());

drop policy if exists outbox_events_seyeon_chat_runtime_insert_v1
  on public.outbox_events;
create policy outbox_events_seyeon_chat_runtime_insert_v1
on public.outbox_events
for insert
to myeongha_seyeon_chat_runtime_owner
with check (
  aggregate_type = 'chat_turn'
  and event_type = 'CHAT_TURN_COMMITTED'
  and event_schema_version = 'v1'
  and dedupe_key = 'turn-commit-v1'
  and status = 'pending'
  and attempt_count = 0
  and payload_jsonb ->> 'turnId' = aggregate_id
  and coalesce((payload_jsonb ->> 'relationshipEffect')::boolean, true) = false
  and coalesce((payload_jsonb ->> 'worldEffect')::boolean, true) = false
  and coalesce((payload_jsonb ->> 'memoryAccepted')::boolean, true) = false
  and exists (
    select 1
    from public.chat_turns ct
    join public.chat_turn_attempts a
      on a.turn_id = ct.id
     and a.subject_id = ct.subject_id
     and a.id::text = payload_jsonb ->> 'attemptId'
     and a.state = 'validated'
    join public.conversation_messages m
      on m.turn_id = ct.id
     and m.subject_id = ct.subject_id
     and m.id::text = payload_jsonb ->> 'messageId'
     and m.sender_type = 'character'
     and m.redacted_at is null
    where ct.id::text = aggregate_id
      and ct.subject_id = public.current_myeongha_subject_id()
      and ct.state = 'validated'
  )
);

drop policy if exists conversation_threads_seyeon_chat_runtime_select_v1
  on public.conversation_threads;
create policy conversation_threads_seyeon_chat_runtime_select_v1
on public.conversation_threads
for select
to myeongha_seyeon_chat_runtime_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_threads_seyeon_chat_runtime_update_v1
  on public.conversation_threads;
create policy conversation_threads_seyeon_chat_runtime_update_v1
on public.conversation_threads
for update
to myeongha_seyeon_chat_runtime_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_thread_characters_seyeon_chat_runtime_select_v1
  on public.conversation_thread_characters;
create policy conversation_thread_characters_seyeon_chat_runtime_select_v1
on public.conversation_thread_characters
for select
to myeongha_seyeon_chat_runtime_owner
using (
  exists (
    select 1
    from public.conversation_threads ct
    where ct.id = conversation_thread_characters.thread_id
      and ct.subject_id = public.current_myeongha_subject_id()
  )
);

drop policy if exists conversation_messages_seyeon_chat_runtime_select_v1
  on public.conversation_messages;
create policy conversation_messages_seyeon_chat_runtime_select_v1
on public.conversation_messages
for select
to myeongha_seyeon_chat_runtime_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_messages_seyeon_chat_runtime_insert_v1
  on public.conversation_messages;
create policy conversation_messages_seyeon_chat_runtime_insert_v1
on public.conversation_messages
for insert
to myeongha_seyeon_chat_runtime_owner
with check (subject_id = public.current_myeongha_subject_id());

create or replace function public.assert_seyeon_chat_thread_runtime_v1(
  p_subject_id uuid,
  p_thread_id uuid
)
returns table (
  thread_character_id uuid,
  content_release_id uuid,
  content_bundle_id uuid
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $seyeon_chat_thread_runtime$
declare
  v_thread_type text;
  v_thread_status text;
  v_deleted_at timestamptz;
  v_release_id uuid;
  v_bundle_id uuid;
  v_active_count bigint;
  v_thread_character_id uuid;
  v_character_id text;
  v_character_bundle_id uuid;
  v_character_role text;
begin
  if p_subject_id is null or p_thread_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_identity_required',
      message = 'Se-yeon Chat runtime requires canonical Subject and thread identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select
    ct.thread_type,
    ct.status,
    ct.deleted_at,
    ct.active_content_release_id,
    ct.active_content_bundle_id
  into
    v_thread_type,
    v_thread_status,
    v_deleted_at,
    v_release_id,
    v_bundle_id
  from public.conversation_threads ct
  where ct.id = p_thread_id
    and ct.subject_id = p_subject_id;

  if not found
     or v_thread_type is distinct from 'single_character'
     or v_thread_status is distinct from 'active'
     or v_deleted_at is not null
     or v_release_id is null
     or v_bundle_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'seyeon_chat_runtime_thread_unavailable',
      message = 'Se-yeon Chat runtime thread is unavailable';
  end if;

  select count(*)
  into v_active_count
  from public.conversation_thread_characters tc
  where tc.thread_id = p_thread_id
    and tc.left_at is null;

  if v_active_count <> 1 then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_single_participant_required',
      message = 'Se-yeon Chat runtime requires exactly one active participant';
  end if;

  select tc.id, tc.character_id, tc.content_bundle_id, tc.role
  into strict
    v_thread_character_id,
    v_character_id,
    v_character_bundle_id,
    v_character_role
  from public.conversation_thread_characters tc
  where tc.thread_id = p_thread_id
    and tc.left_at is null;

  if v_character_id is distinct from 'seyeon'
     or v_character_role is distinct from 'primary'
     or v_character_bundle_id is distinct from v_bundle_id then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_participant_mismatch',
      message = 'Thread is not an authoritative Se-yeon single-Character runtime';
  end if;

  return query
  select v_thread_character_id, v_release_id, v_bundle_id;
end
$seyeon_chat_thread_runtime$;

revoke all on function public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)
  from public;

create or replace function public.cmd_receive_seyeon_chat_turn_runtime_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_client_turn_id text,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb,
  p_expected_content_release_id uuid,
  p_expected_content_bundle_id uuid,
  p_turn_id uuid,
  p_message_id uuid,
  p_user_body_text text,
  p_user_content_hash text
)
returns table (
  turn_id uuid,
  user_message_id uuid,
  user_text text,
  thread_character_id uuid,
  content_release_id uuid,
  content_bundle_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $receive_seyeon_chat_turn_runtime$
declare
  v_binding record;
  v_receive record;
  v_body text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select *
  into strict v_binding
  from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id, p_thread_id);

  if v_binding.content_release_id is distinct from p_expected_content_release_id
     or v_binding.content_bundle_id is distinct from p_expected_content_bundle_id then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_content_binding_conflict',
      message = 'Server-prepared Chat content does not match the pinned thread binding';
  end if;

  select *
  into strict v_receive
  from public.cmd_receive_chat_turn_v1(
    p_subject_id,
    p_thread_id,
    p_client_turn_id,
    p_request_hash,
    p_request_contract_version,
    p_request_snapshot_jsonb,
    v_binding.content_release_id,
    v_binding.content_bundle_id,
    p_turn_id,
    p_message_id,
    p_user_body_text,
    null,
    p_user_content_hash
  );

  select cm.body_text
  into v_body
  from public.conversation_messages cm
  where cm.id = v_receive.message_id
    and cm.turn_id = v_receive.turn_id
    and cm.thread_id = p_thread_id
    and cm.subject_id = p_subject_id
    and cm.sender_type = 'user'
    and cm.redacted_at is null;

  if not found or v_body is null then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_current_user_message_unavailable',
      message = 'Current authoritative user message is unavailable';
  end if;

  return query
  select
    v_receive.turn_id,
    v_receive.message_id,
    v_body,
    v_binding.thread_character_id,
    v_binding.content_release_id,
    v_binding.content_bundle_id,
    v_receive.replayed;
end
$receive_seyeon_chat_turn_runtime$;

create or replace function public.cmd_allocate_seyeon_chat_attempt_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_planner_version text
)
returns table (
  attempt_id uuid,
  attempt_no integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $allocate_seyeon_chat_attempt_runtime$
declare
  v_thread_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select ct.thread_id
  into v_thread_id
  from public.chat_turns ct
  where ct.id = p_turn_id
    and ct.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'seyeon_chat_runtime_turn_unavailable',
      message = 'Se-yeon Chat turn is unavailable';
  end if;

  perform 1
  from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id, v_thread_id);

  return query
  select *
  from public.cmd_allocate_chat_turn_attempt_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_planner_version
  );
end
$allocate_seyeon_chat_attempt_runtime$;

create or replace function public.cmd_mark_seyeon_chat_context_ready_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $mark_seyeon_chat_context_ready_runtime$
declare
  v_thread_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select ct.thread_id
  into v_thread_id
  from public.chat_turns ct
  where ct.id = p_turn_id
    and ct.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'seyeon_chat_runtime_turn_unavailable',
      message = 'Se-yeon Chat turn is unavailable';
  end if;

  perform 1
  from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id, v_thread_id);

  return public.cmd_mark_chat_turn_context_ready_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id
  );
end
$mark_seyeon_chat_context_ready_runtime$;

create or replace function public.cmd_fail_seyeon_chat_attempt_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_failure_state text,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $fail_seyeon_chat_attempt_runtime$
declare
  v_thread_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_failure_state is distinct from 'failed_retryable'
     or p_error_code is distinct from 'SEYEON_PRODUCTION_EXECUTION_FAILED' then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_failure_disposition_invalid',
      message = 'Se-yeon Production execution failure disposition is not authorized';
  end if;

  select ct.thread_id
  into v_thread_id
  from public.chat_turns ct
  where ct.id = p_turn_id
    and ct.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'seyeon_chat_runtime_turn_unavailable',
      message = 'Se-yeon Chat turn is unavailable';
  end if;

  perform 1
  from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id, v_thread_id);

  return public.cmd_mark_chat_turn_failed_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_failure_state,
    p_error_code
  );
end
$fail_seyeon_chat_attempt_runtime$;

create or replace function public.cmd_persist_seyeon_chat_generated_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_thread_character_id uuid,
  p_ai_execution_log_id uuid,
  p_provider text,
  p_model text,
  p_renderer_version text,
  p_body_text text,
  p_message_payload_jsonb jsonb,
  p_message_schema_version text,
  p_content_hash text,
  p_grounding_refs_jsonb jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $persist_seyeon_chat_generated_runtime$
declare
  v_thread_id uuid;
  v_release_id uuid;
  v_bundle_id uuid;
  v_binding record;
  v_existing_ai_id uuid;
  v_effective_ai_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_provider is null or btrim(p_provider) = ''
     or p_model is null or btrim(p_model) = ''
     or p_renderer_version is null or btrim(p_renderer_version) = ''
     or p_grounding_refs_jsonb is distinct from '[]'::jsonb then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_generation_provenance_invalid',
      message = 'Se-yeon Chat generated provenance is invalid';
  end if;

  select ct.thread_id, ct.resolved_content_release_id, ct.resolved_content_bundle_id
  into v_thread_id, v_release_id, v_bundle_id
  from public.chat_turns ct
  where ct.id = p_turn_id
    and ct.subject_id = p_subject_id;

  if not found or v_release_id is null or v_bundle_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'seyeon_chat_runtime_turn_unavailable',
      message = 'Se-yeon Chat turn is unavailable';
  end if;

  select *
  into strict v_binding
  from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id, v_thread_id);

  if v_binding.thread_character_id is distinct from p_thread_character_id
     or v_binding.content_release_id is distinct from v_release_id
     or v_binding.content_bundle_id is distinct from v_bundle_id then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_generation_binding_conflict',
      message = 'Generated Se-yeon output does not match the pinned turn authority';
  end if;

  select a.generation_ai_execution_log_id
  into v_existing_ai_id
  from public.chat_turn_attempts a
  where a.id = p_attempt_id
    and a.turn_id = p_turn_id
    and a.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'seyeon_chat_runtime_attempt_unavailable',
      message = 'Se-yeon Chat attempt is unavailable';
  end if;

  v_effective_ai_id := coalesce(v_existing_ai_id, p_ai_execution_log_id);
  if v_effective_ai_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_generation_ai_id_required',
      message = 'Renderer AI execution identity is required';
  end if;

  if v_existing_ai_id is null then
    insert into public.ai_execution_logs (
      id,
      subject_id,
      turn_id,
      turn_attempt_id,
      stage,
      provider,
      model,
      prompt_version,
      content_release_id,
      content_bundle_id,
      character_id,
      relationship_policy_version,
      saju_engine_version,
      grounding_version,
      input_ref_jsonb,
      output_ref_jsonb,
      input_tokens,
      output_tokens,
      latency_ms,
      status,
      error_code,
      created_at
    ) values (
      v_effective_ai_id,
      p_subject_id,
      p_turn_id,
      p_attempt_id,
      'renderer',
      btrim(p_provider),
      btrim(p_model),
      btrim(p_renderer_version),
      v_release_id,
      v_bundle_id,
      'seyeon',
      null,
      null,
      null,
      jsonb_build_object(
        'authority', 'seyeon-production-chat-execution-v1',
        'turnId', p_turn_id::text,
        'attemptId', p_attempt_id::text
      ),
      jsonb_build_object(
        'generatedContentHash', p_content_hash
      ),
      null,
      null,
      null,
      'success',
      null,
      clock_timestamp()
    );
  end if;

  return public.cmd_mark_chat_turn_generated_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    v_effective_ai_id,
    p_renderer_version,
    p_thread_character_id,
    p_body_text,
    p_message_payload_jsonb,
    p_message_schema_version,
    p_content_hash,
    p_grounding_refs_jsonb
  );
end
$persist_seyeon_chat_generated_runtime$;

create or replace function public.cmd_persist_seyeon_chat_validated_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_ai_execution_log_id uuid,
  p_provider text,
  p_model text,
  p_output_guard_version text,
  p_generated_content_hash text,
  p_validation_result_jsonb jsonb,
  p_grounding_refs_jsonb jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $persist_seyeon_chat_validated_runtime$
declare
  v_thread_id uuid;
  v_release_id uuid;
  v_bundle_id uuid;
  v_existing_ai_id uuid;
  v_effective_ai_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_provider is null or btrim(p_provider) = ''
     or p_model is null or btrim(p_model) = ''
     or p_output_guard_version is null or btrim(p_output_guard_version) = ''
     or p_grounding_refs_jsonb is distinct from '[]'::jsonb then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_validation_provenance_invalid',
      message = 'Se-yeon Chat validation provenance is invalid';
  end if;

  select ct.thread_id, ct.resolved_content_release_id, ct.resolved_content_bundle_id
  into v_thread_id, v_release_id, v_bundle_id
  from public.chat_turns ct
  where ct.id = p_turn_id
    and ct.subject_id = p_subject_id;

  if not found or v_release_id is null or v_bundle_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'seyeon_chat_runtime_turn_unavailable',
      message = 'Se-yeon Chat turn is unavailable';
  end if;

  perform 1
  from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id, v_thread_id);

  select a.validation_ai_execution_log_id
  into v_existing_ai_id
  from public.chat_turn_attempts a
  where a.id = p_attempt_id
    and a.turn_id = p_turn_id
    and a.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'seyeon_chat_runtime_attempt_unavailable',
      message = 'Se-yeon Chat attempt is unavailable';
  end if;

  v_effective_ai_id := coalesce(v_existing_ai_id, p_ai_execution_log_id);
  if v_effective_ai_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_validation_ai_id_required',
      message = 'Output Guard AI execution identity is required';
  end if;

  if v_existing_ai_id is null then
    insert into public.ai_execution_logs (
      id,
      subject_id,
      turn_id,
      turn_attempt_id,
      stage,
      provider,
      model,
      prompt_version,
      content_release_id,
      content_bundle_id,
      character_id,
      relationship_policy_version,
      saju_engine_version,
      grounding_version,
      input_ref_jsonb,
      output_ref_jsonb,
      input_tokens,
      output_tokens,
      latency_ms,
      status,
      error_code,
      created_at
    ) values (
      v_effective_ai_id,
      p_subject_id,
      p_turn_id,
      p_attempt_id,
      'output_guard',
      btrim(p_provider),
      btrim(p_model),
      btrim(p_output_guard_version),
      v_release_id,
      v_bundle_id,
      'seyeon',
      null,
      null,
      null,
      jsonb_build_object(
        'authority', 'seyeon-production-chat-execution-v1',
        'turnId', p_turn_id::text,
        'attemptId', p_attempt_id::text
      ),
      jsonb_build_object(
        'generatedContentHash', p_generated_content_hash
      ),
      null,
      null,
      null,
      'success',
      null,
      clock_timestamp()
    );
  end if;

  return public.cmd_validate_chat_turn_attempt_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    v_effective_ai_id,
    p_output_guard_version,
    p_validation_result_jsonb,
    true,
    null
  );
end
$persist_seyeon_chat_validated_runtime$;

create or replace function public.cmd_commit_seyeon_chat_turn_runtime_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_message_id uuid,
  p_outbox_event_id uuid
)
returns table (
  turn_id uuid,
  attempt_id uuid,
  assistant_message_id uuid,
  sequence_no bigint,
  committed_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_seyeon_chat_turn_runtime$
declare
  v_binding record;
  v_commit record;
  v_committed_at timestamptz;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select *
  into strict v_binding
  from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id, p_thread_id);

  select *
  into strict v_commit
  from public.cmd_commit_chat_turn_v1(
    p_subject_id,
    p_thread_id,
    p_turn_id,
    p_attempt_id,
    p_message_id,
    p_outbox_event_id,
    null,
    null,
    null
  );

  select ct.committed_at
  into v_committed_at
  from public.chat_turns ct
  where ct.id = v_commit.turn_id
    and ct.thread_id = p_thread_id
    and ct.subject_id = p_subject_id
    and ct.state in ('committed','delivered');

  if not found or v_committed_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_chat_runtime_commit_timestamp_required',
      message = 'Committed Se-yeon Chat turn is missing its authoritative commit timestamp';
  end if;

  return query
  select
    v_commit.turn_id,
    v_commit.attempt_id,
    v_commit.message_id,
    v_commit.sequence_no,
    v_committed_at,
    v_commit.replayed;
end
$commit_seyeon_chat_turn_runtime$;

-- Transfer only these wrappers/helper to the narrow role.
grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;

alter function public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)
  owner to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_receive_seyeon_chat_turn_runtime_v1(
  uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,text
) owner to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_allocate_seyeon_chat_attempt_runtime_v1(
  uuid,uuid,uuid,text
) owner to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_mark_seyeon_chat_context_ready_runtime_v1(
  uuid,uuid,uuid
) owner to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_fail_seyeon_chat_attempt_runtime_v1(
  uuid,uuid,uuid,text,text
) owner to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_persist_seyeon_chat_generated_runtime_v1(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,text,jsonb
) owner to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_persist_seyeon_chat_validated_runtime_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb
) owner to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_commit_seyeon_chat_turn_runtime_v1(
  uuid,uuid,uuid,uuid,uuid,uuid
) owner to myeongha_seyeon_chat_runtime_owner;

revoke all on function public.cmd_receive_seyeon_chat_turn_runtime_v1(
  uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,text
) from public;
revoke all on function public.cmd_allocate_seyeon_chat_attempt_runtime_v1(
  uuid,uuid,uuid,text
) from public;
revoke all on function public.cmd_mark_seyeon_chat_context_ready_runtime_v1(
  uuid,uuid,uuid
) from public;
revoke all on function public.cmd_fail_seyeon_chat_attempt_runtime_v1(
  uuid,uuid,uuid,text,text
) from public;
revoke all on function public.cmd_persist_seyeon_chat_generated_runtime_v1(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,text,jsonb
) from public;
revoke all on function public.cmd_persist_seyeon_chat_validated_runtime_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb
) from public;
revoke all on function public.cmd_commit_seyeon_chat_turn_runtime_v1(
  uuid,uuid,uuid,uuid,uuid,uuid
) from public;

DO $acl$
DECLARE
  v_role text;
  v_signature text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon','authenticated','service_role')
  LOOP
    FOREACH v_signature IN ARRAY ARRAY[
      'public.cmd_receive_seyeon_chat_turn_runtime_v1(uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,text)',
      'public.cmd_allocate_seyeon_chat_attempt_runtime_v1(uuid,uuid,uuid,text)',
      'public.cmd_mark_seyeon_chat_context_ready_runtime_v1(uuid,uuid,uuid)',
      'public.cmd_fail_seyeon_chat_attempt_runtime_v1(uuid,uuid,uuid,text,text)',
      'public.cmd_persist_seyeon_chat_generated_runtime_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,text,jsonb)',
      'public.cmd_persist_seyeon_chat_validated_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)',
      'public.cmd_commit_seyeon_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)'
    ]
    LOOP
      execute pg_catalog.format(
        'revoke all on function %s from %I',
        v_signature,
        v_role
      );
    END LOOP;
  END LOOP;
END
$acl$;

grant execute on function public.cmd_receive_seyeon_chat_turn_runtime_v1(
  uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,text
) to myeongha_api_executor;
grant execute on function public.cmd_allocate_seyeon_chat_attempt_runtime_v1(
  uuid,uuid,uuid,text
) to myeongha_api_executor;
grant execute on function public.cmd_mark_seyeon_chat_context_ready_runtime_v1(
  uuid,uuid,uuid
) to myeongha_api_executor;
grant execute on function public.cmd_fail_seyeon_chat_attempt_runtime_v1(
  uuid,uuid,uuid,text,text
) to myeongha_api_executor;
grant execute on function public.cmd_persist_seyeon_chat_generated_runtime_v1(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,text,jsonb
) to myeongha_api_executor;
grant execute on function public.cmd_persist_seyeon_chat_validated_runtime_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb
) to myeongha_api_executor;
grant execute on function public.cmd_commit_seyeon_chat_turn_runtime_v1(
  uuid,uuid,uuid,uuid,uuid,uuid
) to myeongha_api_executor;

revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;

DO $postcheck$
DECLARE
  v_owner_oid oid;
  v_server_version_num integer := current_setting('server_version_num')::integer;
  v_membership_count integer;
  v_expected_admin_count integer;
  v_current_user_superuser boolean;
BEGIN
  SELECT r.oid
  INTO STRICT v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_seyeon_chat_runtime_owner';

  SELECT count(*)
  INTO v_membership_count
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid = v_owner_oid;

  SELECT r.rolsuper
  INTO STRICT v_current_user_superuser
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = CURRENT_USER;

  IF v_server_version_num >= 160000 THEN
    IF v_current_user_superuser THEN
      IF v_membership_count <> 0 THEN
        RAISE EXCEPTION 'myeongha_seyeon_chat_runtime_owner retained unexpected PostgreSQL 16+ superuser membership';
      END IF;
    ELSE
      SELECT count(*)
      INTO v_expected_admin_count
      FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles member_role
        ON member_role.oid = m.member
      JOIN pg_catalog.pg_roles grantor_role
        ON grantor_role.oid = m.grantor
      WHERE m.roleid = v_owner_oid
        AND member_role.rolname = CURRENT_USER
        AND m.admin_option
        AND NOT m.inherit_option
        AND NOT m.set_option
        AND grantor_role.rolsuper;

      IF v_membership_count <> 1 OR v_expected_admin_count <> 1 THEN
        RAISE EXCEPTION 'myeongha_seyeon_chat_runtime_owner did not return to the PostgreSQL 16+ admin-only creator membership contract';
      END IF;
    END IF;
  ELSIF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_seyeon_chat_runtime_owner retained unexpected pre-PostgreSQL-16 membership';
  END IF;

  IF NOT has_schema_privilege(
    'myeongha_seyeon_chat_runtime_owner',
    'public',
    'USAGE'
  ) OR has_schema_privilege(
    'myeongha_seyeon_chat_runtime_owner',
    'public',
    'CREATE'
  ) THEN
    RAISE EXCEPTION 'myeongha_seyeon_chat_runtime_owner retained unexpected schema privilege';
  END IF;
END
$postcheck$;
