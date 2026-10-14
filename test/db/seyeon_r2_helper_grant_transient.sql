-- PG17 disposable fixture only: simulate precisely one extra privileged
-- grant on the already-created helper; return metadata hashes and ROLLBACK.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE myeongha_seyeon_chat_runtime_owner;
GRANT EXECUTE ON FUNCTION public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)
 TO service_role;
RESET ROLE;
\ir ../../scripts/operations/seyeon-r2-acl-grants-canonical-readonly.sql
ROLLBACK;
