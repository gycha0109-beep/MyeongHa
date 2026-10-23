-- R2-H 1580→1590 with prerequisite 1550→1560→1570 in disposable PG17.
-- One full rollback restores 1510 + two timestamped migrations.
-- No 1600..1720 or remote-only bundle executed.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='35s';
SET LOCAL lock_timeout='3s';
\ir ../../scripts/operations/seyeon-r2-h-1580-1590-catalog-readonly.sql
\ir ../../supabase/migrations/1550_seyeon_ai_cost_ledger_v1.sql
\ir ../../supabase/migrations/1560_seyeon_ai_call_lifecycle_v1.sql
\ir ../../supabase/migrations/1570_seyeon_ai_cost_model_observability_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1580-1590-catalog-readonly.sql
\ir ../../supabase/migrations/1580_seyeon_ai_governor_atomic_admission_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1580-1590-catalog-readonly.sql
\ir seyeon_r2_h_1580_synthetic.sql
\ir ../../supabase/migrations/1590_seyeon_ai_governor_atomic_settlement_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1580-1590-catalog-readonly.sql
\ir seyeon_r2_h_1590_synthetic.sql
ROLLBACK;
\ir ../../scripts/operations/seyeon-r2-h-1580-1590-catalog-readonly.sql
