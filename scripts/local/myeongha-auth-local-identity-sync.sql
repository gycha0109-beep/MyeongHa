-- Disposable bridge between the independent local GoTrue DB and the app DB.
-- Only the Auth UUID is mirrored, using a role that cannot read or update rows.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database() <> 'myeongha_saju_subject_local_verify' OR current_user <> 'postgres'
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables
       WHERE table_schema='auth' AND table_name='users') THEN
    RAISE EXCEPTION 'Refusing local identity sync role outside the disposable app DB';
  END IF;
END
$guard$;
CREATE ROLE myeongha_local_auth_sync
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'sync_password';
GRANT USAGE ON SCHEMA auth TO myeongha_local_auth_sync;
GRANT INSERT (id) ON TABLE auth.users TO myeongha_local_auth_sync;
DO $verify$
BEGIN
  IF NOT has_column_privilege('myeongha_local_auth_sync', 'auth.users', 'id', 'INSERT')
     OR has_table_privilege('myeongha_local_auth_sync', 'auth.users', 'SELECT')
     OR has_table_privilege('myeongha_local_auth_sync', 'auth.users', 'UPDATE') THEN
    RAISE EXCEPTION 'Local identity sync role has excess or missing authority';
  END IF;
END
$verify$;
