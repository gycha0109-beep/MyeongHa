-- MyeongHa current Character Unlock owner projection.
--
-- UC-14 defines locked-character reveal as a user/world state transition, and
-- the ERD defines character_unlocks as the authoritative current projection.
-- This query exposes only rows that actually exist for the resolved subject;
-- absence is not fabricated as an implicit locked row.
--
-- Character runtime availability/release remains separate content authority.
-- Retired characters therefore keep their stored historical unlock projection,
-- and this query does not interpret SRC-01 operational enable/disable semantics.
-- Internal row identity and source_world_event_id provenance are intentionally
-- omitted from the consumer projection.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_character_unlocks_v1(
  p_subject_id uuid
)
returns table (
  character_id text,
  status text,
  revision bigint,
  unlocked_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_character_unlocks_subject_required',
      message = 'character unlock subject is required';
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
      constraint = 'qry_character_unlocks_subject_ineligible',
      message = 'character unlock read requires an active canonical subject';
  end if;

  return query
  select
    cu.character_id,
    cu.status,
    cu.revision,
    cu.unlocked_at,
    cu.updated_at
  from public.character_unlocks cu
  where cu.subject_id = p_subject_id
  order by cu.character_id;
end;
$$;

revoke execute on function public.qry_character_unlocks_v1(uuid) from public;
