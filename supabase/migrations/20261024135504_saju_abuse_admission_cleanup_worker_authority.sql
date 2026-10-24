-- Use the existing restricted worker login and system executor; no new credential.
-- The managed postgres principal retains ADMIN-only platform membership, not SET/INHERIT.
GRANT myeongha_saju_admission_owner TO current_user;
GRANT EXECUTE ON FUNCTION public.cmd_cleanup_saju_abuse_admission_buckets_v1()
  TO myeongha_system_executor;
REVOKE myeongha_saju_admission_owner FROM current_user;
