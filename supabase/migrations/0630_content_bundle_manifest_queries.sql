-- MyeongHa bundle-pinned client content manifest read.
--
-- Use Case 11.2 defines the client-facing ContentManifest contract as:
-- contentVersion, minClientCapability, characterIds, assetManifestHash, cueSchemaVersion.
-- This function exposes exactly that bounded projection for an explicit immutable
-- content bundle. characterIds is projected from the normalized immutable
-- character_runtime_catalog rows for the same bundle in deterministic order.
--
-- It deliberately does NOT expose artifact_ref (private immutable resolver key),
-- content_hash, artifact_schema_version, raw manifest_jsonb, release/rollout state,
-- or perform a client-compatibility decision. Source authority does not define an
-- ordering/comparison rule for capability strings nor the client's asset inventory
-- matching contract, so compatibility evaluation remains outside this projection.
-- Retired bundles remain readable for pinned historical reproduction.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_content_bundle_manifest_v1(
  p_content_bundle_id uuid
)
returns table (
  content_version text,
  min_client_capability text,
  character_ids text[],
  asset_manifest_hash text,
  cue_schema_version text
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
      constraint = 'qry_content_bundle_manifest_bundle_required',
      message = 'content bundle is required';
  end if;

  if not exists (
    select 1
    from public.content_bundles cb
    where cb.id = p_content_bundle_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_content_bundle_manifest_bundle_unavailable',
      message = 'content bundle was not found';
  end if;

  return query
  select
    cb.content_version,
    cb.min_client_capability,
    coalesce(
      (
        select array_agg(crc.character_id order by crc.character_id)
        from public.character_runtime_catalog crc
        where crc.content_bundle_id = cb.id
      ),
      array[]::text[]
    ),
    cb.asset_manifest_hash,
    cb.cue_schema_version
  from public.content_bundles cb
  where cb.id = p_content_bundle_id;
end;
$$;

revoke execute on function public.qry_content_bundle_manifest_v1(uuid) from public;
