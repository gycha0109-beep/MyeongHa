#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: character-memory
# G1/G2/G3 owner-candidate integration, not a Production permission.
# ALL state is disposable inside run_isolated_case database; no external AI.
if [[ "${CI:-}" != true || "${PGHOST:-}" != localhost ||
      "${PGDATABASE:-}" != myeongha_seyeon_positive_pin_candidate_test ]]; then
  echo 'FAIL: positive current-Grant HTTP candidate requires isolated CI DB' >&2
  exit 2
fi
psql -X -v ON_ERROR_STOP=1   -f test/db/seyeon_positive_grant_attempt_bound_candidate_v1.sql
# R1 parent+edge verification operates only on this disposable fixture database.
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/seyeon_positive_source_set_parent_edge_candidate_v1.sql
# Two actual independent PostgreSQL backends must block on the same Attempt
# before observing opposite Zero/Positive Pin outcomes.
bash test/db/seyeon_positive_source_set_exact_attempt_race_v1.sh
# G1 Owner-style stage receipts exist ONLY in this isolated, resettable DB.
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/seyeon_positive_g1_owner_dispatch_receipt_candidate_v1.sql
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/seyeon_positive_g2_atomic_revoke_candidate_v1.sql
SEYEON_POSITIVE_GRANT_REAL_PG=1   ./node_modules/.bin/vitest run     test/seyeon-controlled-disclosure-real-postgres-candidate.test.ts test/seyeon-source-digest-node-postgres-golden-v1.test.ts test/seyeon-offline-r2-real-db-source-boundary-v1.test.ts test/seyeon-g1-g2-disposable-db-claims.test.ts --maxWorkers=1
# Existing Production G2 v2/1640/legacy remain zero-only: explicit no-go
# inspection after the synthetic G1/G2 tests. Never promote fixture commits.
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/seyeon_g2_production_compatibility_catalog_guard_v1.sql
# Test the candidate privilege cutover only AFTER the baseline catalog proof.
# Production v1/v2, app credentials and migration history are never changed.
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/seyeon_g2_legacy_direct_commit_acl_cutover_candidate_v1.sql
# Actual v2/v1/core writes and both outboxes, with G2 exact original Grant
# held until the same PostgreSQL transaction commits. Synthetic fixtures only.
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/seyeon_g2_actual_v2_atomic_positive_candidate_r3.sql
# G1 original Pin + actual core ContextReady share one PostgreSQL RPC;
# G3 first/Replay consult CURRENT original Grant against stored real Chat.
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/seyeon_g1_g3_atomic_context_and_reveal_candidate_r4.sql
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-g2-real-v2-atomic-disposable.test.ts --maxWorkers=1
echo 'PASS: positive Pin -> test Commit -> real PG HTTP grant reveal and Node/Postgres D-03 dual-serializer golden vectors in disposable CI DB'
