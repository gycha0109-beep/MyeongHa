-- MyeongHa current relationship projection read authority.
--
-- API_CONTRACT §14 exposes only the current relationship projection. This query
-- reads user_character_states directly and never reconstructs state from the
-- relationship event ledger or invents a baseline when no projection exists.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_character_relationship_v1(
  p_subject_id uuid,
  p_character_id text
)
returns table (
  state_id uuid,
  character_id text,
  closeness integer,
  trust integer,
  friction integer,
  relationship_stage text,
  policy_version text,
  revision bigint,
  last_interaction_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null or nullif(btrim(p_character_id), '') is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_character_relationship_identity_required',
      message = 'relationship subject/character identity is required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_relationship_subject_ineligible',
      message = 'relationship read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.character_id = p_character_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_relationship_character_not_found',
      message = 'character was not found';
  end if;

  return query
  select
    s.id,
    s.character_id,
    s.closeness,
    s.trust,
    s.friction,
    s.relationship_stage,
    s.policy_version,
    s.revision,
    s.last_interaction_at,
    s.updated_at
  from public.user_character_states s
  where s.subject_id = p_subject_id
    and s.character_id = p_character_id;
end;
$$;

revoke execute on function public.qry_character_relationship_v1(uuid, text) from public;
