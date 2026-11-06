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
./node_modules/.bin/vitest run \
  test/seyeon-g3-historical-originals-review-port-w94.test.ts --maxWorkers=1
# G4 governed admission input hardening runs offline; HTTP and DB are mocks.
./node_modules/.bin/vitest run \
  test/seyeon-cost-governor-04c-adapter-v1.test.ts --maxWorkers=1
# The OpenAI input-token counting path uses fake HTTP only, never a paid call.
./node_modules/.bin/vitest run \
  test/seyeon-openai-input-token-count-port-v1.test.ts --maxWorkers=1
# G4 ENFORCE must refuse legacy bypass on the ordinary API role before role switch.
./node_modules/.bin/vitest run \
  apps/api/src/seyeon-governed-postgres-pool-v1.test.ts --maxWorkers=1
./node_modules/.bin/vitest run \
  test/seyeon-g3-historical-originals-review-w88.test.ts --maxWorkers=1
./node_modules/.bin/vitest run \
  test/seyeon-chat-turn-send-http.test.ts --maxWorkers=1
./node_modules/.bin/vitest run \
  test/seyeon-g1-original-source-state-w84.test.ts --maxWorkers=1
./node_modules/.bin/vitest run \
  test/seyeon-g1-historical-source-admission-w81.test.ts --maxWorkers=1
./node_modules/.bin/vitest run \
  test/seyeon-g1-historical-source-admission-port-w82.test.ts --maxWorkers=1
./node_modules/.bin/vitest run \
  test/seyeon-g1-historical-after-preflight-seal-hold-v1.test.ts --maxWorkers=1
./node_modules/.bin/vitest run \
  test/seyeon-g2-historical-same-transaction-hold-w77.test.ts --maxWorkers=1
SEYEON_SECURITY_S0_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-security-s0-postgres.e2e.test.ts --maxWorkers=1
SEYEON_SECURITY_S0_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-security-s0-history-presence.e2e.test.ts --maxWorkers=1
SEYEON_SECURITY_S0_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-unissued-zero-reply.pg.e2e.test.ts --maxWorkers=1
