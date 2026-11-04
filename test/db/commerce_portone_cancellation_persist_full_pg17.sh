#!/usr/bin/env bash
set -euo pipefail

db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ "${GITHUB_ACTIONS:-}" != true ||
      "${DB_SUITE:-}" != postgres17 ||
      "${PGHOST:-}" != localhost ||
      "${PGPORT:-}" != 5432 ||
      ! "$db" =~ ^myeongha_ci_case_[0-9]+$ ||
      ! "$version" =~ ^17[0-9]{4}$ ]]; then
  echo 'DENY: canonical cancellation event SQL candidate requires isolated PG17 CI only' >&2
  exit 1
fi

# Run the actual migrated Reader B2/B3 fixture with distinct purchased Grants.
# This is the same fixture used by previously proven cancellation HMAC audits.
node test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs --fixture |
  psql -X -v ON_ERROR_STOP=1 -f - >/dev/null

# SECURITY INVOKER function DDL and all synthetic Provider Events are
# transaction-local and explicitly ROLLBACK; no staged migration is installed.
psql -X -v ON_ERROR_STOP=1 -f test/db/commerce_portone_cancellation_persist_full_pg17.sql
echo 'PASS: PostgreSQL17 full schema cancellation candidate exact B2 Receipt, stable replay, B3 preserved; no real refund/revoke'

# The previous SQL verification intentionally rolls back its candidate DDL.
# Reinstall the reviewed candidate ONLY into this disposable case database for
# two actual PostgreSQL 17 sessions. The CI case DB is destroyed afterward.
psql -X -v ON_ERROR_STOP=1 \
  -f docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql >/dev/null
node test/db/commerce_cancel_same_item_real_race_pg17.mjs
