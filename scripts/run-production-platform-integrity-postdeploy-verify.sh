#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:?SUPABASE_PRODUCTION_SESSION_POOLER_HOST is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]

[[ "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]]
ADMIN_POOL_USER="postgres.$SUPABASE_PROJECT_ID"
POOL_HOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"
POOL_PORT='5432'
POOL_DB='postgres'

[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]
[[ "$POOL_HOST" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]]
[[ "$POOL_PORT" == '5432' ]]
[[ "$POOL_DB" == 'postgres' ]]

export ADMIN_POOL_USER POOL_HOST POOL_PORT POOL_DB

bash scripts/run-production-platform-integrity-read-audit.sh
bash scripts/run-production-platform-integrity-data-api-surface-audit.sh

echo 'Production post-deploy platform-integrity read-only verification passed.'
