-- MyeongHa current explicit Memory grant projection.
--
-- API_CONTRACT §13 exposes GET /api/memories/:id/grants. The authoritative
-- product model stores character-by-character explicit read permission in
-- record_access_grants; revoked grants cease to authorize Context Assembly
-- immediately. This query therefore returns only currently active grant rows
-- for one owned, non-revoked Memory Item.
--
-- A retired character may still have an active historical permission row. The
-- grant remains visible/revocable until explicitly revoked; character runtime
-- eligibility is a separate authority. Revoked Memory Items are not readable
-- through this current-permission projection. Historical revoked grant rows stay
-- in the database but are not current access.
--
-- This does not resolve Memory Proposal retention (SRC-05), create/grant policy,
-- or destructive privacy deletion. P0-AUTH-01 remains open; SECURITY INVOKER is
-- retained and PUBLIC EXECUTE is revoked.

create or replace function public.qry_memory_active_grants_v1(
  p_subject_id uuid,
  p_memory_item_id uuid
)
returns table (
  grant_id uuid,
  character_id text,
  grant_reason text,
  granted_at timestamptz
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
      constraint = 'qry_memory_active_grants_subject_required',
      message = 'memory grant subject is required';
  end if;

  if p_memory_item_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_memory_active_grants_memory_required',
      message = 'memory item is required';
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
      constraint = 'qry_memory_active_grants_subject_ineligible',
      message = 'memory grant read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.memory_items mi
    where mi.id = p_memory_item_id
      and mi.subject_id = p_subject_id
      and mi.revoked_at is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_memory_active_grants_memory_unavailable',
      message = 'active memory item was not found for this subject';
  end if;

  return query
  select
    g.id,
    g.grantee_character_id,
    g.grant_reason,
    g.granted_at
  from public.record_access_grants g
  where g.subject_id = p_subject_id
    and g.memory_item_id = p_memory_item_id
    and g.revoked_at is null
  order by g.granted_at, g.grantee_character_id, g.id;
end;
$$;

revoke execute on function public.qry_memory_active_grants_v1(uuid, uuid) from public;
