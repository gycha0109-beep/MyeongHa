#!/usr/bin/env bash
set -euo pipefail

db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
pg_version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ ! "$db" =~ ^myeongha_ci_case_[0-9]+$ || ! "$pg_version" =~ ^17[0-9]{4}$ ]]; then
 echo 'DENY: cancellation set audit requires disposable PostgreSQL17 CI database' >&2
 exit 1
fi

# Prior proven fixture creates its B2/B3 payment attempts before verification.
node test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs --fixture |
 psql -X -v ON_ERROR_STOP=1 -f - >/dev/null

# This generator embeds the unmodified, already-proven PortOne B2 event
# within a transaction and checks the exact read-only cancellation-set SQL.
node test/db/commerce_portone_cancellation_set_pg17_generator.mjs |
 psql -X -v ON_ERROR_STOP=1 -f -

echo 'PASS: PortOne source-v2 cancellation set has exact B2 receipt and excludes B3; no Grant or Provider writes'
