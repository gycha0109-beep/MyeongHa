-- R2-H final Cost Governor Unit: 1620, 1630 on 1550..1610 dependencies.
-- Disposable PG17 transaction; no real credentials, service calls or production.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='35s';
SET LOCAL lock_timeout='3s';
\ir ../../scripts/operations/seyeon-r2-h-1620-1630-catalog-readonly.sql
\ir ../../supabase/migrations/1550_seyeon_ai_cost_ledger_v1.sql
\ir ../../supabase/migrations/1560_seyeon_ai_call_lifecycle_v1.sql
\ir ../../supabase/migrations/1570_seyeon_ai_cost_model_observability_v1.sql
\ir ../../supabase/migrations/1580_seyeon_ai_governor_atomic_admission_v1.sql
\ir ../../supabase/migrations/1590_seyeon_ai_governor_atomic_settlement_v1.sql
\ir ../../supabase/migrations/1600_seyeon_ai_governor_rate_card_integrity_v1.sql
\ir ../../supabase/migrations/1610_seyeon_ai_governor_legacy_settlement_guard_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1620-1630-catalog-readonly.sql
\ir ../../supabase/migrations/1620_seyeon_ai_governor_internal_start_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1620-1630-catalog-readonly.sql
\ir ../../supabase/migrations/1630_seyeon_governed_execution_role_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1620-1630-catalog-readonly.sql
ROLLBACK;
\ir ../../scripts/operations/seyeon-r2-h-1620-1630-catalog-readonly.sql
