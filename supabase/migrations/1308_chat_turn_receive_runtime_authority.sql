-- Production Character Chat receive/attempt authority.
--
-- The legacy lifecycle commands remain SECURITY INVOKER persistence primitives.
-- Production API execution must not gain direct INSERT/UPDATE authority over the
-- underlying Chat relations, so this migration introduces a narrow NOLOGIN /
-- NOBYPASSRLS owner and SECURITY DEFINER wrappers for:
--
-- receive -> allocate attempt -> context_ready -> failed
--
-- The transaction-local canonical subject established by
-- executePostgresSubjectTransactionV1 remains mandatory inside every wrapper.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'myeongha_chat_turn_receive_owner'
  ) THEN
    CREATE ROLE myeongha_chat_turn_receive_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

grant usage on schema public to myeongha_chat_turn_receive_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_chat_turn_receive_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_chat_turn_receive_owner;

-- Underlying lifecycle primitive execution. These remain unavailable to the API
-- executor itself.
grant execute on function public.cmd_receive_chat_turn_v1(
  uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid, text, jsonb, text
) to myeongha_chat_turn_receive_owner;
grant execute on function public.cmd_allocate_chat_turn_attempt_v1(
  uuid, uuid, uuid, text
) to myeongha_chat_turn_receive_owner;
grant execute on function public.cmd_mark_chat_turn_context_ready_v1(
  uuid, uuid, uuid
) to myeongha_chat_turn_receive_owner;
grant execute on function public.cmd_mark_chat_turn_failed_v1(
  uuid, uuid, uuid, text, text
) to myeongha_chat_turn_receive_owner;

alter table public.chat_turns enable row level security;
alter table public.chat_turn_attempts enable row level security;

-- Narrow relation privileges required by the four legacy commands.
grant select (
  id,
  subject_id,
  status,
  active_content_release_id,
  active_content_bundle_id,
  next_sequence_no
) on public.conversation_threads to myeongha_chat_turn_receive_owner;
grant update (
  next_sequence_no,
  updated_at
) on public.conversation_threads to myeongha_chat_turn_receive_owner;

grant select (
  id,
  thread_id,
  subject_id,
  client_turn_id,
  request_hash,
  state,
  next_attempt_no,
  created_at
) on public.chat_turns to myeongha_chat_turn_receive_owner;
grant insert (
  id,
  thread_id,
  subject_id,
  client_turn_id,
  request_hash,
  request_contract_version,
  request_snapshot_jsonb,
  resolved_content_release_id,
  resolved_content_bundle_id,
  state,
  revision,
  next_attempt_no,
  created_at,
  updated_at
) on public.chat_turns to myeongha_chat_turn_receive_owner;
grant update (
  next_attempt_no,
  state,
  revision,
  error_code,
  updated_at
) on public.chat_turns to myeongha_chat_turn_receive_owner;

grant select (
  id,
  turn_id,
  subject_id,
  sender_type,
  sequence_no
) on public.conversation_messages to myeongha_chat_turn_receive_owner;
grant insert (
  id,
  thread_id,
  subject_id,
  turn_id,
  sequence_no,
  sender_type,
  body_text,
  message_payload_jsonb,
  content_hash,
  created_at
) on public.conversation_messages to myeongha_chat_turn_receive_owner;

grant select (
  id,
  turn_id,
  subject_id,
  attempt_no,
  state,
  error_code
) on public.chat_turn_attempts to myeongha_chat_turn_receive_owner;
grant insert (
  id,
  turn_id,
  subject_id,
  attempt_no,
  state,
  planner_version,
  started_at
) on public.chat_turn_attempts to myeongha_chat_turn_receive_owner;
grant update (
  state,
  finished_at,
  error_code
) on public.chat_turn_attempts to myeongha_chat_turn_receive_owner;

-- RLS keeps the definer owner pinned to the transaction-local canonical subject.
drop policy if exists conversation_threads_chat_turn_receive_select_v1
  on public.conversation_threads;
create policy conversation_threads_chat_turn_receive_select_v1
on public.conversation_threads
for select
to myeongha_chat_turn_receive_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_threads_chat_turn_receive_update_v1
  on public.conversation_threads;
create policy conversation_threads_chat_turn_receive_update_v1
on public.conversation_threads
for update
to myeongha_chat_turn_receive_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists chat_turns_chat_turn_receive_select_v1
  on public.chat_turns;
create policy chat_turns_chat_turn_receive_select_v1
on public.chat_turns
for select
to myeongha_chat_turn_receive_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists chat_turns_chat_turn_receive_insert_v1
  on public.chat_turns;
create policy chat_turns_chat_turn_receive_insert_v1
on public.chat_turns
for insert
to myeongha_chat_turn_receive_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and exists (
    select 1
    from public.conversation_threads ct
    where ct.id = chat_turns.thread_id
      and ct.subject_id = public.current_myeongha_subject_id()
      and ct.status = 'active'
  )
);

drop policy if exists chat_turns_chat_turn_receive_update_v1
  on public.chat_turns;
create policy chat_turns_chat_turn_receive_update_v1
on public.chat_turns
for update
to myeongha_chat_turn_receive_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_messages_chat_turn_receive_select_v1
  on public.conversation_messages;
create policy conversation_messages_chat_turn_receive_select_v1
on public.conversation_messages
for select
to myeongha_chat_turn_receive_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_messages_chat_turn_receive_insert_v1
  on public.conversation_messages;
create policy conversation_messages_chat_turn_receive_insert_v1
on public.conversation_messages
for insert
to myeongha_chat_turn_receive_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and exists (
    select 1
    from public.chat_turns t
    where t.id = conversation_messages.turn_id
      and t.thread_id = conversation_messages.thread_id
      and t.subject_id = public.current_myeongha_subject_id()
  )
);

drop policy if exists chat_turn_attempts_chat_turn_receive_select_v1
  on public.chat_turn_attempts;
create policy chat_turn_attempts_chat_turn_receive_select_v1
on public.chat_turn_attempts
for select
to myeongha_chat_turn_receive_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists chat_turn_attempts_chat_turn_receive_insert_v1
  on public.chat_turn_attempts;
create policy chat_turn_attempts_chat_turn_receive_insert_v1
on public.chat_turn_attempts
for insert
to myeongha_chat_turn_receive_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and exists (
    select 1
    from public.chat_turns t
    where t.id = chat_turn_attempts.turn_id
      and t.subject_id = public.current_myeongha_subject_id()
  )
);

drop policy if exists chat_turn_attempts_chat_turn_receive_update_v1
  on public.chat_turn_attempts;
create policy chat_turn_attempts_chat_turn_receive_update_v1
on public.chat_turn_attempts
for update
to myeongha_chat_turn_receive_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

create or replace function public.cmd_receive_chat_turn_runtime_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_client_turn_id text,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb,
  p_resolved_content_release_id uuid,
  p_resolved_content_bundle_id uuid,
  p_turn_id uuid,
  p_message_id uuid,
  p_user_body_text text,
  p_user_message_payload_jsonb jsonb,
  p_user_content_hash text
)
returns table (
  turn_id uuid,
  message_id uuid,
  sequence_no bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select *
  from public.cmd_receive_chat_turn_v1(
    p_subject_id,
    p_thread_id,
    p_client_turn_id,
    p_request_hash,
    p_request_contract_version,
    p_request_snapshot_jsonb,
    p_resolved_content_release_id,
    p_resolved_content_bundle_id,
    p_turn_id,
    p_message_id,
    p_user_body_text,
    p_user_message_payload_jsonb,
    p_user_content_hash
  );
end;
$$;

create or replace function public.cmd_allocate_chat_turn_attempt_runtime_v1(
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
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select *
  from public.cmd_allocate_chat_turn_attempt_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_planner_version
  );
end;
$$;

create or replace function public.cmd_mark_chat_turn_context_ready_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return public.cmd_mark_chat_turn_context_ready_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id
  );
end;
$$;

create or replace function public.cmd_mark_chat_turn_failed_runtime_v1(
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
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return public.cmd_mark_chat_turn_failed_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_failure_state,
    p_error_code
  );
end;
$$;

-- Transfer wrappers to the narrow owner. The owner never receives schema CREATE
-- after migration completion.
grant myeongha_chat_turn_receive_owner to current_user;
grant create on schema public to myeongha_chat_turn_receive_owner;

alter function public.cmd_receive_chat_turn_runtime_v1(
  uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid, text, jsonb, text
) owner to myeongha_chat_turn_receive_owner;
alter function public.cmd_allocate_chat_turn_attempt_runtime_v1(
  uuid, uuid, uuid, text
) owner to myeongha_chat_turn_receive_owner;
alter function public.cmd_mark_chat_turn_context_ready_runtime_v1(
  uuid, uuid, uuid
) owner to myeongha_chat_turn_receive_owner;
alter function public.cmd_mark_chat_turn_failed_runtime_v1(
  uuid, uuid, uuid, text, text
) owner to myeongha_chat_turn_receive_owner;

revoke all on function public.cmd_receive_chat_turn_runtime_v1(
  uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid, text, jsonb, text
) from public;
revoke all on function public.cmd_allocate_chat_turn_attempt_runtime_v1(
  uuid, uuid, uuid, text
) from public;
revoke all on function public.cmd_mark_chat_turn_context_ready_runtime_v1(
  uuid, uuid, uuid
) from public;
revoke all on function public.cmd_mark_chat_turn_failed_runtime_v1(
  uuid, uuid, uuid, text, text
) from public;

DO $$
DECLARE
  v_role text;
  v_signature text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    FOREACH v_signature IN ARRAY ARRAY[
      'public.cmd_receive_chat_turn_runtime_v1(uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,jsonb,text)',
      'public.cmd_allocate_chat_turn_attempt_runtime_v1(uuid,uuid,uuid,text)',
      'public.cmd_mark_chat_turn_context_ready_runtime_v1(uuid,uuid,uuid)',
      'public.cmd_mark_chat_turn_failed_runtime_v1(uuid,uuid,uuid,text,text)'
    ]
    LOOP
      EXECUTE pg_catalog.format(
        'revoke all on function %s from %I',
        v_signature,
        v_role
      );
    END LOOP;
  END LOOP;
END
$$;

grant execute on function public.cmd_receive_chat_turn_runtime_v1(
  uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid, text, jsonb, text
) to myeongha_api_executor;
grant execute on function public.cmd_allocate_chat_turn_attempt_runtime_v1(
  uuid, uuid, uuid, text
) to myeongha_api_executor;
grant execute on function public.cmd_mark_chat_turn_context_ready_runtime_v1(
  uuid, uuid, uuid
) to myeongha_api_executor;
grant execute on function public.cmd_mark_chat_turn_failed_runtime_v1(
  uuid, uuid, uuid, text, text
) to myeongha_api_executor;

-- The API executor must never gain direct write authority to the underlying tables
-- or EXECUTE on the legacy primitives.
revoke insert, update, delete on public.chat_turns from myeongha_api_executor;
revoke insert, update, delete on public.chat_turn_attempts from myeongha_api_executor;
revoke insert, update, delete on public.conversation_messages from myeongha_api_executor;
revoke insert, update, delete on public.conversation_threads from myeongha_api_executor;

revoke all on function public.cmd_receive_chat_turn_v1(
  uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid, text, jsonb, text
) from myeongha_api_executor;
revoke all on function public.cmd_allocate_chat_turn_attempt_v1(
  uuid, uuid, uuid, text
) from myeongha_api_executor;
revoke all on function public.cmd_mark_chat_turn_context_ready_v1(
  uuid, uuid, uuid
) from myeongha_api_executor;
revoke all on function public.cmd_mark_chat_turn_failed_v1(
  uuid, uuid, uuid, text, text
) from myeongha_api_executor;

revoke create on schema public from myeongha_chat_turn_receive_owner;
revoke myeongha_chat_turn_receive_owner from current_user;

comment on function public.cmd_receive_chat_turn_runtime_v1(
  uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid, text, jsonb, text
) is
'Production API wrapper for subject-bound atomic Chat turn receive. API executor receives EXECUTE only.';
comment on function public.cmd_allocate_chat_turn_attempt_runtime_v1(
  uuid, uuid, uuid, text
) is
'Production API wrapper for subject-bound first/retry Chat attempt allocation.';
comment on function public.cmd_mark_chat_turn_context_ready_runtime_v1(
  uuid, uuid, uuid
) is
'Production API wrapper for subject-bound Chat context_ready transition.';
comment on function public.cmd_mark_chat_turn_failed_runtime_v1(
  uuid, uuid, uuid, text, text
) is
'Production API wrapper for subject-bound terminal/retryable Chat attempt failure.';
