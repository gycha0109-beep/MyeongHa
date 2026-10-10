-- G1-B2/ZERO: Se-yeon pre-Provider durable zero-personal-record evidence.
-- Watchtower-Track: security
-- Owner-controlled, forward-only, no positive personal-record admission.
-- G2 exact Grant row locking and G3 Reveal/replay remain HOLD (#1843).
alter table public.chat_turn_attempts
  add column seyeon_personal_source_pin_jsonb jsonb null,
  add column seyeon_personal_source_pinned_at timestamptz null;

alter table public.chat_turn_attempts
  add constraint chat_attempt_seyeon_source_pin_shape_v1
  check (
    (seyeon_personal_source_pin_jsonb is null
      and seyeon_personal_source_pinned_at is null)
    or
    (seyeon_personal_source_pin_jsonb is not null
      and jsonb_typeof(seyeon_personal_source_pin_jsonb) = 'object'
      and seyeon_personal_source_pinned_at is not null)
  );

-- Runs alongside existing progression/terminal immutable trigger.
-- Existing failed/committed attempts remain intact, without retroactive pins.
create function public.tr_seyeon_zero_source_pin_immutable_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $pin_trigger$
begin
  if old.seyeon_personal_source_pin_jsonb is not null and
     (old.seyeon_personal_source_pin_jsonb is distinct from
        new.seyeon_personal_source_pin_jsonb or
      old.seyeon_personal_source_pinned_at is distinct from
        new.seyeon_personal_source_pinned_at) then
    raise exception using
      errcode='23514',
      constraint='seyeon_source_pin_immutable',
      message='Se-yeon attempt source pin cannot be changed';
  end if;
  if old.seyeon_personal_source_pin_jsonb is null and
     new.seyeon_personal_source_pin_jsonb is not null and
     (old.state <> 'running' or new.state <> 'running') then
    raise exception using
      errcode='23514',
      constraint='seyeon_source_pin_must_precede_generation',
      message='Se-yeon source pin must be stored during running state';
  end if;
  -- SQL-side final safety net for Se-yeon: never Commit an unpinned attempt,
  -- nor a generated validation proof unrelated to its durable source pin.
  if old.state = 'validated' and new.state = 'committed' and
     new.planner_version = 'seyeon-production-chat-planner-v1' then
    if old.seyeon_personal_source_pin_jsonb is null or
       old.seyeon_personal_source_pin_jsonb #> '{zeroProof,records}' <>
         '[]'::jsonb or
       old.validation_result_jsonb -> 'personalRecordProvenance' is distinct from
         old.seyeon_personal_source_pin_jsonb -> 'zeroProof' then
      raise exception using
        errcode='23514',
        constraint='seyeon_commit_requires_original_zero_source_pin',
        message='Se-yeon Chat Commit requires matching durable zero-source evidence';
    end if;
  end if;
  return new;
end
$pin_trigger$;

create trigger tr_seyeon_zero_source_pin_immutable_v1
before update on public.chat_turn_attempts
for each row execute function public.tr_seyeon_zero_source_pin_immutable_v1();

create function public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
  p_subject_id uuid, p_turn_id uuid, p_attempt_id uuid,
  p_source_proof_jsonb jsonb
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $mark_seyeon_chat_context_ready_pinned$
declare
  v_thread_id uuid;
  v_turn_state text;
  v_attempt_state text;
  v_planner_version text;
  v_existing jsonb;
  v_zero jsonb;
  v_selection jsonb;
  v_zero_keys integer;
  v_selection_keys integer;
  v_replayed boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_subject_id is null or p_turn_id is null or p_attempt_id is null or
     jsonb_typeof(p_source_proof_jsonb) is distinct from 'object' or
     (select count(*) from pg_catalog.jsonb_object_keys(p_source_proof_jsonb)) <> 2 then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_invalid',
      message='Se-yeon pre-model proof must contain only two governed markers';
  end if;
  v_zero := p_source_proof_jsonb -> 'zeroProof';
  v_selection := p_source_proof_jsonb -> 'exactModelSourceSelection';
  if jsonb_typeof(v_zero) is distinct from 'object' or
     jsonb_typeof(v_selection) is distinct from 'object' then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_invalid',
      message='Se-yeon pre-model markers are required';
  end if;
  select count(*) into v_zero_keys from pg_catalog.jsonb_object_keys(v_zero);
  select count(*) into v_selection_keys from pg_catalog.jsonb_object_keys(v_selection);

  if v_zero_keys <> 14 or v_selection_keys <> 8 or
     v_zero ->> 'schemaVersion' is distinct from 'seyeon-attempt-zero-personal-proof-v1' or
     v_zero ->> 'source' is distinct from 'server-composed-context' or
     v_zero ->> 'subjectId' is distinct from p_subject_id::text or
     v_zero ->> 'turnId' is distinct from p_turn_id::text or
     v_zero ->> 'attemptId' is distinct from p_attempt_id::text or
     v_zero ->> 'characterId' is distinct from 'seyeon' or
     v_zero ->> 'recordState' is distinct from 'explicit_zero_admitted' or
     v_zero -> 'recordCount' is distinct from '0'::jsonb or
     v_zero -> 'records' is distinct from '[]'::jsonb or
     v_zero -> 'permitsAtomicPersonalRecordCommit' is distinct from 'false'::jsonb or
     v_zero -> 'permitsHttpReveal' is distinct from 'false'::jsonb or
     coalesce(v_zero ->> 'unsupportedSchemaCount', '') !~ '^(0|[1-9][0-9]*)$' or
     coalesce(v_zero ->> 'proofDigest','') !~ '^sha256:v1:[a-f0-9]{64}$' or
     v_selection ->> 'version' is distinct from 'seyeon-exact-model-personal-source-selection-v1' or
     v_selection -> 'selectedPersonalRecordCount' is distinct from '0'::jsonb or
     v_selection -> 'selectedSources' is distinct from '[]'::jsonb or
     v_selection -> 'persistedBeforeModel' is distinct from 'false'::jsonb or
     v_selection -> 'permitsAtomicCommit' is distinct from 'false'::jsonb or
     v_selection -> 'permitsHttpReveal' is distinct from 'false'::jsonb or
     coalesce(v_selection ->> 'selectedMemoryCount','') !~ '^(0|[1-9][0-9]*)$' or
     (v_selection ->> 'selectedMemoryCount')::integer > 16 or
     coalesce(v_selection ->> 'selectedSourcesDigest','') !~ '^sha256:v1:[a-f0-9]{64}$' then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_invalid',
      message='Se-yeon only allows exact zero-personal-source pre-model markers';
  end if;

  -- Same lock order as the existing core context_ready authority.
  select t.thread_id, t.state
    into v_thread_id, v_turn_state
  from public.chat_turns t
  where t.id=p_turn_id and t.subject_id=p_subject_id
  for update;
  if not found or v_zero ->> 'threadId' is distinct from v_thread_id::text then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_scope_invalid',
      message='Se-yeon source pin does not match the authoritative turn';
  end if;
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(
    p_subject_id,v_thread_id
  );
  select a.state,a.planner_version,a.seyeon_personal_source_pin_jsonb
    into v_attempt_state,v_planner_version,v_existing
  from public.chat_turn_attempts a
  where a.id=p_attempt_id and a.turn_id=p_turn_id and a.subject_id=p_subject_id
  for update;
  if not found or v_planner_version is distinct from
      'seyeon-production-chat-planner-v1' then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_attempt_invalid',
      message='Se-yeon source pin requires the original running attempt';
  end if;

  if v_existing is not null then
    if v_existing is distinct from p_source_proof_jsonb or
       v_turn_state is distinct from 'context_ready' or
       v_attempt_state is distinct from 'running' then
      raise exception using errcode='23505',
        constraint='seyeon_zero_source_pin_replay_conflict',
        message='Se-yeon source proof replay conflicts with original pin';
    end if;
    return true;
  end if;
  if v_turn_state is distinct from 'planned' or
     v_attempt_state is distinct from 'running' then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_state_invalid',
      message='Se-yeon source pin requires a planned running attempt';
  end if;

  update public.chat_turn_attempts
  set seyeon_personal_source_pin_jsonb=p_source_proof_jsonb,
      seyeon_personal_source_pinned_at=clock_timestamp()
  where id=p_attempt_id and turn_id=p_turn_id and subject_id=p_subject_id;

  -- Under this same PostgreSQL invocation/transaction, either BOTH pin and
  -- context_ready are persisted, or neither is persisted.
  v_replayed := public.cmd_mark_chat_turn_context_ready_v1(
    p_subject_id,p_turn_id,p_attempt_id
  );
  if v_replayed then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_unexpected_replay',
      message='Se-yeon context-ready transitioned without an original pin';
  end if;
  return false;
end
$mark_seyeon_chat_context_ready_pinned$;

-- Transfer wrapper to the existing NOLOGIN Se-yeon runtime owner.
grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
  uuid,uuid,uuid,jsonb
) owner to myeongha_seyeon_chat_runtime_owner;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;

revoke all on function public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
  uuid,uuid,uuid,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
  uuid,uuid,uuid,jsonb
) to myeongha_api_executor;

-- Legacy no-Pin entry must not be available to the API runtime executor.
revoke execute on function public.cmd_mark_seyeon_chat_context_ready_runtime_v1(
  uuid,uuid,uuid
) from myeongha_api_executor;
comment on function public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
  uuid,uuid,uuid,jsonb
) is 'G1-B2 zero-only, immutable pre-model attempt source Pin + context-ready atomic command; positive Grant, Commit and Reveal remain HOLD.';
