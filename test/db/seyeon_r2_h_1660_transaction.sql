-- R2-H/1660 single independent SQL blob, one BEGIN and full ROLLBACK.
-- No 1650 nor 1670–1720, no Production schema/data.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='25s';
SET LOCAL lock_timeout='3s';
\ir ../../scripts/operations/seyeon-r2-h-1660-catalog-readonly.sql
\ir ../../supabase/migrations/1660_member_reader_existing_thread_locator_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1660-catalog-readonly.sql
\ir seyeon_r2_h_1660_synthetic.sql
ROLLBACK;
\ir ../../scripts/operations/seyeon-r2-h-1660-catalog-readonly.sql
