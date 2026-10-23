#!/usr/bin/env bash
set -euo pipefail

# S7 Checkout origin: disposable PostgreSQL clone only, NEVER Production.
if [[ "${CI:-}" != 'true' ||
      "${PGHOST:-}" != 'localhost' ||
      "${PGDATABASE:-}" != 'myeongha_reader_checkout_original_ledger_test' ]]; then
  echo 'FAIL: isolated CI PostgreSQL is required for original Checkout ledger proof' >&2
  exit 1
fi

psql -X -1 -v ON_ERROR_STOP=1 \
  -f test/db/official_reader_checkout_notice_original_ledger_fixture.sql

./node_modules/.bin/vitest run \
  test/postgres-commerce-reader-checkout-original-item-ledger.test.ts

echo 'PASS: exact original Commerce Receipt/Grant precheckout item relational ledger'
