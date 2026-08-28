-- MyeongHa bundle-pinned Episode content authority reads.
--
-- These functions expose episode catalog/participant rows recorded for an explicit
-- immutable content bundle. They deliberately do NOT resolve a subject's current
-- release, Episode progress row, Character Unlock state, client capability, or
-- per-episode emergency availability. Those are separate authorities.
--
-- SRC-01 remains open. catalog_enabled is returned as the value projected into the
-- specified bundle and is not treated here as a current operational kill-switch
-- decision. SRC-11 also remains open because this slice does not select one of a
-- subject's potentially multiple bundle-pinned Episode progress rows.
--
-- Retired bundles remain readable so existing pinned progress/thread provenance can
-- be reproduced. P0-AUTH-01 remains unresolved; SECURITY INVOKER is retained and
-- PUBLIC EXECUTE is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_episode_bundle_catalog_v1(
  p_content_bundle_id uuid
)
returns table (
  episode_id text,
  catalog_enabled boolean,
  release_at timestamptz,
  retire_at timestamptz,
  min_client_capability text
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
      constraint = 'qry_episode_bundle_catalog_bundle_required',
      message = 'content bundle is required';
  end if;

  if not exists (
    select 1
    from public.content_bundles cb
    where cb.id = p_content_bundle_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_episode_bundle_catalog_bundle_unavailable',
      message = 'content bundle was not found';
  end if;

  return query
  select
    erc.episode_id,
    erc.enabled,
    erc.release_at,
    erc.retire_at,
    erc.min_client_capability
  from public.episode_runtime_catalog erc
  where erc.content_bundle_id = p_content_bundle_id
  order by erc.episode_id;
end;
$$;

create or replace function public.qry_episode_bundle_participants_v1(
  p_content_bundle_id uuid,
  p_episode_id text
)
returns table (
  character_id text,
  role text
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
      constraint = 'qry_episode_bundle_participants_bundle_required',
      message = 'content bundle is required';
  end if;

  if p_episode_id is null or btrim(p_episode_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_episode_bundle_participants_episode_required',
      message = 'episode id is required';
  end if;

  if not exists (
    select 1
    from public.content_bundles cb
    where cb.id = p_content_bundle_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_episode_bundle_participants_bundle_unavailable',
      message = 'content bundle was not found';
  end if;

  if not exists (
    select 1
    from public.episode_runtime_catalog erc
    where erc.content_bundle_id = p_content_bundle_id
      and erc.episode_id = p_episode_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_episode_bundle_participants_episode_unavailable',
      message = 'episode was not found in this content bundle';
  end if;

  return query
  select
    ep.character_id,
    ep.role
  from public.episode_participants ep
  where ep.content_bundle_id = p_content_bundle_id
    and ep.episode_id = p_episode_id
  order by ep.character_id;
end;
$$;

revoke execute on function public.qry_episode_bundle_catalog_v1(uuid) from public;
revoke execute on function public.qry_episode_bundle_participants_v1(uuid, text) from public;
