-- RR-04 DB Authority: dormant, read-only Official Reader follow-up candidate.
-- Watchtower-Track: db-authority-core
-- Dependent on Draft RR-03 private sidecar migration 1720 (PR #1960).
--
-- This is NOT the public/query-port function. It exposes no EXECUTE grant.
-- It cannot attest Product policy (server-owned) or replace the missing
-- atomic RR-03 Writer + exact Grant/refund T2 lock. Do not copy/rename it
-- to qry_official_reader_followup_anchor_runtime_v1 without those gates.
--
-- Conservative candidate semantics:
--   * canonical active Subject + trusted transaction context
--   * exactly one current purchase-backed Reader access row, reading, bundle,
--     official hash, product and spec must match the sidecar
--   * active single-Reader thread and exact release/bundle/revision
--   * newest Reader-character message is authoritative; an absent/stale
--     provenance on that latest message never falls back to older evidence
--   * exact committed Turn, Attempt, message hash and source-backed Unit refs
--
-- These are necessary conditions, not sufficient public disclosure authority.
create or replace function public.internal_qry_official_reader_followup_candidate_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_reader_character_id text,
  p_reading_ref uuid
)
returns table (
  status text,
  subject_id uuid,
  thread_id uuid,
  reader_character_id text,
  reading_ref uuid,
  official_artifact_response_hash text,
  grounding_hash text,
  assistant_message_id uuid,
  source_unit_refs text[],
  focused_unit_ref text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $rr04_candidate$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_reading_ref is null
     or p_reader_character_id is null
     or btrim(p_reader_character_id) = ''
     or length(p_reader_character_id) > 256 then
    raise exception using
      errcode = '23514',
      constraint = 'rr04_candidate_scope_required',
      message = 'Official Reader follow-up candidate scope is invalid';
  end if;

  return query
  with
  current_access as materialized (
    select a.subject_id, a.reading_id, a.product_id,
           a.reader_character_id, a.reader_content_bundle_id,
           a.product_spec_version, a.response_hash
    from public.internal_qry_character_standard_reading_access_v2(
      p_subject_id,p_reader_character_id,clock_timestamp()
    ) a
    where a.reading_id = p_reading_ref
  ),
  exact_access as (
    select a.*
    from current_access a
    where (select count(*) from current_access) = 1
  ),
  latest_reader_message as materialized (
    select m.id, m.turn_id, m.subject_id, m.thread_id,
           m.content_hash, m.redacted_at, m.character_content_bundle_id,
           m.thread_character_id
    from public.conversation_messages m
    join public.conversation_thread_characters c
      on c.id = m.thread_character_id
     and c.thread_id = m.thread_id
     and c.character_id = p_reader_character_id
    where m.subject_id = p_subject_id
      and m.thread_id = p_thread_id
      and m.sender_type = 'character'
    order by m.sequence_no desc, m.id desc
    limit 1
  )
  select
    'committed_semantic_guard_pass'::text,
    p.subject_id, p.thread_id, p.reader_character_id, p.reading_ref,
    p.official_artifact_response_hash, p.grounding_hash,
    p.assistant_message_id, p.source_unit_refs, p.focused_unit_ref
  from latest_reader_message m
  join public.official_reader_assistant_saju_provenance p
    on p.assistant_message_id = m.id
   and p.subject_id = m.subject_id
   and p.thread_id = m.thread_id
   and p.turn_id = m.turn_id
   and p.reading_ref = p_reading_ref
   and p.reader_character_id = p_reader_character_id
  join exact_access access
    on access.subject_id = p.subject_id
   and access.reading_id = p.reading_ref
   and access.reader_character_id = p.reader_character_id
   and access.reader_content_bundle_id = p.reader_content_bundle_id
   and access.product_id = p.product_id
   and access.product_spec_version = p.product_spec_version
   and access.response_hash = p.official_artifact_response_hash
  join public.subjects subject
    on subject.id = p.subject_id
   and subject.status = 'active'
   and subject.merged_into_subject_id is null
  join public.conversation_threads thread
    on thread.id = p.thread_id
   and thread.subject_id = p.subject_id
   and thread.status = 'active'
   and thread.deleted_at is null
   and thread.thread_type = 'single_character'
   and thread.active_content_release_id = p.content_release_id
   and thread.active_content_bundle_id = p.reader_content_bundle_id
   and thread.content_revision = p.content_revision
  join public.conversation_thread_characters participant
    on participant.id = m.thread_character_id
   and participant.thread_id = p.thread_id
   and participant.character_id = p.reader_character_id
   and participant.content_bundle_id = p.reader_content_bundle_id
   and participant.role = 'primary'
   and participant.left_at is null
  join public.chat_turns turn_record
    on turn_record.id = p.turn_id
   and turn_record.thread_id = p.thread_id
   and turn_record.subject_id = p.subject_id
   and turn_record.state in ('committed','delivered')
   and turn_record.committed_attempt_id = p.attempt_id
   and turn_record.committed_at is not null
   and turn_record.resolved_content_release_id = p.content_release_id
   and turn_record.resolved_content_bundle_id = p.reader_content_bundle_id
  join public.chat_turn_attempts attempt
    on attempt.id = p.attempt_id
   and attempt.turn_id = p.turn_id
   and attempt.subject_id = p.subject_id
   and attempt.state = 'committed'
   and attempt.committed_message_id = p.assistant_message_id
   and attempt.output_guard_version = p.output_guard_version
  where m.redacted_at is null
    and m.character_content_bundle_id = p.reader_content_bundle_id
    and m.content_hash = p.utterance_hash
    and p.provenance_state = 'semantic_and_output_guard_pass'
    and (select count(*)
         from public.conversation_thread_characters participant_count
         where participant_count.thread_id = p_thread_id
           and participant_count.left_at is null) = 1;
end
$rr04_candidate$;

comment on function public.internal_qry_official_reader_followup_candidate_v1(
  uuid, uuid, text, uuid
) is
'RR-04 ungranted private candidate reader. Necessary latest committed Assistant and current exact Reader Grant/Reading/Release checks only. Never a public query or Product-policy/Refund-T2 authorization.';

revoke all on function public.internal_qry_official_reader_followup_candidate_v1(
  uuid, uuid, text, uuid
) from public;

do $rr04_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role',
                        'myeongha_api_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_followup_candidate_v1(uuid,uuid,text,uuid) from %I',
      v_role
    );
  end loop;
end
$rr04_acl$;
