#!/usr/bin/env bash
set -euo pipefail
: "${PGDATABASE:?Disposable PostgreSQL database is required}"
psql -v ON_ERROR_STOP=1 -f test/db/candidates/chat_credit_private_ledger_v1.sql >/dev/null
psql -v ON_ERROR_STOP=1 -f test/db/candidates/chat_credit_private_ledger_v1_test.sql >/dev/null
echo 'PASS commerce chat credit private ledger candidate: signup/replay/reserve/settle/release/shortage/ACL'
