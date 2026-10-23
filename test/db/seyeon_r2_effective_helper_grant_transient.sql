-- One transaction only, disposable PG17. Never run on Production.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
\ir ../../scripts/operations/seyeon-r2-effective-helper-readonly.sql
BEGIN;
SET LOCAL ROLE myeongha_seyeon_chat_runtime_owner;
GRANT EXECUTE ON FUNCTION public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid) TO service_role;
RESET ROLE;
\ir ../../scripts/operations/seyeon-r2-effective-helper-readonly.sql
ROLLBACK;
\ir ../../scripts/operations/seyeon-r2-effective-helper-readonly.sql
