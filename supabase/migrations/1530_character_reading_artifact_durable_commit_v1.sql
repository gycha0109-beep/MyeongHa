-- MyeongHa governed Character Reading Artifact durable commit authority V1.
-- Watchtower-Track: topic-face
--
-- This sidecar persists immutable Character-reading artifacts against the
-- authoritative Chat turn/attempt. It does not own Face semantics and it does
-- not reuse Saju reading_refs/reading_groundings.
--
-- The first admitted artifact kind is face_governed_reading. Future Character
-- reading kinds require their own narrow command/policy review.

create table public.character_reading_artifacts (
  id uuid primary key,
  subject_id uuid not null,
  turn_id uuid not null,
  attempt_id uuid not null,
  artifact_kind text not null,
  artifact_schema_version text not null,
  artifact_id text not null,
  artifact_hash text not null,
  character_id text not null,
  source_result_hash text not null,
  authorization_receipt_ref text not null,
  face_bundle_hash text not null,
  handoff_hash text not null,
  reading_plan_ref text not null,
  final_output_hash text not null,
  artifact_jsonb jsonb not null,
  created_at timestamptz not null,
  constraint character_reading_artifacts_turn_kind_unique
    unique (turn_id, artifact_kind),
  constraint character_reading_artifacts_id_subject_unique
    unique (id, subject_id),
  constraint character_reading_artifacts_turn_subject_fk
    foreign key (turn_id, subject_id)
    references public.chat_turns(id, subject_id)
    on delete cascade,
  constraint character_reading_artifacts_attempt_turn_subject_fk
    foreign key (attempt_id, turn_id, subject_id)
    references public.chat_turn_attempts(id, turn_id, subject_id)
    on delete cascade,
  constraint character_reading_artifacts_kind_nonempty
    check (btrim(artifact_kind) <> ''),
  constraint character_reading_artifacts_schema_nonempty
    check (btrim(artifact_schema_version) <> ''),
  constraint character_reading_artifacts_identity_nonempty
    check (
      btrim(artifact_id) <> ''
      and btrim(artifact_hash) <> ''
      and btrim(character_id) <> ''
      and btrim(source_result_hash) <> ''
      and btrim(authorization_receipt_ref) <> ''
      and btrim(face_bundle_hash) <> ''
      and btrim(handoff_hash) <> ''
      and btrim(reading_plan_ref) <> ''
      and btrim(final_output_hash) <> ''
    ),
  constraint character_reading_artifacts_payload_object
    check (jsonb_typeof(artifact_jsonb) = 'object')
);

create index character_reading_artifacts_turn_lookup_idx
  on public.character_reading_artifacts(turn_id, artifact_kind);

alter table public.character_reading_artifacts enable row level security;

create or replace function public.tr_character_reading_artifact_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE'
     and current_user = (
       select pg_catalog.pg_get_userbyid(p.proowner)
       from pg_catalog.pg_proc p
       where p.oid = pg_catalog.to_regprocedure(
         'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
       )
     )
     and coalesce(
       nullif(
         pg_catalog.current_setting(
           'myeongha.account_deletion_finalizer_subject_id',
           true
         ),
         ''
       )::uuid = old.subject_id,
       false
     ) then
    return old;
  end if;

  raise exception using
    errcode = '23514',
    constraint = 'tr_character_reading_artifact_immutable_v1',
    message = 'committed Character reading artifacts are immutable';
end
$$;

create trigger tr_character_reading_artifact_immutable_v1
  before update or delete on public.character_reading_artifacts
  for each row execute function public.tr_character_reading_artifact_immutable_v1();

DO $$
DECLARE
  v_owner_oid oid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_character_reading_artifact_runtime_owner'
  ) THEN
    CREATE ROLE myeongha_character_reading_artifact_runtime_owner
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
  WHERE r.rolname = 'myeongha_character_reading_artifact_runtime_owner'
    AND NOT r.rolcanlogin
    AND NOT r.rolsuper
    AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole
    AND NOT r.rolinherit
    AND NOT r.rolreplication
    AND NOT r.rolbypassrls;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'myeongha_character_reading_artifact_runtime_owner is outside the least-privilege role contract';
  END IF;
END
$$;

grant usage on schema public
  to myeongha_character_reading_artifact_runtime_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_character_reading_artifact_runtime_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_character_reading_artifact_runtime_owner;
grant select on public.chat_turns
  to myeongha_character_reading_artifact_runtime_owner;
grant select on public.chat_turn_attempts
  to myeongha_character_reading_artifact_runtime_owner;
grant select, insert on public.character_reading_artifacts
  to myeongha_character_reading_artifact_runtime_owner;

drop policy if exists character_reading_artifacts_runtime_select_v1
  on public.character_reading_artifacts;
create policy character_reading_artifacts_runtime_select_v1
on public.character_reading_artifacts
for select
to myeongha_character_reading_artifact_runtime_owner
using (
  subject_id = public.current_myeongha_subject_id()
  and artifact_kind = 'face_governed_reading'
);

drop policy if exists character_reading_artifacts_runtime_insert_v1
  on public.character_reading_artifacts;
create policy character_reading_artifacts_runtime_insert_v1
on public.character_reading_artifacts
for insert
to myeongha_character_reading_artifact_runtime_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and artifact_kind = 'face_governed_reading'
);

create or replace function public.cmd_commit_character_face_governed_reading_artifact_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_receipt_id uuid,
  p_artifact_schema_version text,
  p_artifact_id text,
  p_artifact_hash text,
  p_character_id text,
  p_source_result_hash text,
  p_authorization_receipt_ref text,
  p_face_bundle_hash text,
  p_handoff_hash text,
  p_reading_plan_ref text,
  p_final_output_hash text,
  p_artifact_jsonb jsonb
)
returns table (
  receipt_id uuid,
  turn_id uuid,
  attempt_id uuid,
  artifact_id text,
  artifact_hash text,
  character_id text,
  source_result_hash text,
  authorization_receipt_ref text,
  face_bundle_hash text,
  handoff_hash text,
  reading_plan_ref text,
  final_output_hash text,
  artifact_jsonb jsonb,
  created_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_character_face_governed_reading_artifact$
declare
  v_turn_state text;
  v_attempt_state text;
  v_existing public.character_reading_artifacts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_subject_id is null
     or p_turn_id is null
     or p_attempt_id is null
     or p_receipt_id is null
     or nullif(btrim(p_artifact_schema_version), '') is null
     or nullif(btrim(p_artifact_id), '') is null
     or nullif(btrim(p_artifact_hash), '') is null
     or nullif(btrim(p_character_id), '') is null
     or nullif(btrim(p_source_result_hash), '') is null
     or nullif(btrim(p_authorization_receipt_ref), '') is null
     or nullif(btrim(p_face_bundle_hash), '') is null
     or nullif(btrim(p_handoff_hash), '') is null
     or nullif(btrim(p_reading_plan_ref), '') is null
     or nullif(btrim(p_final_output_hash), '') is null
     or jsonb_typeof(p_artifact_jsonb) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'character_face_governed_artifact_input_required',
      message = 'Governed Character Face artifact commit input is incomplete';
  end if;

  if p_artifact_jsonb - array[
       'schemaVersion',
       'artifactId',
       'artifactBuilderVersion',
       'characterId',
       'characterContentVersion',
       'topicKey',
       'sourceContractVersion',
       'sourceAuthorityRef',
       'sourceResultHash',
       'authorizationState',
       'authorizationScope',
       'authorizationReceiptRef',
       'faceBundleHash',
       'handoffHash',
       'readingPlanRef',
       'selectionPolicy',
       'selectedInterpretationIds',
       'selectedLensKeys',
       'protectedInterpretations',
       'followUp',
       'outputGuardVersion',
       'governedOutputGuardVersion',
       'finalizerVersion',
       'finalOutputHash',
       'finalOutput',
       'validationState',
       'commitState',
       'revealState'
     ]::text[] is distinct from '{}'::jsonb then
    raise exception using
      errcode = '23514',
      constraint = 'character_face_governed_artifact_payload_scope_invalid',
      message = 'Governed Character Face artifact payload contains unsupported top-level material';
  end if;

  if p_artifact_jsonb::text ~* '"(rawImage|rawPhoto|rawOriginalPhoto|rawLandmarks|landmarkIndices|faceEmbedding|identityTemplate|highResolutionCrop)"[[:space:]]*:' then
    raise exception using
      errcode = '23514',
      constraint = 'character_face_governed_artifact_biometric_payload_forbidden',
      message = 'Governed Character Face artifact cannot persist raw biometric material';
  end if;

  if p_artifact_jsonb ->> 'schemaVersion'
       is distinct from btrim(p_artifact_schema_version)
     or p_artifact_jsonb ->> 'artifactId'
       is distinct from btrim(p_artifact_id)
     or p_artifact_jsonb ->> 'characterId'
       is distinct from btrim(p_character_id)
     or p_artifact_jsonb ->> 'sourceResultHash'
       is distinct from btrim(p_source_result_hash)
     or p_artifact_jsonb ->> 'authorizationReceiptRef'
       is distinct from btrim(p_authorization_receipt_ref)
     or p_artifact_jsonb ->> 'faceBundleHash'
       is distinct from btrim(p_face_bundle_hash)
     or p_artifact_jsonb ->> 'handoffHash'
       is distinct from btrim(p_handoff_hash)
     or p_artifact_jsonb ->> 'readingPlanRef'
       is distinct from btrim(p_reading_plan_ref)
     or p_artifact_jsonb ->> 'finalOutputHash'
       is distinct from btrim(p_final_output_hash)
     or p_artifact_jsonb ->> 'validationState'
       is distinct from 'semantic_validated'
     or p_artifact_jsonb ->> 'commitState'
       is distinct from 'requires_atomic_commit'
     or p_artifact_jsonb ->> 'revealState'
       is distinct from 'forbidden_before_commit' then
    raise exception using
      errcode = '23514',
      constraint = 'character_face_governed_artifact_payload_binding_invalid',
      message = 'Governed Character Face artifact payload does not match commit identity';
  end if;

  select ct.state
  into v_turn_state
  from public.chat_turns ct
  where ct.id = p_turn_id
    and ct.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'character_face_governed_artifact_turn_unavailable',
      message = 'Governed Character Face artifact turn is unavailable';
  end if;

  if v_turn_state not in ('validated','committed','delivered') then
    raise exception using
      errcode = '23514',
      constraint = 'character_face_governed_artifact_turn_not_validated',
      message = 'Governed Character Face artifact requires a validated or committed turn';
  end if;

  -- Replay is keyed by logical turn + immutable artifact, not by a newly supplied
  -- retry attempt id. This preserves the existing governed artifact contract:
  -- same turn + same artifact returns the original durable receipt.
  select cra.*
  into v_existing
  from public.character_reading_artifacts cra
  where cra.turn_id = p_turn_id
    and cra.artifact_kind = 'face_governed_reading'
  for update;

  if found then
    if v_existing.subject_id is distinct from p_subject_id
       or v_existing.artifact_schema_version is distinct from btrim(p_artifact_schema_version)
       or v_existing.artifact_id is distinct from btrim(p_artifact_id)
       or v_existing.artifact_hash is distinct from btrim(p_artifact_hash)
       or v_existing.character_id is distinct from btrim(p_character_id)
       or v_existing.source_result_hash is distinct from btrim(p_source_result_hash)
       or v_existing.authorization_receipt_ref is distinct from btrim(p_authorization_receipt_ref)
       or v_existing.face_bundle_hash is distinct from btrim(p_face_bundle_hash)
       or v_existing.handoff_hash is distinct from btrim(p_handoff_hash)
       or v_existing.reading_plan_ref is distinct from btrim(p_reading_plan_ref)
       or v_existing.final_output_hash is distinct from btrim(p_final_output_hash)
       or v_existing.artifact_jsonb is distinct from p_artifact_jsonb then
      raise exception using
        errcode = '23505',
        constraint = 'character_face_governed_artifact_replay_conflict',
        message = 'A governed Character Face artifact already exists for this turn with different immutable material';
    end if;

    return query
    select
      v_existing.id,
      v_existing.turn_id,
      v_existing.attempt_id,
      v_existing.artifact_id,
      v_existing.artifact_hash,
      v_existing.character_id,
      v_existing.source_result_hash,
      v_existing.authorization_receipt_ref,
      v_existing.face_bundle_hash,
      v_existing.handoff_hash,
      v_existing.reading_plan_ref,
      v_existing.final_output_hash,
      v_existing.artifact_jsonb,
      v_existing.created_at,
      true;
    return;
  end if;

  -- Only a first commit needs to prove that the supplied attempt is the exact
  -- validated attempt for this turn. Replays above return the original attempt.
  select a.state
  into v_attempt_state
  from public.chat_turn_attempts a
  where a.id = p_attempt_id
    and a.turn_id = p_turn_id
    and a.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'character_face_governed_artifact_attempt_unavailable',
      message = 'Governed Character Face artifact attempt is unavailable';
  end if;

  if v_attempt_state not in ('validated','committed') then
    raise exception using
      errcode = '23514',
      constraint = 'character_face_governed_artifact_attempt_not_validated',
      message = 'Governed Character Face artifact requires a validated or committed attempt';
  end if;

  insert into public.character_reading_artifacts (
    id,
    subject_id,
    turn_id,
    attempt_id,
    artifact_kind,
    artifact_schema_version,
    artifact_id,
    artifact_hash,
    character_id,
    source_result_hash,
    authorization_receipt_ref,
    face_bundle_hash,
    handoff_hash,
    reading_plan_ref,
    final_output_hash,
    artifact_jsonb,
    created_at
  ) values (
    p_receipt_id,
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    'face_governed_reading',
    btrim(p_artifact_schema_version),
    btrim(p_artifact_id),
    btrim(p_artifact_hash),
    btrim(p_character_id),
    btrim(p_source_result_hash),
    btrim(p_authorization_receipt_ref),
    btrim(p_face_bundle_hash),
    btrim(p_handoff_hash),
    btrim(p_reading_plan_ref),
    btrim(p_final_output_hash),
    p_artifact_jsonb,
    v_now
  );

  return query
  select
    p_receipt_id,
    p_turn_id,
    p_attempt_id,
    btrim(p_artifact_id),
    btrim(p_artifact_hash),
    btrim(p_character_id),
    btrim(p_source_result_hash),
    btrim(p_authorization_receipt_ref),
    btrim(p_face_bundle_hash),
    btrim(p_handoff_hash),
    btrim(p_reading_plan_ref),
    btrim(p_final_output_hash),
    p_artifact_jsonb,
    v_now,
    false;
end
$commit_character_face_governed_reading_artifact$;

grant myeongha_character_reading_artifact_runtime_owner to current_user;
grant create on schema public
  to myeongha_character_reading_artifact_runtime_owner;

alter function public.cmd_commit_character_face_governed_reading_artifact_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb
) owner to myeongha_character_reading_artifact_runtime_owner;

revoke all on function public.cmd_commit_character_face_governed_reading_artifact_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb
) from public;

do $character_reading_artifact_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_commit_character_face_governed_reading_artifact_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb) from %I',
      v_role
    );
  end loop;
end
$character_reading_artifact_acl$;

grant execute on function public.cmd_commit_character_face_governed_reading_artifact_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb
) to myeongha_api_executor;
