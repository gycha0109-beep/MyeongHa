#!/usr/bin/env bash
set -euo pipefail

# Fully migrated disposable PostgreSQL 17 test DB only. NEVER production.
db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
if [[ ! "$db" =~ ^myeongha_[a-z0-9_]+$ ||
      "$db" == *template* ||
      "$db" == *production* ||
      "$db" == *prod ]]; then
  echo 'DENY: only disposable myeongha_* PostgreSQL DBs may run this proof' >&2
  exit 1
fi
pg_version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ ! "$pg_version" =~ ^17[0-9]{4}$ ]]; then
  printf 'DENY: this proof requires a real PostgreSQL 17 instance; got %s\\n' "$pg_version" >&2
  exit 1
fi

# These are staged implementation candidates; install ONLY in isolated DB.
# Keep them out of migrations until subject graph + restore obligations are met.
psql -X -v ON_ERROR_STOP=1 \
  -f docs/operations/candidates/digital_reading_withdrawal_claim_private_v1.sql
psql -X -v ON_ERROR_STOP=1 \
  -f docs/operations/candidates/account_deletion_finalizer_with_private_withdrawal_claim_v1.sql

COMMERCE_PRIVATE_CLAIM_FINALIZER_PG17_PROOF=1 \
 bash test/db/account_deletion_db_finalizer.sh

echo 'PASS COMMERCE_PRIVATE_CLAIM_FULL_FINALIZER_REAL_PG17: exact Subject DELETE + full finalizer rollback, replay, other Subject and Commerce P5Y retained'
