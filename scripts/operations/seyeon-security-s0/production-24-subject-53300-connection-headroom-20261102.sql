-- Watchtower-Track: security
-- 2026-11-02 observed SQLSTATE 53300 (FATAL) for
-- myeongha_seyeon_subject_login at 06:40:49 UTC.
-- Cloudflare Hyperdrive subject configuration has origin_connection_limit=5,
-- which is a SOFT limit and may transiently establish additional connections.
-- Keep connection throttling and RLS unchanged; provide room for brief overlap.
BEGIN;
DO $pre$
DECLARE
  r record;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected migration operator';
  END IF;
  SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolconnlimit
  INTO r
  FROM pg_roles WHERE rolname='myeongha_seyeon_subject_login';
  IF NOT FOUND OR NOT r.rolcanlogin OR r.rolsuper OR r.rolbypassrls
     OR r.rolcreatedb OR r.rolcreaterole OR r.rolconnlimit IS DISTINCT FROM 5
  THEN RAISE EXCEPTION 'Se-yeon Subject connection-role baseline drift'; END IF;

  -- Do not touch the protected billing role, the DB global connection limit,
  -- network origin, authentication or the current session's authorization.
  IF (SELECT rolconnlimit FROM pg_roles
      WHERE rolname='myeongha_seyeon_governed_login') IS DISTINCT FROM 5
  THEN RAISE EXCEPTION 'Se-yeon governed billing role drift'; END IF;
END
$pre$;

ALTER ROLE myeongha_seyeon_subject_login CONNECTION LIMIT 10;

DO $post$
DECLARE r record;
BEGIN
  SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolconnlimit
  INTO r FROM pg_roles WHERE rolname='myeongha_seyeon_subject_login';
  IF NOT FOUND OR NOT r.rolcanlogin OR r.rolsuper OR r.rolbypassrls
    OR r.rolcreatedb OR r.rolcreaterole OR r.rolconnlimit IS DISTINCT FROM 10
    OR (SELECT rolconnlimit FROM pg_roles
        WHERE rolname='myeongha_seyeon_governed_login') IS DISTINCT FROM 5
  THEN RAISE EXCEPTION 'Subject connection headroom postcondition failed'; END IF;
END
$post$;
COMMIT;
