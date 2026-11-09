#!/usr/bin/env bash
set -euo pipefail
# Read the migrated Record-scoped Saju authority in a disposable CI PostgreSQL 17,
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
# Seed the reviewed synthetic B2/B3 original verified Receipt and official
# Reading authority first, using the same disposable PG17 fixture as the
# PortOne cancellation proof. Saju Record authority itself comes from migration 2330.
node test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs --fixture |
  psql -X -v ON_ERROR_STOP=1 -f - >/dev/null

psql -X -v ON_ERROR_STOP=1 -f test/db/commerce_saju_record_ledger_candidate_pg17.sql
psql -X -v ON_ERROR_STOP=1 -f test/db/commerce_approved_saju_purchase_scope_pg17.sql

# Execute the exact TypeScript current-Grant and receipt/Record SQL on the same
# disposable PG17 database. Synthetic purchase and Grant rows are rolled back.
# This does NOT assert that a Reader B2 fixture is an approved Saju Product.
node test/db/commerce_saju_private_quote_sql_pg17_generator.mjs |
  psql -X -v ON_ERROR_STOP=1 -f -
