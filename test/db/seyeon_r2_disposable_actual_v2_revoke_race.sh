#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: security
# Two independent PostgreSQL sessions against the REAL existing v2->v1->core
# command, with only synthetic positive admission functions in scratch DB.
if [[ "${CI:-}" != "true" || "${PGHOST:-}" != "localhost" ||
      "${PGDATABASE:-}" != "myeongha_seyeon_positive_pin_candidate_test" ]]; then
  echo 'HOLD: G2 rehearsal requires exact disposable CI PostgreSQL database' >&2
  exit 2
fi
# R1's already-reviewed exact-Attempt & XOR fixture is a prerequisite.
bash test/db/seyeon_r1_disposable_positive_source_xor.sh
# DB-authoritative original JSONB digest must not be confused with Node
# canonical-json projection hashes. Same REAL exact Attempt, synthetic only.
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-source-digest-node-postgres-golden-v1.test.ts --maxWorkers=1
# Verify real zero-only baseline before changing *only* this disposable clone.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_g2_production_compatibility_catalog_guard_v1.sql
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_g2_legacy_direct_commit_acl_cutover_candidate_v1.sql
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_g2_actual_v2_atomic_positive_candidate_r3.sql
# Only the G1 context-ready portion of R4 is installed; NO G3 Reveal/HTTP.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_g1_atomic_context_only_candidate_r2.sql
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-g2-atomic-original-grant-race-disposable.test.ts --maxWorkers=1
echo 'PASS offline R2 G2 real v2 lock/revoke and outbox rollback; Production G0/G2/G3 still HOLD'
