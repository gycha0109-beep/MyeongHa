-- R2-H unit 3: independent isolated PG17 1540 only; no 1520/1530 required.
-- Entire migration, both narrow roles, and all synthetic rows rollback.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
\ir ../../scripts/operations/seyeon-r2-h-1540-catalog-readonly.sql
\ir ../../supabase/migrations/1540_saju_source_proof_nonce_claim_authority_v1.sql
\ir ../../scripts/operations/seyeon-r2-h-1540-catalog-readonly.sql
\ir seyeon_r2_h_1540_synthetic.sql
ROLLBACK;
\ir ../../scripts/operations/seyeon-r2-h-1540-catalog-readonly.sql
