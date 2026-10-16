-- All assertions run BEFORE COMMIT in the SAME psql --single-transaction
-- as exactly the pinned 1730 SQL proposal. Any failure rolls everything back.
do $s3a_verify$
declare
  v_fn oid;
  v_role text;
  v_table text;
  v_rel oid;
  v_ns oid;
  v_count bigint;
begin
  v_ns := pg_catalog.to_regnamespace('saju_bridge_private');
  if v_ns is null then raise exception 'S3A HOLD: private schema absent'; end if;

  select p.oid into v_fn
  from pg_catalog.pg_proc p
  where p.pronamespace = v_ns
    and p.proname = 'cmd_consume_operator_permit_v1'
    and pg_catalog.pg_get_function_identity_arguments(p.oid)
      = 'p_permit_id uuid, p_project_ref text, p_scope_digest text, p_owner_intent_digest text, p_myeongha_sha text, p_saju_sha text, p_audit_event_id uuid, p_audit_digest text';
  if v_fn is null
    or (select count(*) from pg_catalog.pg_proc where pronamespace = v_ns) <> 1
  then raise exception 'S3A HOLD: unexpected private function signature or count'; end if;

  if (select count(*) from pg_catalog.pg_roles
      where rolname in ('myeongha_saju_bridge_permit_owner',
        'myeongha_saju_bridge_permit_executor')
        and not rolcanlogin and not rolsuper and not rolcreatedb
        and not rolcreaterole and not rolinherit
        and not rolreplication and not rolbypassrls) <> 2
  then raise exception 'S3A HOLD: role security flags differ'; end if;

  if not pg_catalog.has_schema_privilege('myeongha_saju_bridge_permit_owner',
      v_ns, 'USAGE')
    or not pg_catalog.has_schema_privilege('myeongha_saju_bridge_permit_executor',
      v_ns, 'USAGE')
    or pg_catalog.has_schema_privilege('myeongha_saju_bridge_permit_owner',
      v_ns, 'CREATE')
  then raise exception 'S3A HOLD: private schema grant mismatch'; end if;

  for v_table in select unnest(array['operator_permits_v1','audit_events_v1'])
  loop
    select c.oid into v_rel from pg_catalog.pg_class c
      where c.relnamespace = v_ns and c.relname = v_table
        and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity
        and c.relowner = 'myeongha_saju_bridge_permit_owner'::regrole;
    if v_rel is null then
      raise exception 'S3A HOLD: private table missing/RLS/owner mismatch: %', v_table;
    end if;
    for v_role in select rolname from pg_catalog.pg_roles
      where rolname in ('anon','authenticated','service_role',
        'myeongha_api_executor','myeongha_runtime','myeongha_worker_runtime',
        'myeongha_saju_bridge_permit_executor')
    loop
      if pg_catalog.has_table_privilege(v_role, v_rel, 'SELECT')
        or pg_catalog.has_table_privilege(v_role, v_rel, 'INSERT')
        or pg_catalog.has_table_privilege(v_role, v_rel, 'UPDATE')
        or pg_catalog.has_table_privilege(v_role, v_rel, 'DELETE')
      then raise exception 'S3A HOLD: forbidden table permission for %', v_role; end if;
    end loop;
  end loop;

  select count(*) into v_count
    from saju_bridge_private.operator_permits_v1;
  if v_count <> 0 then raise exception 'S3A HOLD: permits not empty'; end if;
  select count(*) into v_count
    from saju_bridge_private.audit_events_v1;
  if v_count <> 0 then raise exception 'S3A HOLD: audit events not empty'; end if;

  if (select count(*) from pg_catalog.pg_class c
      where c.relnamespace = v_ns and c.relkind in ('r', 'p', 'v', 'm', 'f')) <> 2
    or (select count(*) from pg_catalog.pg_policy p
        where p.polrelid in (
          'saju_bridge_private.operator_permits_v1'::regclass,
          'saju_bridge_private.audit_events_v1'::regclass)) <> 2
  then raise exception 'S3A HOLD: table/policy count mismatch'; end if;

  if (select p.proowner from pg_catalog.pg_proc p where p.oid=v_fn)
       <> 'myeongha_saju_bridge_permit_owner'::regrole
    or (select p.prosecdef from pg_catalog.pg_proc p where p.oid=v_fn) is distinct from true
    or (select p.provolatile from pg_catalog.pg_proc p where p.oid=v_fn) <> 'v'
    or exists (select 1
      from pg_catalog.pg_proc p, lateral pg_catalog.aclexplode(p.proacl) x
      where p.oid=v_fn and x.grantee=0 and x.privilege_type='EXECUTE')
    or not pg_catalog.has_function_privilege(
      'myeongha_saju_bridge_permit_executor',v_fn,'EXECUTE')
  then raise exception 'S3A HOLD: private function owner/EXECUTE mismatch'; end if;

  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_runtime','myeongha_worker_runtime')
  loop
    if pg_catalog.has_schema_privilege(v_role,v_ns,'USAGE')
      or pg_catalog.has_function_privilege(v_role,v_fn,'EXECUTE')
    then raise exception 'S3A HOLD: function/schema exposed to %', v_role; end if;
  end loop;

  if pg_catalog.pg_has_role('postgres',
       'myeongha_saju_bridge_permit_owner','MEMBER')
    or pg_catalog.pg_has_role(
       'myeongha_saju_bridge_permit_executor',
       'myeongha_saju_bridge_permit_owner','MEMBER')
  then raise exception 'S3A HOLD: unexpected role membership'; end if;

  select count(*) into v_count from supabase_migrations.schema_migrations;
  if v_count <> 173 or exists (
    select 1 from supabase_migrations.schema_migrations
    where version in ('1540', '1730')
  ) then raise exception 'S3A HOLD: migration history modified'; end if;
end;
$s3a_verify$;
