#!/usr/bin/env bash
set -euo pipefail

# Fully migrated, disposable PG17 case only. No provider API or Production DB.
db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ "${GITHUB_ACTIONS:-}" != true || "${DB_SUITE:-}" != postgres17 ||
      "${PGHOST:-}" != localhost || "${PGPORT:-}" != 5432 ||
      ! "$db" =~ ^myeongha_ci_case_[0-9]+$ ||
      ! "$version" =~ ^17[0-9]{4}$ ]]; then
  echo 'DENY: persisted cancellation->Reader Effect requires isolated PG17 CI' >&2
  exit 1
fi

# Existing official B2/B3 verified purchase, original Receipt and distinct Grants.
node test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs --fixture |
  psql -X -v ON_ERROR_STOP=1 -f - >/dev/null

# DDL + synthetic Event and Entitlement writes are always rolled back.
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/commerce_portone_persisted_event_exact_reader_effect_pg17.sql
echo 'PASS: canonical cancellation -> exact Reader Effect in disposable PG17 (ROLLBACK)'
