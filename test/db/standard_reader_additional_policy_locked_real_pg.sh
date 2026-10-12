#!/usr/bin/env bash
set -euo pipefail

# Disposable DB and verified synthetic receipts ONLY. Never live production.
if [[ "${CI:-}" != "true" || "${PGHOST:-}" != "localhost" ||
      "${PGDATABASE:-}" != "myeongha_standard_b2_real_bind_test" ]]; then
  echo 'FAIL: CAP-B2 real Binder test requires isolated CI PostgreSQL' >&2
  exit 1
fi

tmp_sql=$(mktemp)
trap 'rm -f "$tmp_sql"' EXIT

# Reuse the proven exact first-Reader Purchase/Receipt/Birth/Official Reading/
# committed Saju Source test setup, but stop BEFORE old additional bind.
awk '/^create temp table _v2_additional_result as/{exit} {print}' \
  test/db/official_standard_reading_reader_interpretation.sql > "$tmp_sql"

# Separately verify the NEW private Standard B2 path for an official canonical
# Reader without its specialist can_initiate row.
cat test/db/standard_reader_additional_policy_locked_positive.sql >> "$tmp_sql"
psql -X -v ON_ERROR_STOP=1 -f "$tmp_sql" >/dev/null
