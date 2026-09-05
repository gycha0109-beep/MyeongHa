-- Production owner-scoped Chat read runtime authority.
--
-- Chat reads remain SECURITY INVOKER. The Production API executor receives only
-- the relation reads and query EXECUTE privileges required by the existing
-- owner-scoped thread binding, stream and relationship projections. Canonical
-- subject ownership is established transaction-locally by the API runtime.

alter table public.conversation_threads enable row level security;
alter table public.conversation_thread_characters enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.user_character_states enable row level security;

drop policy if exists conversation_threads_api_current_select_v1 on public.conversation_threads;
create policy conversation_threads_api_current_select_v1
  on public.conversation_threads
  for select
  to myeongha_api_executor
  using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_thread_characters_api_current_select_v1 on public.conversation_thread_characters;
create policy conversation_thread_characters_api_current_select_v1
  on public.conversation_thread_characters
  for select
  to myeongha_api_executor
  using (
    exists (
      select 1
      from public.conversation_threads ct
      where ct.id = conversation_thread_characters.thread_id
        and ct.subject_id = public.current_myeongha_subject_id()
    )
  );

drop policy if exists conversation_messages_api_current_select_v1 on public.conversation_messages;
create policy conversation_messages_api_current_select_v1
  on public.conversation_messages
  for select
  to myeongha_api_executor
  using (subject_id = public.current_myeongha_subject_id());

drop policy if exists user_character_states_api_current_select_v1 on public.user_character_states;
create policy user_character_states_api_current_select_v1
  on public.user_character_states
  for select
  to myeongha_api_executor
  using (subject_id = public.current_myeongha_subject_id());

-- qry_chat_thread_runtime_binding_v1 selects the owned thread into its rowtype,
-- so the executor needs SELECT on the thread relation itself. RLS keeps that
-- read constrained to the transaction-local canonical subject.
grant select on public.conversation_threads to myeongha_api_executor;

grant select (
  id,
  thread_id,
  character_id,
  content_bundle_id,
  role,
  left_at
) on public.conversation_thread_characters to myeongha_api_executor;

grant select (
  id,
  thread_id,
  subject_id,
  sequence_no,
  sender_type,
  thread_character_id,
  body_text,
  message_payload_jsonb,
  message_schema_version,
  created_at,
  redacted_at
) on public.conversation_messages to myeongha_api_executor;

grant select (
  id,
  subject_id,
  character_id,
  closeness,
  trust,
  friction,
  relationship_stage,
  policy_version,
  revision,
  last_interaction_at,
  updated_at
) on public.user_character_states to myeongha_api_executor;

-- qry_character_relationship_v1 validates the canonical participant against the
-- Character catalog before reading the subject-owned relationship projection.
grant select (character_id) on public.characters to myeongha_api_executor;

revoke all on function public.qry_chat_thread_runtime_binding_v1(uuid, uuid) from public;
revoke all on function public.qry_chat_thread_stream_v1(uuid, uuid, bigint) from public;
revoke all on function public.qry_character_relationship_v1(uuid, text) from public;

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
      'public.qry_chat_thread_runtime_binding_v1(uuid,uuid)',
      'public.qry_chat_thread_stream_v1(uuid,uuid,bigint)',
      'public.qry_character_relationship_v1(uuid,text)'
    ]
    LOOP
      EXECUTE pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
    END LOOP;
  END LOOP;
END
$$;

grant execute on function public.qry_chat_thread_runtime_binding_v1(uuid, uuid)
  to myeongha_api_executor;
grant execute on function public.qry_chat_thread_stream_v1(uuid, uuid, bigint)
  to myeongha_api_executor;
grant execute on function public.qry_character_relationship_v1(uuid, text)
  to myeongha_api_executor;
