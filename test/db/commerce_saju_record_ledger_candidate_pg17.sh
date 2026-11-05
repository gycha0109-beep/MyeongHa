#!/usr/bin/env bash
set -euo pipefail
# Read and mutate candidate-only tables in a disposable CI PostgreSQL 17,
# always inside one SQL transaction that rolls back.
db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ "${GITHUB_ACTIONS:-}" != true || "${DB_SUITE:-}" != postgres17 ||
      "${PGHOST:-}" != localhost || "${PGPORT:-}" != 5432 ||
      ! "$db" =~ ^myeongha_ci_case_[0-9]+$ ||
      ! "$version" =~ ^17[0-9]{4}$ ]]; then
  echo 'HOLD_SAJU_LEDGER_REQUIRES_DISPOSABLE_PG17' >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -f test/db/commerce_saju_record_ledger_candidate_pg17.sql
