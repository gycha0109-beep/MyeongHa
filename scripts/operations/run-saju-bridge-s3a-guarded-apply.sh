#!/usr/bin/env bash
# Manual, fail-closed, single-transaction S3A only. No generic migration push.
set -euo pipefail
umask 077

[[ "$GITHUB_EVENT_NAME" == 'workflow_dispatch' ]]
[[ "$GITHUB_REPOSITORY" == 'gycha0109-beep/MyeongHa' ]]
[[ "$GITHUB_REF" == 'refs/heads/main' ]]
[[ "$GITHUB_ACTOR" == 'gycha0109-beep' ]]
[[ "$MYEONGHA_WATCHTOWER_TRACK" == 'saju-bridge' ]]
[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]
[[ "$S3A_CONFIRM" == 'APPLY_SAJU_BRIDGE_S3A_DORMANT_1730_ONLY' ]]
[[ -n "$SUPABASE_DB_PASSWORD" ]]
[[ -n "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" ]]
[[ -n "$SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM" ]]
[[ -d "$RUNNER_TEMP" ]]
[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]]
[[ -z "$(git status --porcelain)" ]]

proposal='supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql'
preflight='scripts/operations/saju-bridge-s3a-preflight.sql'
postcheck='scripts/operations/saju-bridge-s3a-postcheck.sql'
expected_digest='900e0771915776b4a7c2a8b3cf60e24b83c79fcec14f27cf6356b44685b385e2'
expected_blob='42e076799d627bc9e19fe28e1ad25b4548e05e61'
[[ -f "$proposal" && -f "$preflight" && -f "$postcheck" ]]
[[ "$(sha256sum "$proposal" | awk '{print $1}')" == "$expected_digest" ]]
[[ "$(git hash-object "$proposal")" == "$expected_blob" ]]

cert="$RUNNER_TEMP/saju-s3a-strict-root.crt"
cleanup() { rm -f "$cert"; }
trap cleanup EXIT HUP INT TERM
node scripts/operations/prepare-production-postgres-strict-libpq.mjs \
  --output "$cert" \
  --host "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" \
  --principal "postgres.$SUPABASE_PROJECT_ID" \
  --port 5432 --database postgres
[[ -s "$cert" ]]
export PGHOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"
export PGPORT=5432
export PGUSER="postgres.$SUPABASE_PROJECT_ID"
export PGDATABASE=postgres
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE=verify-full
export PGSSLROOTCERT="$cert"

# Uses the same pinned CA and strict hostname verification as the existing
# governed Production PostgreSQL backup, never an arbitrary MCP SQL session.
# No user/reading/commerce rows are selected.
psql -X -At --set ON_ERROR_STOP=1 -c \
  "select 'strict-tls-backend=' || coalesce((select ssl::text from pg_catalog.pg_stat_ssl where pid=pg_catalog.pg_backend_pid()), 'missing');" \
  | grep -Fx 'strict-tls-backend=true'

# Close TOCTOU window: latest backup, exact restored evidence, current
# default branch and execution time window are rechecked immediately before DDL.
node scripts/operations/saju-bridge-s3a-provenance.mjs verify
[[ "$(sha256sum "$proposal" | awk '{print $1}')" == "$expected_digest" ]]

# psql --single-transaction wraps all three -f inputs in one BEGIN/COMMIT.
# ON_ERROR_STOP forces ROLLBACK on any SQL or assertion failure.
# No migrations, paid resources, LOGIN, issuers, permits, or user data reads.
psql -X --set ON_ERROR_STOP=1 --single-transaction \
  --file="$preflight" \
  --file="$proposal" \
  --file="$postcheck"

# Read-only after-commit sanity check. Never auto-reapply on failure.
psql -X --set ON_ERROR_STOP=1 --file="$postcheck"
echo 's3a_inactive_private_objects=applied_once'
echo 's3a_permit_issuance=disabled'
echo 's3a_operational_admission=HOLD'
