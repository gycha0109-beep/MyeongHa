#!/usr/bin/env bash
set -euo pipefail
# Synthetic first Reader Writer executes ONLY in a disposable PG15 CI database.
[[ "${CI:-}" == "true" && "${PGHOST:-}" == "localhost" &&
   "${PGDATABASE:-}" == "myeongha_standard_b2_initial_bind_test" ]] || {
  echo 'FAIL: isolated initial Standard Reader DB required' >&2; exit 1;
}
temp_sql=$(mktemp)
trap 'rm -f "$temp_sql"' EXIT

# Keep the existing verified synthetic Offer/Receipt/Birth/Grant validation,
# but stop BEFORE the legacy first Reader's specialist Capability INSERT.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
  test/db/official_standard_reading_reader_interpretation.sql > "$temp_sql"

cat test/db/standard_reader_initial_policy_locked_positive.sql >> "$temp_sql"
psql -X -v ON_ERROR_STOP=1 -f "$temp_sql" >/dev/null
