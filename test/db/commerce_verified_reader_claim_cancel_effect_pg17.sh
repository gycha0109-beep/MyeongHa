#!/usr/bin/env bash
set -euo pipefail

# Real fully migrated PostgreSQL 17 on disposable CI DB only.
db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ "${GITHUB_ACTIONS:-}" != true || "${DB_SUITE:-}" != postgres17 ||
      "${PGHOST:-}" != localhost || "${PGPORT:-}" != 5432 ||
      ! "$db" =~ ^myeongha_ci_case_[0-9]+$ ||
      ! "$version" =~ ^17[0-9]{4}$ ]]; then
  echo 'DENY: claim->cancel->Reader Effect requires disposable PostgreSQL 17 CI only' >&2
  exit 1
fi

# Inject B2 original server notice and ACK BEFORE its verified Receipt;
# B3 remains a separate independently verified purchased Reader bundle.
node test/db/commerce_claim_noticed_reader_fixture_pg17_generator.mjs |
  psql -X -v ON_ERROR_STOP=1 -f - >/dev/null

# Exact customer Claim RPC + original cancellation Event + actual effect writer
# run only in one synthetic ROLLBACK transaction. Nothing is deployed.
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/commerce_verified_reader_claim_cancel_effect_pg17.sql
echo 'PASS: verified purchased Reader -> Claim -> cancellation Event -> exact Effect, isolated PG17 ROLLBACK'
