-- MyeongHa PHASE O1: Production relationship runtime read authority for Se-yeon vertical slice.
-- Watchtower-Track: character-memory
--
-- This read never creates a relationship baseline and never reconstructs history.
-- It exposes only the already-committed Production V1 current projection needed to
-- pin the relationship revision used for one Character turn.

create or replace function public.qry_production_relationship_runtime_v1(
  p_subject_id uuid,
  p_character_id text
)
returns table (
  state_id uuid,
  subject_id uuid,
  character_id text,
  closeness integer,
  trust integer,
  friction integer,
  attained_stage text,
  current_candidate_stage text,
  current_condition text,
  policy_version text,
  policy_content_hash text,
  policy_state_schema_version text,
  policy_state_jsonb jsonb,
  revision bigint,
  last_interaction_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $production_relationship_runtime_read$
declare
  v_subject_status text;
  v_subject_merged_into uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_subject_id is null
     or nullif(btrim(p_character_id), '') is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_production_relationship_runtime_identity_required',
      message = 'Production relationship runtime identity is required';
  end if;

  select s.status, s.merged_into_subject_id
    into v_subject_status, v_subject_merged_into
  from public.subjects s
  where s.id = p_subject_id;

  if not found
     or v_subject_status is distinct from 'active'
     or v_subject_merged_into is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_production_relationship_runtime_subject_ineligible',
      message = 'Production relationship runtime requires an active canonical Subject';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.character_id = p_character_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_production_relationship_runtime_character_unavailable',
      message = 'Production relationship runtime Character is unavailable';
  end if;

  if exists (
    select 1
    from public.user_character_states s
    where s.subject_id = p_subject_id
      and s.character_id = p_character_id
      and (
        s.policy_version is distinct from 'relationship-policy-v1'
        or s.policy_content_hash is distinct from
          'sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c'
        or s.policy_state_schema_version
             is distinct from 'relationship-policy-state-v1'
        or s.attained_stage is null
        or s.current_candidate_stage is null
        or s.current_condition is null
        or jsonb_typeof(s.policy_state_jsonb) is distinct from 'object'
      )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'qry_production_relationship_runtime_policy_mismatch',
      message = 'Stored relationship projection is not a valid Production V1 runtime projection';
  end if;

  return query
  select
    s.id,
    s.subject_id,
    s.character_id,
    s.closeness,
    s.trust,
    s.friction,
    s.attained_stage,
    s.current_candidate_stage,
    s.current_condition,
    s.policy_version,
    s.policy_content_hash,
    s.policy_state_schema_version,
    s.policy_state_jsonb,
    s.revision,
    s.last_interaction_at,
    s.updated_at
  from public.user_character_states s
  where s.subject_id = p_subject_id
    and s.character_id = p_character_id;
end
$production_relationship_runtime_read$;

grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.qry_production_relationship_runtime_v1(uuid,text)
  owner to myeongha_relationship_apply_owner;

revoke all on function public.qry_production_relationship_runtime_v1(uuid,text)
  from public;

do $production_relationship_runtime_read_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_production_relationship_runtime_v1(uuid,text) from %I',
      v_role
    );
  end loop;
end
$production_relationship_runtime_read_acl$;

grant execute on function public.qry_production_relationship_runtime_v1(uuid,text)
  to myeongha_api_executor;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

comment on function public.qry_production_relationship_runtime_v1(uuid,text) is
  'PHASE O read authority: returns the already-committed Production V1 relationship projection used to pin one Character turn; returns zero rows when no relationship exists and never creates a baseline.';
