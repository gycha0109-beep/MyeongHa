-- Atomic postcondition: all 56 migrations applied and private RLS enabled.
do $reader_s4_post$
declare v_count integer;
begin
  select count(*) into v_count from supabase_migrations.schema_migrations m
  where m.version ~ '^[0-9]{4}$'
    and m.version::integer between 1740 and 2290;
  if v_count<>56
     or not exists (
       select 1 from pg_catalog.pg_class c
       where c.oid=pg_catalog.to_regclass('public.official_reader_paid_answer_bodies')
         and c.relrowsecurity and c.relforcerowsecurity
     )
     or not exists (
       select 1 from pg_catalog.pg_class c
       where c.oid=pg_catalog.to_regclass('public.official_reader_paid_answer_purge_jobs_v1')
         and c.relrowsecurity and c.relforcerowsecurity
     )
     or pg_catalog.to_regprocedure(
       'public.internal_list_official_reader_paid_answer_purge_jobs_v1(integer)'
     ) is null
  then raise exception 'S4 scoped migration postcondition failed; rollback required';
  end if;
end
$reader_s4_post$;
