\set ON_ERROR_STOP on

-- RR-03 dormant provenance schema/security regression.
-- This test deliberately DOES NOT fabricate a committed Saju Assistant message.
-- A SQL shape, model-generated Unit ref, or existing AI grounding UUID must not
-- create a current DB-validated follow-up anchor.

do $verify$
declare
  v_table oid;
  v_rls record;
  v_role text;
begin
  v_table := pg_catalog.to_regclass(
    'public.official_reader_assistant_saju_provenance'
  );
  if v_table is null then
    raise exception 'Official Reader Assistant provenance sidecar is absent';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
  into strict v_rls
  from pg_catalog.pg_class c
  where c.oid = v_table;

  if not v_rls.relrowsecurity or not v_rls.relforcerowsecurity then
    raise exception 'Official Reader Assistant provenance sidecar must FORCE RLS';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename='official_reader_assistant_saju_provenance'
  ) then
    raise exception 'RR-03 dormant sidecar must not expose a runtime policy';
  end if;

  for v_role in
    select r.rolname from pg_catalog.pg_roles r
    where r.rolname in (
      'anon','authenticated','service_role','myeongha_api_executor'
    )
  loop
    if pg_catalog.has_table_privilege(
      v_role::name, v_table, 'SELECT'
    ) or pg_catalog.has_table_privilege(
      v_role::name, v_table, 'INSERT'
    ) or pg_catalog.has_table_privilege(
      v_role::name, v_table, 'UPDATE'
    ) or pg_catalog.has_table_privilege(
      v_role::name, v_table, 'DELETE'
    ) then
      raise exception 'Unauthorized role % has Reader provenance table access', v_role;
    end if;
  end loop;

  if (select count(*) from public.official_reader_assistant_saju_provenance)
      <> 0 then
    raise exception 'Dormant Reader provenance table must start with no rows';
  end if;

  if pg_catalog.to_regprocedure(
    'public.qry_official_reader_followup_anchor_runtime_v1(uuid,uuid,text,uuid)'
  ) is not null then
    raise exception 'An unreviewed Reader follow-up read function must not be exposed';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = v_table
      and t.tgname = 'tr_official_reader_provenance_immutable_v1'
      and not t.tgisinternal
  ) then
    raise exception 'Reader provenance mutation trigger missing';
  end if;

  raise notice 'PASS RR-03 dormant sidecar has FKs, forced RLS, no runtime ACL or writer/query';
end
$verify$;

do $verify_refs$
declare
  v_unit text := 'grounding_unit_0123456789abcdef01234567';
  v_other text := 'grounding_unit_abcdef0123456789abcdef01';
begin
  if not public.internal_official_reader_source_refs_valid_v1(
    array[v_unit, v_other], 'unit'
  ) then
    raise exception 'Valid source-bound Unit pair rejected';
  end if;

  if public.internal_official_reader_source_refs_valid_v1(
    array[v_unit, v_unit], 'unit'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array['00000000-0000-0000-0000-000000000000'], 'unit'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array['grounding_unit_NOT_TRUSTED'], 'unit'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array[]::text[], 'unit'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array[v_unit, null], 'unit'
  ) then
    raise exception 'Untrusted, empty, malformed or duplicate Unit refs admitted';
  end if;

  if not public.internal_official_reader_source_refs_valid_v1(
    array[]::text[], 'disclosure'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array['explicit','explicit'], 'disclosure'
  ) then
    raise exception 'Disclosure refs empty-or-distinct contract broken';
  end if;

  raise notice 'PASS RR-03 source Unit syntax excludes legacy AI UUID and duplicates';
end
$verify_refs$;
