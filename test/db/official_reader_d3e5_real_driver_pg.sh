#!/usr/bin/env bash
set -euo pipefail
# Only disposable authority-core PostgreSQL clone; never production.
if [[ "$CI" != "true" || "$PGHOST" != "localhost" ||
  "$PGDATABASE" != "myeongha_reader_d3e5_real_driver_pg_test" ]]; then
  echo "FAIL: D3e5 private real PostgreSQL test requires isolated CI DB" >&2
  exit 1
fi
MYEONGHA_D3E5_REAL_PG=1 ./node_modules/.bin/vitest run test/postgres-official-reader-cancel-durable-worker-private-v1.test.ts
