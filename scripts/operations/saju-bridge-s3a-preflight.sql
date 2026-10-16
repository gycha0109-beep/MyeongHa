-- Read-only catalog/authority preflight inside the SAME implicit psql --single-transaction.
-- Changes below are transaction-local safety settings, not persistent database settings.
set local lock_timeout = '5s';
set local statement_timeout = '90s';
set local idle_in_transaction_session_timeout = '60s';

do $s3a_preflight$
declare
  v_count bigint;
begin
  if current_database() <> 'postgres'
    or current_user <> 'postgres'
    or current_setting('server_version_num')::integer / 10000 <> 17
  then
    raise exception 'S3A HOLD: incorrect database, executor or PostgreSQL major';
  end if;
  if not coalesce((
    select s.ssl from pg_catalog.pg_stat_ssl s
    where s.pid = pg_catalog.pg_backend_pid()
  ), false) then
    raise exception 'S3A HOLD: backend SSL not proven';
  end if;
  if pg_catalog.to_regnamespace('saju_bridge_private') is not null
    or pg_catalog.to_regclass('saju_bridge_private.operator_permits_v1') is not null
    or pg_catalog.to_regclass('saju_bridge_private.audit_events_v1') is not null
    or exists (
      select 1 from pg_catalog.pg_roles
      where rolname in (
        'myeongha_saju_bridge_permit_owner',
        'myeongha_saju_bridge_permit_executor'
      )
    )
    or exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'saju_bridge_private'
    )
  then
    raise exception 'S3A HOLD: schema/role/function already exists; never reapply';
  end if;
  select count(*) into v_count from supabase_migrations.schema_migrations;
  if v_count <> 173
    or (select max(version)
      from supabase_migrations.schema_migrations
      where version ~ '^[0-9]{14}$') is distinct from '20261008090417'
    or exists (select 1 from supabase_migrations.schema_migrations
               where version in ('1540', '1730'))
  then
    raise exception 'S3A HOLD: remote migration history diverged';
  end if;
end;
$s3a_preflight$;
