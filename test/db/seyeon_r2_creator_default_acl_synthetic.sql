-- Run ONLY in disposable PostgreSQL 17 CI after repository replay to 1510.
-- Watchtower-Track: ops
-- Reconstruct a synthetic *possible* default ACL mechanism, not historical
-- Proof of who/when/how Production grant was issued. Never run on Production.
\set ON_ERROR_STOP on
BEGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
CREATE FUNCTION public.seyeon_r2_acl_synthetic_probe_v1()
 RETURNS integer LANGUAGE sql AS 'SELECT 1';
REVOKE ALL ON FUNCTION public.seyeon_r2_acl_synthetic_probe_v1() FROM PUBLIC;
ALTER FUNCTION public.seyeon_r2_acl_synthetic_probe_v1()
 OWNER TO myeongha_seyeon_chat_runtime_owner;
DO $proof$
DECLARE
  v_owner_count integer;
  v_service_count integer;
  v_browser_count integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE a.grantee=p.proowner),
    count(*) FILTER (WHERE a.grantee='service_role'::pg_catalog.regrole::oid AND a.privilege_type='EXECUTE'),
    count(*) FILTER (WHERE a.grantee IN ('anon'::pg_catalog.regrole::oid,'authenticated'::pg_catalog.regrole::oid))
  INTO v_owner_count,v_service_count,v_browser_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
  WHERE n.nspname='public' AND p.proname='seyeon_r2_acl_synthetic_probe_v1';
  IF v_owner_count<>1 OR v_service_count<>1 OR v_browser_count<>0 THEN
    RAISE EXCEPTION 'HOLD_R2_DEFAULT_PRIVILEGE_MECHANISM_NOT_REPRODUCED';
  END IF;
END
$proof$;
SELECT 'PASS_R2_SYNTHETIC_POSTGRES_CREATOR_DEFAULT_EXECUTE_NOT_HISTORICAL_ACTOR' AS status;
ROLLBACK;
-- No synthetic fixture/function/default grant persists after rollback.
