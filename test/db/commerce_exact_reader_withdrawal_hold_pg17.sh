#!/usr/bin/env bash
set -euo pipefail
db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
pg_version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ ! "$db" =~ ^myeongha_ci_case_[0-9]+$ || ! "$pg_version" =~ ^17[0-9]{4}$ ]]; then
 echo 'DENY: exact Reader withdrawal HOLD needs disposable PostgreSQL17 CI database' >&2
 exit 1
fi
node test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs --fixture |
 psql -X -v ON_ERROR_STOP=1 -f - >/dev/null
node test/db/commerce_exact_reader_withdrawal_hold_pg17_generator.mjs |
 psql -X -v ON_ERROR_STOP=1 -f -
echo 'PASS: exact PortOne Event/Receipt/paid Reader unit can be inspected; unrelated purchase rejected; no delivery fact or Grant mutation'
