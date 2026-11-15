#!/usr/bin/env bash
set -euo pipefail
# Owner bootstrap runs only on the disposable, mounted PostgreSQL 17 database.
[[ "${MYEONGHA_DISPOSABLE_SAJU14:-}" == 'explicit-local-only' &&
   "${PGHOST:-}" == '/var/run/postgresql' &&
   -f /app/scripts/local/approved-saju14-owner-bootstrap.psql ]] || {
  echo 'HOLD_NOT_DISPOSABLE_SAJU14_OWNER_BOOTSTRAP' >&2; exit 1;
}
[[ "${MYEONGHA_SAJU_TEST_OWNER_AUTH_USER_ID:-}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || {
  echo 'HOLD_EXPLICIT_VERIFIED_OWNER_AUTH_ID_REQUIRED' >&2; exit 1;
}
cd /app
psql -X -U postgres -d myeongha_saju_sandbox_v1 \
  -v ON_ERROR_STOP=1 -At -f scripts/local/approved-saju14-owner-bootstrap.psql
