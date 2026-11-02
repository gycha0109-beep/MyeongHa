#!/usr/bin/env bash
set -euo pipefail

db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
pg_version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ ! "$db" =~ ^myeongha_ci_case_[0-9]+$ || ! "$pg_version" =~ ^17[0-9]{4}$ ]]; then
 echo 'DENY: partial cancellation set requires empty disposable PostgreSQL17 CI database' >&2
 exit 1
fi

# Self-contained scratch schema, never apply migrations or modify real commerce.
node test/db/commerce_portone_cancellation_partial_set_pg17_generator.mjs |
 psql -X -v ON_ERROR_STOP=1 -f -

echo 'PASS: two distinct PortOne cancellation items 3000+5900; same-HMAC replay conflict observable; all rollback'
