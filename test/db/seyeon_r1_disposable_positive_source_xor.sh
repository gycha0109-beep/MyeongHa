#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: security
# R1 exact positive source pin and zero/positive XOR rehearsal.
# Disposable database only; no production DDL, API enablement, or model calls.
if [[ "${CI:-}" != "true" || "${PGHOST:-}" != "localhost" ||
      "${PGDATABASE:-}" != "myeongha_seyeon_positive_pin_candidate_test" ]]; then
  echo 'HOLD: R1 positive Pin validation requires the named disposable CI PostgreSQL database' >&2
  exit 2
fi
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_positive_grant_attempt_bound_candidate_v1.sql
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_positive_source_set_parent_edge_candidate_v1.sql
bash test/db/seyeon_positive_source_set_exact_attempt_race_v1.sh
echo 'PASS: disposable actual-Attempt Parent/Edge, exact Original Grant, revoke/regrant, and two independent PG lock races. G0/G1/G2/G3 Production remain HOLD.'
