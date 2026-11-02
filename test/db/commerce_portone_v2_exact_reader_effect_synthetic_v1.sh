#!/usr/bin/env bash
set -euo pipefail

# A genuine internal_apply_entitlement_effect_v1 SQL execution in an
# isolated synthetic database, never a customer/Production refund/revoke.
db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
if [[ ! "$db" =~ ^myeongha_[a-z0-9_]+$ ||
      "$db" == *template* ||
      "$db" == *production* ||
      "$db" == *prod ]]; then
  printf 'DENY: a known disposable myeongha_* database is required\n' >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 \
  -f test/db/official_standard_reading_reader_interpretation.sql
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/commerce_portone_v2_exact_reader_effect_synthetic_v1.sql

echo 'PASS: synthetic PortOne V2 source-v2 -> existing Entitlement Effect exact Reader revoke + idempotent replay + independent Reader purchase preserved (transaction ROLLBACK)'
