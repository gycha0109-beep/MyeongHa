#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: security
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true &&
   "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
  echo HOLD_S0_REQUIRES_DISPOSABLE_PG17 >&2; exit 1;
}
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || {
  echo HOLD_S0_REQUIRES_POSTGRES17 >&2; exit 1;
}
node scripts/operations/seyeon-security-s0/install-isolated.mjs
# G4 cost admission and dedicated PostgreSQL/Cloudflare checkout boundaries.
./node_modules/.bin/vitest run test/seyeon-cost-governor-04c-adapter-v1.test.ts --maxWorkers=1
./node_modules/.bin/vitest run test/seyeon-openai-input-token-count-port-v1.test.ts --maxWorkers=1
./node_modules/.bin/vitest run apps/api/src/seyeon-governed-postgres-pool-v1.test.ts --maxWorkers=1
./node_modules/.bin/vitest run test/cloudflare-seyeon-governed-hyperdrive.test.mjs --maxWorkers=1
SEYEON_SECURITY_S0_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-security-s0-postgres.e2e.test.ts --maxWorkers=1
SEYEON_SECURITY_S0_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-security-s0-history-presence.e2e.test.ts --maxWorkers=1
SEYEON_SECURITY_S0_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-unissued-zero-reply.pg.e2e.test.ts --maxWorkers=1
