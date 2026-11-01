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
# Install the candidate ONLY inside the independently guarded disposable CI DB.
# This does not apply the candidate to the ordinary migration stream.
psql -X -v ON_ERROR_STOP=1 -f docs/operations/candidates/commerce_reader_delivery_transport_capture_v1.sql >/dev/null
node test/db/commerce_reader_delivery_transport_pg17_generator.mjs |
 psql -X -v ON_ERROR_STOP=1 -f -
echo 'PASS: exact paid Reader scope, internal source HOLD and isolated delivery transport preparation/ACK; no legal delivery or Grant mutation'
