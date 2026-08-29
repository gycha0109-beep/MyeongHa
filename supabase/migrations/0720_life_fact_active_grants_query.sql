-- MyeongHa current explicit Life Fact grant projection.
--
-- Primary Use Case UC-19 requires users to inspect and control personal-record
-- sharing scope. The authority model represents that scope as explicit
-- character-by-character record_access_grants for both Life Facts and Memories.
-- This supporting DB projection exposes only the currently active permission
-- rows attached to one owned, non-revoked Life Fact.
--
-- Supersession and grant lifecycle are independent authorities: a superseded
-- Life Fact may remain historical provenance while an explicit grant row still
-- exists. This query therefore does not invent a "current fact" filter. Character
-- Context Assembly separately excludes superseded facts from current context.
-- Likewise, a retired character may still have an active historical permission
-- row; runtime eligibility is a separate authority.
--
-- This does not create/regrant permissions (SRC-10), define positive Life Fact
-- type/value schemas (SRC-25), or create a new HTTP route. P0-AUTH-01 remains
-- unresolved; SECURITY INVOKER is retained and PUBLIC EXECUTE is revoked.

create or replace function public.qry_life_fact_active_grants_v1(
  p_subject_id uuid,
  p_life_fact_id uuid
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
      constraint = 'qry_life_fact_active_grants_subject_required',
      message = 'Life Fact grant subject is required';
  end if;

  if p_life_fact_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_life_fact_active_grants_fact_required',
      message = 'Life Fact is required';
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
      constraint = 'qry_life_fact_active_grants_subject_ineligible',
      message = 'Life Fact grant read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.life_facts lf
    where lf.id = p_life_fact_id
      and lf.subject_id = p_subject_id
      and lf.revoked_at is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_life_fact_active_grants_fact_unavailable',
      message = 'active Life Fact was not found for this subject';
  end if;

  return query
  select
    g.id,
    g.grantee_character_id,
    g.grant_reason,
    g.granted_at
  from public.record_access_grants g
  where g.subject_id = p_subject_id
    and g.life_fact_id = p_life_fact_id
    and g.revoked_at is null
  order by g.granted_at, g.grantee_character_id, g.id;
end;
$$;

revoke execute on function public.qry_life_fact_active_grants_v1(uuid, uuid) from public;
