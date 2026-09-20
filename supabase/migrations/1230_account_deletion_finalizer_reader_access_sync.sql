-- Forward-only account-deletion finalizer sync for Official Reading + Reader access.
--
-- Migration 1171 remains immutable historical migration authority. This migration only
-- replaces the internal finalizer body after the 1210 Reader-access tables exist, so the
-- already-approved DELETE policy remains executable in FK-safe child-before-parent order.
-- Destructive runtime activation remains unchanged; no new EXECUTE grant is added.

create or replace function public.internal_finalize_account_deletion_db_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_lock_owner text
)
returns table (
  finalized boolean,
  replayed boolean,
  auth_mapping_present boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $account_finalizer$
declare
  v_kind text;
  v_status text;
  v_auth_user_id uuid;
  v_job_scope text;
  v_job_status text;
  v_policy_version text;
  v_db_finalized_at timestamptz;
  v_ready boolean;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_deletion_job_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_ids_required',
      message = 'subject and deletion job ids are required';
  end if;

  if p_lock_owner is null or btrim(p_lock_owner) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_lock_owner_required',
      message = 'exact outbox lock owner is required';
  end if;

  select s.kind, s.status, s.auth_user_id
    into v_kind, v_status, v_auth_user_id
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'account_deletion_finalizer_subject_not_found',
      message = 'account deletion Subject was not found';
  end if;

  select dj.scope, dj.status, dj.finalization_policy_version, dj.db_finalized_at
    into v_job_scope, v_job_status, v_policy_version, v_db_finalized_at
  from public.data_deletion_jobs dj
  where dj.id = p_deletion_job_id
    and dj.subject_id = p_subject_id
  for update;

  if not found or v_job_scope is distinct from 'account' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_job_mismatch',
      message = 'account deletion finalizer requires the exact account deletion job';
  end if;

  if v_status = 'deleted' then
    if v_job_status is distinct from 'running'
       or v_policy_version is distinct from 'account-deletion-finalization-v1'
       or v_db_finalized_at is null then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_finalizer_deleted_state_unproven',
        message = 'deleted Subject is missing exact DB-finalization provenance';
    end if;

    perform 1
    from public.outbox_events oe
    where oe.aggregate_type = 'data_deletion_job'
      and oe.aggregate_id = p_deletion_job_id::text
      and oe.event_type = 'ACCOUNT_DELETION_STARTED'
      and oe.status = 'processing'
      and oe.lock_owner = btrim(p_lock_owner)
      and oe.lease_expires_at > clock_timestamp()
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_finalizer_replay_lease_mismatch',
        message = 'DB-finalizer replay requires the current ACCOUNT_DELETION_STARTED lease owner';
    end if;

    return query
    select true, true, (v_auth_user_id is not null);
    return;
  end if;

  if v_kind is distinct from 'member'
     or v_status is distinct from 'deletion_pending'
     or v_job_status is distinct from 'running'
     or v_policy_version is not null
     or v_db_finalized_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_state_mismatch',
      message = 'account deletion DB finalizer requires an unfinalized deletion_pending Member';
  end if;

  -- Serialize the exact worker lease row across the destructive DB transaction.
  perform 1
  from public.outbox_events oe
  where oe.aggregate_type = 'data_deletion_job'
    and oe.aggregate_id = p_deletion_job_id::text
    and oe.event_type = 'ACCOUNT_DELETION_STARTED'
  for update;

  select pf.db_preconditions_met
    into v_ready
  from public.internal_account_deletion_finalization_preflight_v1(
    p_subject_id,
    p_deletion_job_id,
    p_lock_owner
  ) pf;

  if v_ready is distinct from true then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_preflight_failed',
      message = 'account deletion DB finalizer preflight failed closed';
  end if;

  -- Transaction-local trigger context. It is reset before returning and rolls back on any
  -- error. Ordinary trigger behavior remains unchanged outside this function.
  perform pg_catalog.set_config(
    'myeongha.account_deletion_finalizer_subject_id',
    p_subject_id::text,
    true
  );

  set constraints all deferred;

  -- Break FK cycles while the target Subject is still locked and the finalizer context is active.
  update public.birth_profiles
  set current_revision_id = null,
      updated_at = v_now
  where subject_id = p_subject_id
    and current_revision_id is not null;

  update public.reading_sessions
  set current_reading_id = null,
      state = case when state = 'active' then 'cancelled' else state end,
      updated_at = v_now
  where subject_id = p_subject_id;

  update public.readings
  set parent_reading_id = null,
      committed_execution_attempt_id = null,
      execution_status = 'failed',
      completed_at = coalesce(completed_at, v_now)
  where subject_id = p_subject_id;

  update public.chat_turn_attempts
  set state = 'failed_final',
      generation_ai_execution_log_id = null,
      validation_ai_execution_log_id = null,
      generated_thread_character_id = null,
      generated_character_content_bundle_id = null,
      committed_message_id = null,
      finished_at = coalesce(finished_at, v_now),
      error_code = coalesce(error_code, 'account_deleted')
  where subject_id = p_subject_id;

  update public.chat_turns
  set state = 'failed_final',
      committed_attempt_id = null,
      error_code = coalesce(error_code, 'account_deleted'),
      updated_at = v_now
  where subject_id = p_subject_id;

  update public.life_facts
  set supersedes_fact_id = null
  where subject_id = p_subject_id
    and supersedes_fact_id is not null;

  -- Delete approved DELETE-class rows in FK-safe child-before-parent order.
  -- Standard Reading access/interpretation rows reference retained Purchase/Entitlement
  -- evidence plus personal Birth/Reading rows, so remove every Reader-access child before
  -- official Reading provenance and the underlying Reading/Birth rows.
  delete from public.standard_reading_reader_access_grants where subject_id = p_subject_id;
  delete from public.standard_reading_reader_interpretations where subject_id = p_subject_id;
  delete from public.standard_reading_official_bindings where subject_id = p_subject_id;
  delete from public.standard_reading_unit_bindings where subject_id = p_subject_id;
  delete from public.episode_progress_events where subject_id = p_subject_id;
  delete from public.user_episode_progress where subject_id = p_subject_id;
  delete from public.relationship_events where subject_id = p_subject_id;
  delete from public.user_character_states where subject_id = p_subject_id;

  delete from public.notification_delivery_attempts where subject_id = p_subject_id;
  delete from public.notification_deliveries where subject_id = p_subject_id;
  delete from public.notification_settings where subject_id = p_subject_id;
  delete from public.notification_preferences where subject_id = p_subject_id;
  delete from public.device_installations where subject_id = p_subject_id;
  delete from public.notifications where subject_id = p_subject_id;
  delete from public.character_unlocks where subject_id = p_subject_id;
  delete from public.world_events where subject_id = p_subject_id;

  delete from public.share_artifacts where subject_id = p_subject_id;
  delete from public.ai_execution_groundings where subject_id = p_subject_id;
  delete from public.reading_groundings where subject_id = p_subject_id;
  delete from public.reading_refs where subject_id = p_subject_id;
  delete from public.reading_execution_attempts where subject_id = p_subject_id;
  delete from public.readings where subject_id = p_subject_id;
  delete from public.reading_sessions where subject_id = p_subject_id;

  delete from public.record_access_grants where subject_id = p_subject_id;
  delete from public.memory_proposals where subject_id = p_subject_id;
  delete from public.memory_items where subject_id = p_subject_id;
  delete from public.life_facts where subject_id = p_subject_id;

  delete from public.ai_execution_logs where subject_id = p_subject_id;
  delete from public.conversation_messages where subject_id = p_subject_id;
  delete from public.chat_turn_attempts where subject_id = p_subject_id;
  delete from public.chat_turns where subject_id = p_subject_id;
  delete from public.conversation_thread_content_transitions where subject_id = p_subject_id;
  delete from public.conversation_thread_characters ctc
  using public.conversation_threads ct
  where ctc.thread_id = ct.id
    and ct.subject_id = p_subject_id;
  delete from public.conversation_threads where subject_id = p_subject_id;

  delete from public.target_person_profiles where subject_id = p_subject_id;
  delete from public.birth_profile_revisions where subject_id = p_subject_id;
  delete from public.birth_profiles where subject_id = p_subject_id;
  delete from public.profiles where subject_id = p_subject_id;

  -- RETAIN Commerce evidence but revoke live provider-account authority. This preserves
  -- the approved P5Y evidence row while preventing a deleted Subject from remaining
  -- attached to an active provider account.
  update public.commerce_account_links
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, v_now)
  where subject_id = p_subject_id
    and status = 'active';

  -- ANONYMIZE merge provenance before deleting any guest session reachable through either
  -- Subject FK. Keep categorical audit semantics while removing resource identifiers,
  -- conflict payloads, and dedupe material.
  update public.subject_merge_actions sma
  set action_dedupe_key = 'anonymized:' || sma.id::text,
      source_resource_id = 'anonymized',
      target_resource_id = case
        when sma.target_resource_id is null then null
        else 'anonymized'
      end
  where sma.merge_job_id in (
    select smj.id
    from public.subject_merge_jobs smj
    where smj.guest_subject_id = p_subject_id
       or smj.member_subject_id = p_subject_id
       or smj.guest_session_id in (
         select gs.id
         from public.guest_sessions gs
         where gs.subject_id = p_subject_id
            or gs.claimed_by_subject_id = p_subject_id
       )
  );

  update public.subject_merge_jobs smj
  set guest_session_id = null,
      conflicts_jsonb = '{}'::jsonb,
      resolution_jsonb = null,
      idempotency_key = 'anonymized:' || smj.id::text
  where smj.guest_subject_id = p_subject_id
     or smj.member_subject_id = p_subject_id
     or smj.guest_session_id in (
       select gs.id
       from public.guest_sessions gs
       where gs.subject_id = p_subject_id
          or gs.claimed_by_subject_id = p_subject_id
     );

  delete from public.guest_sessions
  where subject_id = p_subject_id
     or claimed_by_subject_id = p_subject_id;

  -- ANONYMIZE every deletion-job tombstone for this Subject without changing lifecycle
  -- status. The active account job remains running until hosted Auth cleanup is acknowledged.
  update public.data_deletion_jobs dj
  set target_resource_type = case when dj.scope = 'account' then null else 'anonymized' end,
      target_resource_id = case when dj.scope = 'account' then null else 'anonymized:' || dj.id::text end,
      request_dedupe_key = 'anonymized:' || dj.id::text,
      retention_exceptions_jsonb = null,
      error_code = null
  where dj.subject_id = p_subject_id;

  update public.data_deletion_jobs
  set finalization_policy_version = 'account-deletion-finalization-v1',
      db_finalized_at = v_now
  where id = p_deletion_job_id
    and subject_id = p_subject_id;

  -- Subject is the retained anonymized tombstone required by retained Commerce FKs.
  -- auth_user_id intentionally remains until hosted Auth deletion succeeds.
  update public.subjects
  set status = 'deleted',
      merged_into_subject_id = null,
      updated_at = v_now
  where id = p_subject_id;

  -- Validate all deferred FK/constraint triggers before the function returns and restore
  -- the caller-visible constraint mode to IMMEDIATE.
  set constraints all immediate;

  perform pg_catalog.set_config(
    'myeongha.account_deletion_finalizer_subject_id',
    '',
    true
  );

  return query
  select true, false, (v_auth_user_id is not null);
end;
$account_finalizer$;


revoke all on function public.internal_finalize_account_deletion_db_v1(uuid, uuid, text) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_finalize_account_deletion_db_v1(uuid,uuid,text) from %I',
      v_role
    );
  END LOOP;
END
$$;
