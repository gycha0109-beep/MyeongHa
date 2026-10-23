-- R2-H unit 1 / 1520: single isolated PG17 session, restricted forward-only rehearsal.
-- Only checked-in 1520 executes, inside a transaction that is ROLLED BACK.
-- Production, remote-only SQL and 1530..1720 are never executed here.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
\ir ../../scripts/operations/seyeon-r2-h-1520-catalog-readonly.sql
\ir ../../supabase/migrations/1520_account_deletion_finalizer_relationship_runtime_sync.sql
\ir ../../scripts/operations/seyeon-r2-h-1520-catalog-readonly.sql
ROLLBACK;
\ir ../../scripts/operations/seyeon-r2-h-1520-catalog-readonly.sql
