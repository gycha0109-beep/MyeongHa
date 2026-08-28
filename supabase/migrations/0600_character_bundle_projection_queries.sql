-- MyeongHa bundle-pinned Character content authority reads.
--
-- These functions expose the catalog/capability rows recorded for an explicit
-- immutable content bundle. They deliberately do NOT resolve a subject's current
-- release, Character Unlock state, client capability, Saju operational runtime,
-- or per-character emergency availability. Those are separate authorities.
--
-- In particular, SRC-01 remains open. catalog_enabled/catalog_availability are
-- returned as the values projected into the specified bundle and are not treated
-- here as a current operational kill-switch decision. Retired bundles remain
-- readable so existing pinned thread/progress provenance can be reproduced.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_character_bundle_catalog_v1(
  p_content_bundle_id uuid
)
returns table (
  character_id text,
  catalog_availability text,
  catalog_enabled boolean,
  release_at timestamptz,
  retire_at timestamptz,
  catalog_published_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_content_bundle_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_character_bundle_catalog_bundle_required',
      message = 'content bundle is required';
  end if;

  if not exists (
    select 1
    from public.content_bundles cb
    where cb.id = p_content_bundle_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_bundle_catalog_bundle_unavailable',
      message = 'content bundle was not found';
  end if;

  return query
  select
    crc.character_id,
    crc.availability,
    crc.enabled,
    crc.release_at,
    crc.retire_at,
    crc.published_at
  from public.character_runtime_catalog crc
  where crc.content_bundle_id = p_content_bundle_id
  order by crc.character_id;
end;
$$;

create or replace function public.qry_character_bundle_capabilities_v1(
  p_content_bundle_id uuid,
  p_character_id text
)
returns table (
  saju_domain text,
  role text,
  can_initiate boolean,
  capability_version text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_content_bundle_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_character_bundle_capabilities_bundle_required',
      message = 'content bundle is required';
  end if;

  if p_character_id is null or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_character_bundle_capabilities_character_required',
      message = 'character id is required';
  end if;

  if not exists (
    select 1
    from public.content_bundles cb
    where cb.id = p_content_bundle_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_bundle_capabilities_bundle_unavailable',
      message = 'content bundle was not found';
  end if;

  if not exists (
    select 1
    from public.character_runtime_catalog crc
    where crc.content_bundle_id = p_content_bundle_id
      and crc.character_id = p_character_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_bundle_capabilities_character_unavailable',
      message = 'character was not found in this content bundle';
  end if;

  return query
  select
    cc.saju_domain,
    cc.role,
    cc.can_initiate,
    cc.capability_version
  from public.character_capabilities cc
  where cc.content_bundle_id = p_content_bundle_id
    and cc.character_id = p_character_id
  order by cc.saju_domain;
end;
$$;

revoke execute on function public.qry_character_bundle_catalog_v1(uuid) from public;
revoke execute on function public.qry_character_bundle_capabilities_v1(uuid, text) from public;
