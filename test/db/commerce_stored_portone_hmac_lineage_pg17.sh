#!/usr/bin/env bash
set -euo pipefail

db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
pg_version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ ! "$db" =~ ^myeongha_ci_case_[0-9]+$ || ! "$pg_version" =~ ^17[0-9]{4}$ ]]; then
 echo 'DENY: synthetic HMAC source lineage proof requires disposable PostgreSQL17 CI case database' >&2
 exit 1
fi
psql -X -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql >/dev/null
node test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs |
 psql -X -v ON_ERROR_STOP=1 -f -

echo 'PASS: exact source-v2 PortOne cancel event resolves one Receipt/Attempt/Reader Grant only; no provider refund or entitlement mutation'
