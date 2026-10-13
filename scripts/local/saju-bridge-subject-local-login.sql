-- Disposable Docker Subject principal, never Production. Run after all Supabase migrations.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database() <> 'myeongha_saju_subject_local_verify' OR current_user <> 'postgres'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='myeongha_runtime'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR NOT pg_has_role('myeongha_runtime','myeongha_api_executor','MEMBER')
 THEN RAISE EXCEPTION 'Refusing non-disposable or invalid Subject authority'; END IF;
END $guard$;
ALTER ROLE myeongha_runtime PASSWORD :'subject_password';
