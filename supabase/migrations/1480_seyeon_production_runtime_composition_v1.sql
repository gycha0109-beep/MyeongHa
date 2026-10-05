-- MyeongHa PHASE R1: exact content bundle manifest read authority for
-- internal Se-yeon Production dogfood composition.
-- Watchtower-Track: character-memory
--
-- This does not decide client/content compatibility, release rollout, fallback,
-- or browser eligibility. It only lets the dedicated server executor reproduce
-- the immutable manifest of one already-pinned bundle.

grant select (
  id,
  content_version,
  min_client_capability,
  asset_manifest_hash,
  cue_schema_version
) on public.content_bundles to myeongha_api_executor;

grant select (
  content_bundle_id,
  character_id
) on public.character_runtime_catalog to myeongha_api_executor;

revoke all on function public.qry_content_bundle_manifest_v1(uuid)
  from public;

do $seyeon_dogfood_manifest_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_content_bundle_manifest_v1(uuid) from %I',
      v_role
    );
  end loop;
end
$seyeon_dogfood_manifest_acl$;

grant execute on function public.qry_content_bundle_manifest_v1(uuid)
  to myeongha_api_executor;

do $seyeon_dogfood_manifest_assert$
begin
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception
      'myeongha_api_executor lost qry_content_bundle_manifest_v1 EXECUTE';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception
      'browser/service roles must not execute the internal bundle manifest read';
  end if;
end
$seyeon_dogfood_manifest_assert$;
