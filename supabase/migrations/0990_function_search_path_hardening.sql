-- Public trigger/constraint function execution-context hardening.
--
-- Supabase Security Advisor reports these MyeongHa-owned zero-argument public
-- trigger/constraint functions with mutable search_path. Pin them to the same
-- deterministic execution context used by existing runtime hardening migrations.
-- This migration preserves SECURITY INVOKER semantics and existing function ACLs.

alter function public.ct_validate_grounding_source()
  set search_path = pg_catalog, public;

alter function public.ct_validate_life_fact_supersession()
  set search_path = pg_catalog, public;

alter function public.ct_validate_memory_item_source_character()
  set search_path = pg_catalog, public;

alter function public.ct_validate_memory_proposal_source_character()
  set search_path = pg_catalog, public;

alter function public.ct_validate_reading_finalize()
  set search_path = pg_catalog, public;

alter function public.ct_validate_reading_request_authority()
  set search_path = pg_catalog, public;

alter function public.ct_validate_reading_session_authority()
  set search_path = pg_catalog, public;

alter function public.ct_validate_subject_merge_edge()
  set search_path = pg_catalog, public;

alter function public.ct_validate_subject_merge_job_parties()
  set search_path = pg_catalog, public;

alter function public.ct_validate_target_profile_kind()
  set search_path = pg_catalog, public;

alter function public.tr_birth_revision_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_chat_turn_attempt_progression_guard()
  set search_path = pg_catalog, public;

alter function public.tr_reading_grounding_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_reading_ref_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_reading_request_identity_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_reading_session_identity_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_reject_immutable_projection_mutation()
  set search_path = pg_catalog, public;

alter function public.tr_terminal_reading_execution_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_validate_character_unlock_identity()
  set search_path = pg_catalog, public;

alter function public.tr_validate_data_deletion_job_identity()
  set search_path = pg_catalog, public;

alter function public.tr_validate_device_installation_identity()
  set search_path = pg_catalog, public;

alter function public.tr_validate_episode_progress_identity()
  set search_path = pg_catalog, public;

alter function public.tr_validate_notification_delivery_attempt_update()
  set search_path = pg_catalog, public;

alter function public.tr_validate_notification_delivery_identity()
  set search_path = pg_catalog, public;

alter function public.tr_validate_share_artifact_update()
  set search_path = pg_catalog, public;

DO $$
DECLARE
  v_function text;
  v_config text;
  v_security_definer boolean;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'ct_validate_grounding_source',
    'ct_validate_life_fact_supersession',
    'ct_validate_memory_item_source_character',
    'ct_validate_memory_proposal_source_character',
    'ct_validate_reading_finalize',
    'ct_validate_reading_request_authority',
    'ct_validate_reading_session_authority',
    'ct_validate_subject_merge_edge',
    'ct_validate_subject_merge_job_parties',
    'ct_validate_target_profile_kind',
    'tr_birth_revision_immutable',
    'tr_chat_turn_attempt_progression_guard',
    'tr_reading_grounding_immutable',
    'tr_reading_ref_immutable',
    'tr_reading_request_identity_immutable',
    'tr_reading_session_identity_immutable',
    'tr_reject_immutable_projection_mutation',
    'tr_terminal_reading_execution_immutable',
    'tr_validate_character_unlock_identity',
    'tr_validate_data_deletion_job_identity',
    'tr_validate_device_installation_identity',
    'tr_validate_episode_progress_identity',
    'tr_validate_notification_delivery_attempt_update',
    'tr_validate_notification_delivery_identity',
    'tr_validate_share_artifact_update'
  ]
  LOOP
    SELECT coalesce(pg_catalog.array_to_string(p.proconfig, ','), ''), p.prosecdef
      INTO v_config, v_security_definer
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_function
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Search-path hardening target function missing: %', v_function;
    END IF;

    IF v_security_definer THEN
      RAISE EXCEPTION 'Search-path hardening target unexpectedly became SECURITY DEFINER: %', v_function;
    END IF;

    IF v_config NOT LIKE '%search_path=pg_catalog, public%' THEN
      RAISE EXCEPTION 'Search-path hardening target % has unsafe proconfig: %',
        v_function, v_config;
    END IF;
  END LOOP;
END
$$;