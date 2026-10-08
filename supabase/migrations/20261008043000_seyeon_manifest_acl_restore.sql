-- Narrow Production repair for the Se-yeon server-only ContentManifest read.
-- Watchtower-Track: character-memory
-- Reassert the already-approved 1510 grants, without changing roles, ownership,
-- RLS, SECURITY INVOKER semantics, data, or unrelated migration history.

do $guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'myeongha_api_executor'
  ) or pg_catalog.to_regclass('public.content_bundles') is null
     or pg_catalog.to_regclass('public.character_runtime_catalog') is null
     or pg_catalog.to_regprocedure('public.qry_content_bundle_manifest_v1(uuid)') is null
  then
    raise exception 'Se-yeon ContentManifest authority prerequisites are missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure
      and not p.prosecdef
  ) then
    raise exception 'ContentManifest query must remain SECURITY INVOKER';
  end if;
  if not pg_catalog.has_schema_privilege('myeongha_api_executor', 'public', 'USAGE') then
    raise exception 'Se-yeon executor must already have public schema USAGE';
  end if;
end
$guard$;

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

revoke all on function public.qry_content_bundle_manifest_v1(uuid) from public;

do $restrict$
declare
  v_role text;
begin
  for v_role in
    select r.rolname from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_content_bundle_manifest_v1(uuid) from %I',
      v_role
    );
  end loop;
end
$restrict$;

grant execute on function public.qry_content_bundle_manifest_v1(uuid)
  to myeongha_api_executor;

do $verify$
declare
  v_role text;
begin
  if not (
    pg_catalog.has_column_privilege('myeongha_api_executor', 'public.content_bundles', 'id', 'SELECT')
    and pg_catalog.has_column_privilege('myeongha_api_executor', 'public.content_bundles', 'content_version', 'SELECT')
    and pg_catalog.has_column_privilege('myeongha_api_executor', 'public.content_bundles', 'min_client_capability', 'SELECT')
    and pg_catalog.has_column_privilege('myeongha_api_executor', 'public.content_bundles', 'asset_manifest_hash', 'SELECT')
    and pg_catalog.has_column_privilege('myeongha_api_executor', 'public.content_bundles', 'cue_schema_version', 'SELECT')
    and pg_catalog.has_column_privilege('myeongha_api_executor', 'public.character_runtime_catalog', 'content_bundle_id', 'SELECT')
    and pg_catalog.has_column_privilege('myeongha_api_executor', 'public.character_runtime_catalog', 'character_id', 'SELECT')
    and pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
      'EXECUTE'
    )
  ) then
    raise exception 'Se-yeon ContentManifest executor privileges not restored';
  end if;
  for v_role in
    select r.rolname from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
  loop
    if pg_catalog.has_function_privilege(
      v_role,
      'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
      'EXECUTE'
    ) then
      raise exception 'Unauthorized ContentManifest execution privilege retained: %', v_role;
    end if;
  end loop;
end
$verify$;
