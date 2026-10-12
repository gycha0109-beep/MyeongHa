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
SEYEON_POSITIVE_GRANT_REAL_PG=1   ./node_modules/.bin/vitest run     test/seyeon-controlled-disclosure-real-postgres-candidate.test.ts --maxWorkers=1
echo 'PASS: positive source Pin -> test Commit -> current-Grant HTTP authorized/held via real PostgreSQL on disposable CI DB'
