-- Watchtower-Track: security
-- Forward-only narrow extension of 1171; existing deletion and state rules retained.
begin;
create or replace function public.tr_chat_turn_attempt_progression_guard()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  -- The only new terminal update is postgres-owned delivery metadata.
  -- Comparing the entire JSON row minus these three fields keeps ALL current
  -- and future source/model/validation/identity columns immutable.
  if current_user='postgres' and old.state='committed'
     and (to_jsonb(old)-array['seyeon_positive_delivery_receipt_hash',
       'seyeon_positive_delivery_issued_at','seyeon_positive_delivery_received_at'])
       = (to_jsonb(new)-array['seyeon_positive_delivery_receipt_hash',
       'seyeon_positive_delivery_issued_at','seyeon_positive_delivery_received_at']) then
    return new;
  end if;
  if (
    current_user = (
      select pg_catalog.pg_get_userbyid(p.proowner)
      from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure(
        'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
      )
    )
    and coalesce(
      nullif(
        pg_catalog.current_setting('myeongha.account_deletion_finalizer_subject_id', true),
        ''
      )::uuid = old.subject_id,
      false
    )
  ) then
    return new;
  end if;

  if row(old.turn_id, old.subject_id, old.attempt_no, old.started_at)
     is distinct from
     row(new.turn_id, new.subject_id, new.attempt_no, new.started_at) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_identity_immutable',
      message = 'chat turn attempt identity is immutable';
  end if;

  if old.state in ('failed_retryable', 'failed_final', 'committed')
     and row(old.*) is distinct from row(new.*) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_terminal_immutable',
      message = 'terminal chat turn attempt is immutable';
  end if;

  if old.state is distinct from new.state then
    if not (
      (old.state = 'running' and new.state in ('generated', 'failed_retryable', 'failed_final'))
      or (old.state = 'generated' and new.state in ('validated', 'failed_retryable', 'failed_final'))
      or (old.state = 'validated' and new.state in ('committed', 'failed_retryable', 'failed_final'))
    ) then
      raise exception using
        errcode = '23514',
        constraint = 'tr_chat_turn_attempt_state_transition',
        message = 'chat turn attempt state transition is not allowed';
    end if;
  end if;

  if old.generated_at is not null
     and row(
       old.generation_ai_execution_log_id,
       old.generated_thread_character_id,
       old.generated_character_content_bundle_id,
       old.generated_body_text,
       old.generated_message_payload_jsonb,
       old.generated_message_schema_version,
       old.generated_content_hash,
       old.grounding_refs_jsonb,
       old.generated_at
     ) is distinct from row(
       new.generation_ai_execution_log_id,
       new.generated_thread_character_id,
       new.generated_character_content_bundle_id,
       new.generated_body_text,
       new.generated_message_payload_jsonb,
       new.generated_message_schema_version,
       new.generated_content_hash,
       new.grounding_refs_jsonb,
       new.generated_at
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_generated_payload_immutable',
      message = 'generated chat attempt payload is immutable once staged';
  end if;

  if old.validated_at is not null
     and row(
       old.validation_ai_execution_log_id,
       old.validation_result_jsonb,
       old.validated_at
     ) is distinct from row(
       new.validation_ai_execution_log_id,
       new.validation_result_jsonb,
       new.validated_at
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_validation_immutable',
      message = 'chat attempt validation provenance is immutable once staged';
  end if;

  if old.planner_version is not null and old.planner_version is distinct from new.planner_version then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_planner_version_immutable',
      message = 'planner version is immutable once recorded';
  end if;

  if old.renderer_version is not null and old.renderer_version is distinct from new.renderer_version then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_renderer_version_immutable',
      message = 'renderer version is immutable once recorded';
  end if;

  if old.output_guard_version is not null and old.output_guard_version is distinct from new.output_guard_version then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_guard_version_immutable',
      message = 'output guard version is immutable once recorded';
  end if;

  return new;
end;
$$;
commit;
