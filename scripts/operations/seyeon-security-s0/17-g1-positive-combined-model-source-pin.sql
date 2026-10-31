-- Watchtower-Track: security
-- Source-only G1: current-model User and original positive Memory must
-- be persisted together in ONE PostgreSQL statement / transaction.
-- No Production migration, API EXECUTE or Provider enablement.
begin;

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.pin_positive_model_context_sources_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_current_user_message_id uuid,p_recent_sources jsonb,
  p_model_source_census_digest text,
  p_record_id uuid,p_original_grant_id uuid,
  p_record_type text,p_schema_version text,p_projector_version text,
  p_selected_sources_digest text,p_projected_memory_digest text,
  p_final_model_context_digest text,p_expected_record_pg_digest text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public
as $combined$
declare
  v_recent jsonb;
  v_memory jsonb;
  v_stored record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  -- The current S0 positive scope is exactly one Memory and one current
  -- Member User message. Historical messages, multi-records and Reader
  -- derived inputs remain unsupported; do not permit a silent expansion.
  if jsonb_typeof(p_recent_sources) is distinct from 'array'
    or jsonb_array_length(p_recent_sources)<>1
    or p_recent_sources->0->>'messageId'
       is distinct from p_current_user_message_id::text
    or p_recent_sources->0->>'role' is distinct from 'user' then
    raise exception using errcode='42501',
      constraint='seyeon_g1_positive_scope_exceeded',
      message='Positive model lineage exceeds the approved source scope';
  end if;

  -- Both operations happen inside this single SECURITY DEFINER call.
  -- A later failure rolls back the recent-source certificate as well.
  v_recent:=seyeon_private.pin_model_recent_sources_v1(
    p_subject_id,p_thread_id,p_turn_id,p_attempt_id,
    p_current_user_message_id,p_recent_sources,p_model_source_census_digest
  );
  v_memory:=public.cmd_mark_seyeon_positive_context_ready_pinned_v1(
    p_subject_id,p_thread_id,p_turn_id,p_attempt_id,
    p_record_id,p_original_grant_id,p_record_type,p_schema_version,
    p_projector_version,p_selected_sources_digest,p_projected_memory_digest,
    p_final_model_context_digest,p_expected_record_pg_digest
  );
  -- Verify both pins are now on the very same running/ready Attempt.
  select a.seyeon_recent_source_pin_jsonb,
         a.seyeon_personal_source_pin_jsonb
    into v_stored
  from public.chat_turn_attempts a
  join public.chat_turns t on t.id=a.turn_id and t.subject_id=a.subject_id
  where a.id=p_attempt_id and a.subject_id=p_subject_id
    and a.turn_id=p_turn_id and a.state='running'
    and t.state='context_ready'
  for share;
  if not found
    or v_stored.seyeon_recent_source_pin_jsonb is distinct from v_recent
    or v_stored.seyeon_personal_source_pin_jsonb
       is distinct from jsonb_build_object('positiveProof',v_memory) then
    raise exception using errcode='42501',
      constraint='seyeon_g1_combined_attempt_mismatch',
      message='Combined positive model source Pin was not committed';
  end if;
  return jsonb_build_object('recentSourceProof',v_recent,'positiveProof',v_memory);
end
$combined$;

alter function seyeon_private.pin_positive_model_context_sources_v1(
  uuid,uuid,uuid,uuid,uuid,jsonb,text,
  uuid,uuid,text,text,text,text,text,text,text
) owner to myeongha_seyeon_chat_runtime_owner;

revoke all on function seyeon_private.pin_positive_model_context_sources_v1(
  uuid,uuid,uuid,uuid,uuid,jsonb,text,
  uuid,uuid,text,text,text,text,text,text,text
) from public,anon,authenticated,service_role,myeongha_api_executor;

revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
