-- R2-H 1550..1570 isolated PG17; locked forward-only Source migrations.
-- Preserves sequential dependencies, 5 catalog states and a full rollback.
-- 1580..1720 / remote-only bundle never executed.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
\ir ../../scripts/operations/seyeon-r2-h-1550-1570-catalog-readonly.sql
\ir ../../supabase/migrations/1550_seyeon_ai_cost_ledger_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1550-1570-catalog-readonly.sql
\ir seyeon_r2_h_1550_synthetic.sql
\ir ../../supabase/migrations/1560_seyeon_ai_call_lifecycle_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1550-1570-catalog-readonly.sql
\ir seyeon_r2_h_1560_synthetic.sql
\ir ../../supabase/migrations/1570_seyeon_ai_cost_model_observability_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1550-1570-catalog-readonly.sql
ROLLBACK;
\ir ../../scripts/operations/seyeon-r2-h-1550-1570-catalog-readonly.sql
