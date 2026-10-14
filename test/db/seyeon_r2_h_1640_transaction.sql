-- G1/R2-H 1640 independent disposable PG17: apply, guarded trigger test, rollback.
-- Source 1640 blob pinned, no other held 1520..1720, no Production.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
\ir ../../scripts/operations/seyeon-r2-h-1640-catalog-readonly.sql
\ir ../../supabase/migrations/1640_seyeon_zero_personal_source_pre_model_pin_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1640-catalog-readonly.sql
\ir seyeon_r2_h_1640_synthetic.sql
ROLLBACK;
\ir ../../scripts/operations/seyeon-r2-h-1640-catalog-readonly.sql
