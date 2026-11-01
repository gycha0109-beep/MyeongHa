#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: security
# Two independent PostgreSQL sessions against the REAL existing v2->v1->core
# command, with only synthetic positive admission functions in scratch DB.
if [[ "${CI:-}" != "true" || "${PGHOST:-}" != "localhost" ||
      "${PGDATABASE:-}" != "myeongha_seyeon_positive_pin_candidate_test" ]]; then
  echo 'HOLD: G2 rehearsal requires exact disposable CI PostgreSQL database' >&2
  exit 2
fi
# R1's already-reviewed exact-Attempt & XOR fixture is a prerequisite.
bash test/db/seyeon_r1_disposable_positive_source_xor.sh
# R19: real verified-Member -> canonical Subject -> immutable Parent+Edges COMMIT
# before any possible model dispatch, in the SAME disposable database only.
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-positive-model-pre-model-db-pin-r19-candidate.test.ts --maxWorkers=1
# R20: Owner returns its currently locked ORIGINAL synthetic JSONB to the
# same Member-bound transaction; Node verifies raw + selected projection
# canonical digests BEFORE COMMIT. Any mismatch rolls back Parent/Edges.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_positive_r20_payload_digest_owner_candidate_v1.sql
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-positive-raw-projection-digest-bind-r20-candidate.test.ts --maxWorkers=1
# DB-authoritative original JSONB digest must not be confused with Node
# canonical-json projection hashes. Same REAL exact Attempt, synthetic only.
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-source-digest-node-postgres-golden-v1.test.ts --maxWorkers=1
# R4: Test-only DB Owner stage receipt for ACTUAL OpenAI adapter bytes.
# Must run before G1 context_ready changes the in-flight Attempt state.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_positive_g1_owner_dispatch_receipt_candidate_v1.sql
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-r4-owner-wire-receipt-disposable.test.ts --maxWorkers=1
# Verify real zero-only baseline before changing *only* this disposable clone.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_g2_production_compatibility_catalog_guard_v1.sql
# Seal G4 origin/real governed reservation BEFORE installing G2's gated Owner.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_r28_disposable_governed_wire_cost_provenance.sql
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_g2_legacy_direct_commit_acl_cutover_candidate_v1.sql
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_g2_actual_v2_atomic_positive_candidate_r3.sql
# Only the G1 context-ready portion of R4 is installed; NO G3 Reveal/HTTP.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_g1_atomic_context_only_candidate_r2.sql
# R21 must be INSTALLED before R25 G2/R5 tests reference its two-original function.
# Original single-memory and zero-memory paths are still unchanged.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_g1_r21_two_originals_context_ready_candidate_v1.sql
# R30 is a no-dispatch five-stage source/wire ancestry receipt only.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_r30_disposable_five_stage_native_wire_lineage.sql
# R36: install DB-owned static Character/Interpreter manifest first;
# real runtime builders produce the immutable PUBLIC authored snapshot.
# Must finish before R32 can admit any Interpreter or charge a budget.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_r36_disposable_interpreter_static_authority_manifest.sql
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-r36-static-authority-manifest-disposable.test.ts --maxWorkers=1
# One DB transaction now binds each actual native stage, trusted code-owned
# Interpreter authority manifest, and the real Governor budget.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_r32_disposable_atomic_five_stage_cost_admission.sql
# R5 is required by the same two-original G2 test's post-commit Grant readback.
# Install it before G2 tests; ordinary single-original cases keep their guards.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_r5_disposable_reveal_current_rights.sql
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-g2-atomic-original-grant-race-disposable.test.ts --maxWorkers=1
# R7 reads already-installed R5 Owner under the same disposable DB;
# a later revoke must block any delayed HTTP disclosure.
# R25 extends the ACTUAL R5 current-rights Owner with exclusive one-shot Turn
# consumption in the SAME disposable PG transaction held until Node finish.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_r25_disposable_first_once_g3.sql
# Verify G1 two-original atomic pin against the synthetic isolated DB.
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run test/seyeon-positive-r21-two-source-context-ready-disposable.test.ts --maxWorkers=1
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-r5-current-reveal-disposable.test.ts --maxWorkers=1
# After legacy compatibility/G3 tests, revoke positive G2 executor permissions
# in the same scratch DB. No new owner positive Commit is granted.
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_r31_disposable_g2_forward_stop_cutover.sql
SEYEON_POSITIVE_GRANT_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/seyeon-r31-g2-forward-stop-disposable.test.ts --maxWorkers=1
echo 'PASS offline G1/G4 native five-stage owner ancestry, G2/G3 tests, final G2 ACL forward stop; Production G0/G2/G3 HOLD'
