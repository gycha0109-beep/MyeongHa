#!/usr/bin/env bash
set -euo pipefail

db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
pg_version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ "${GITHUB_ACTIONS:-}" != true ||
      "${DB_SUITE:-}" != postgres17 ||
      "${PGHOST:-}" != localhost || "${PGPORT:-}" != 5432 ||
      ! "$db" =~ ^myeongha_ci_case_[0-9]+$ ||
      ! "$pg_version" =~ ^17[0-9]{4}$ ]]; then
 echo 'DENY: shared Reader S1 lock race requires disposable PG17 CI database' >&2
 exit 1
fi

# The caller already installed the proven B2/B3 independent Reader fixture.
# Do not reapply it or add an extra full-migration database to the CI suite.
# A synthetic verified B2 cancellation. No real PortOne GET/POST.
psql -X -v ON_ERROR_STOP=1 -f test/db/commerce_reader_s1_cas_race_pg17_seed.sql >/dev/null
# Real independent clients coordinate on the existing S1 advisory lock.
node test/db/commerce_reader_s1_cas_race_pg17.mjs
