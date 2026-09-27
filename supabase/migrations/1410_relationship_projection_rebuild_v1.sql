-- MyeongHa PHASE N4: trusted projection rebuild at the same physical history revision.
-- Watchtower-Track: character-memory
--
-- Rebuild is not a relationship occurrence and therefore consumes no new relationship
-- history revision. Ordinary runtime writes still fail closed on projection/history drift.

create or replace function public.cmd_rebuild_relationship_projection_runtime_v1(
  p_subject_id uuid,
  p_character_id text,
  p_expected_revision bigint,
  p_closeness integer,
  p_trust integer,
  p_friction integer,
  p_attained_stage text,
  p_candidate_stage text,
  p_condition text,
  p_policy_version text,
  p_policy_content_hash text,
  p_policy_state_schema_version text,
  p_policy_state_jsonb jsonb,
  p_authority_ref text,
  p_reason text
)
returns table (
  state_id uuid,
  revision bigint,
  closeness integer,
  trust integer,
  friction integer,
  attained_stage text,
  current_candidate_stage text,
  current_condition text,
  policy_version text,
  policy_content_hash text,
  last_interaction_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $relationship_projection_rebuild$
declare
  v_state public.user_character_states%rowtype;
  v_max_history_revision bigint;
  v_now timestamptz := clock_timestamp();
begin
  perform 1
  from public.cmd_lock_relationship_history_context_v1(
    p_subject_id,
    p_character_id
  );

  select s.*
    into v_state
  from public.user_character_states s
  where s.subject_id = p_subject_id
    and s.character_id = p_character_id
  for update;

  if not found
     or p_expected_revision is null
     or v_state.revision is distinct from p_expected_revision then
    raise exception using
      errcode = '40001',
      constraint = 'relationship_projection_rebuild_stale_revision',
      message = 'relationship projection rebuild revision is stale';
  end if;

  select coalesce(max(h.state_revision_after), 0)
    into v_max_history_revision
  from public.relationship_history_entries h
  where h.subject_id = p_subject_id
    and h.character_id = p_character_id;

  if v_max_history_revision is distinct from p_expected_revision
     or p_policy_version is distinct from 'relationship-policy-v1'
     or p_policy_content_hash is distinct from
       'sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c'
     or p_policy_state_schema_version
          is distinct from 'relationship-policy-state-v1'
     or jsonb_typeof(p_policy_state_jsonb) is distinct from 'object'
     or nullif(btrim(p_authority_ref), '') is null
     or nullif(btrim(p_reason), '') is null
     or length(p_reason) > 1200 then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_projection_rebuild_input_invalid',
      message = 'relationship projection rebuild input does not match authoritative history';
  end if;

  update public.user_character_states s
  set closeness = p_closeness,
      trust = p_trust,
      friction = p_friction,
      relationship_stage = p_attained_stage,
      updated_at = v_now,
      attained_stage = p_attained_stage,
      current_candidate_stage = p_candidate_stage,
      current_condition = p_condition,
      policy_version = p_policy_version,
      policy_content_hash = p_policy_content_hash,
      policy_state_schema_version = p_policy_state_schema_version,
      policy_state_jsonb = p_policy_state_jsonb
  where s.id = v_state.id
    and s.revision = p_expected_revision
  returning s.* into v_state;

  if not found then
    raise exception using
      errcode = '40001',
      constraint = 'relationship_projection_rebuild_update_race',
      message = 'relationship projection changed during rebuild';
  end if;

  raise log
    'relationship projection rebuild subject=% character=% revision=% authority=% reason=%',
    p_subject_id,
    p_character_id,
    p_expected_revision,
    p_authority_ref,
    p_reason;

  return query
  select
    v_state.id,
    v_state.revision,
    v_state.closeness,
    v_state.trust,
    v_state.friction,
    v_state.attained_stage,
    v_state.current_candidate_stage,
    v_state.current_condition,
    v_state.policy_version,
    v_state.policy_content_hash,
    v_state.last_interaction_at;
end
$relationship_projection_rebuild$;

grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.cmd_rebuild_relationship_projection_runtime_v1(
  uuid,text,bigint,integer,integer,integer,text,text,text,text,text,text,jsonb,text,text
) owner to myeongha_relationship_apply_owner;

revoke all on function public.cmd_rebuild_relationship_projection_runtime_v1(
  uuid,text,bigint,integer,integer,integer,text,text,text,text,text,text,jsonb,text,text
) from public;

do $relationship_projection_rebuild_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_rebuild_relationship_projection_runtime_v1(uuid,text,bigint,integer,integer,integer,text,text,text,text,text,text,jsonb,text,text) from %I',
      v_role
    );
  end loop;
end
$relationship_projection_rebuild_acl$;

grant execute on function public.cmd_rebuild_relationship_projection_runtime_v1(
  uuid,text,bigint,integer,integer,integer,text,text,text,text,text,text,jsonb,text,text
) to myeongha_api_executor;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

comment on function public.cmd_rebuild_relationship_projection_runtime_v1(
  uuid,text,bigint,integer,integer,integer,text,text,text,text,text,text,jsonb,text,text
) is
  'PHASE N trusted recovery command: replaces only the derived current projection with deterministic replay output at the same append-only physical revision.';
