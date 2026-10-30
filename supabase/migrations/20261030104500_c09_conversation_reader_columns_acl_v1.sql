-- C09 first-turn and multi-turn census: only required subject-scoped columns.
-- The pre-existing SELECT RLS policy conversation_messages_api_current_select_v1
-- continues to enforce subject_id = current_myeongha_subject_id().
-- No INSERT/UPDATE/DELETE, no model activation and no raw payload access.
begin;
grant select (
  id, thread_id, subject_id, sequence_no, sender_type,
  redacted_at, body_text
) on public.conversation_messages to myeongha_api_executor;
commit;
