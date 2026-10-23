-- Exclusive, forward-only 1740..2290 Official Reader boundary admission.
-- Executes INSIDE the same --single-transaction as all subsequent DDL.
-- No bypass for the historical remote-only 20261008090417 bundle.
-- Supplied by protected-main execution after validating the paired backup.
-- This value is checked AGAIN within the same transaction as all 56 DDLs.
select pg_catalog.set_config(
  'myeongha.reader_s4.expected_frontier', :'expected_frontier',true
);
do $reader_s4_admission$
declare
  v_missing_predecessor integer;
  v_present_reader integer;
  v_bundle record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('myeongha:production:reader-s4:1740-2290',2026)
  );
  select count(*) into v_missing_predecessor
  from (values ('1400'),('1410'),('1420'),('1430'),('1440'),('1450'),
               ('1650'),('1660'),('1670'),('1680'),('1690'),
               ('1700'),('1710'),('1720')) as required(version)
  where not exists(
    select 1 from supabase_migrations.schema_migrations m
     where m.version=required.version
  );
  if v_missing_predecessor<>0 then
    raise exception 'S4 scoped admission blocked: predecessor history incomplete';
  end if;
  if (select max(version) from supabase_migrations.schema_migrations)
      is distinct from pg_catalog.current_setting(
        'myeongha.reader_s4.expected_frontier',true
      ) then
    raise exception 'S4 scoped admission blocked: backup frontier changed during deployment';
  end if;
  select count(*) into v_present_reader
    from supabase_migrations.schema_migrations m
   where m.version ~ '^[0-9]{4}$'
     and m.version::integer between 1740 and 2290;
  if v_present_reader<>0
     or pg_catalog.to_regclass('public.official_reader_paid_answer_bodies') is not null
     or pg_catalog.to_regclass('public.official_reader_paid_answer_purge_jobs_v1') is not null
     or pg_catalog.to_regprocedure(
       'public.internal_acquire_official_reader_scope_lock_v1(uuid,uuid,text)'
     ) is not null then
    raise exception 'S4 scoped admission blocked: partially installed Reader schema';
  end if;
  select name,cardinality(statements) as n,
    pg_catalog.octet_length(pg_catalog.convert_to(statements[1],'UTF8')) as bytes,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(statements[1],'UTF8')),'hex') as sha
    into v_bundle from supabase_migrations.schema_migrations
   where version='20261008090417';
  if not found or v_bundle.name is distinct from
     'seyeon_runtime_1460_1510_acl_before_owner_recovery'
     or v_bundle.n is distinct from 1
     or v_bundle.bytes is distinct from 104021
     or v_bundle.sha is distinct from
       '4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894'
  then
    raise exception 'S4 scoped admission blocked: remote recovery lineage changed';
  end if;
end
$reader_s4_admission$;
