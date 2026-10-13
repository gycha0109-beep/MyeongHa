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
# Two independent backend sessions; pg_stat_activity confirms lock contention
# on the real Attempt before asserting the test-only XOR outcome.
bash test/db/seyeon_positive_source_set_exact_attempt_race_v1.sh
# Two actual independent PostgreSQL backends must block on the same Attempt
# before observing opposite Zero/Positive Pin outcomes.
bash test/db/seyeon_positive_source_set_exact_attempt_race_v1.sh
SEYEON_POSITIVE_GRANT_REAL_PG=1   ./node_modules/.bin/vitest run     test/seyeon-controlled-disclosure-real-postgres-candidate.test.ts test/seyeon-source-digest-node-postgres-golden-v1.test.ts --maxWorkers=1
echo 'PASS: positive Pin -> test Commit -> real PG HTTP grant reveal and Node/Postgres D-03 dual-serializer golden vectors in disposable CI DB'
