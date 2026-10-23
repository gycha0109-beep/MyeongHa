-- R2-H/1530 isolated forward replay, not deployment authority.
-- 1520 dependency remains active while 1530 is applied, then a nested rollback.
-- A final full rollback restores the original 1510+timestamped state.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
\ir ../../scripts/operations/seyeon-r2-h-1530-catalog-readonly.sql
\ir ../../supabase/migrations/1520_account_deletion_finalizer_relationship_runtime_sync.sql
\ir ../../scripts/operations/seyeon-r2-h-1530-catalog-readonly.sql
SAVEPOINT before_artifact_1530;
\ir ../../supabase/migrations/1530_character_reading_artifact_durable_commit_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1530-catalog-readonly.sql
ROLLBACK TO SAVEPOINT before_artifact_1530;
\ir ../../scripts/operations/seyeon-r2-h-1530-catalog-readonly.sql
ROLLBACK;
\ir ../../scripts/operations/seyeon-r2-h-1530-catalog-readonly.sql
