#!/usr/bin/env bash
set -euo pipefail

# Read-only, isolated history-compatibility preflight; NOT a deployment entrypoint.
# Watchtower-Track: ops
# DO NOT add this script to supabase-production deploy-migrations workflow.
: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:?SUPABASE_PRODUCTION_SESSION_POOLER_HOST is required}"

project_id='cnsfpcdiyofqvhpcegfc'
history_version='20261008090417'
history_name='seyeon_runtime_1460_1510_acl_before_owner_recovery'
history_bytes='104021'
history_sha256='4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894'

if [[ "$SUPABASE_PROJECT_ID" != "$project_id" ]]; then
  echo 'HOLD: Unexpected Supabase project; do not inspect another database.' >&2
  exit 1
fi
host="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"
if [[ ! "$host" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]]; then
  echo 'HOLD: Production session pooler hostname is invalid.' >&2
  exit 1
fi

for executable in psql python3 sha256sum supabase; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    echo "HOLD: Missing required executable $executable." >&2
    exit 1
  fi
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ -f "$repo_root/supabase/config.toml" ]]
[[ -d "$repo_root/supabase/migrations" ]]
if compgen -G "$repo_root/supabase/migrations/${history_version}_*.sql" >/dev/null; then
  echo 'HOLD: Historical remote-only version is now checked into migrations; reassess first.' >&2
  exit 1
fi
for version in 1460 1470 1480 1490 1500 1510; do
  if ! compgen -G "$repo_root/supabase/migrations/${version}_*.sql" >/dev/null; then
    echo "HOLD: Required original migration ${version} missing." >&2
    exit 1
  fi
done

umask 077
sandbox="$(mktemp -d)"
trap 'rm -rf -- "$sandbox"' EXIT
mkdir -p "$sandbox/supabase"
cp "$repo_root/supabase/config.toml" "$sandbox/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$sandbox/supabase/migrations"
historical_file="$sandbox/supabase/migrations/${history_version}_${history_name}.sql"

export PGHOST="$host"
export PGPORT='5432'
export PGDATABASE='postgres'
export PGUSER="postgres.${project_id}"
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE='require'
# Libpq connections are read-only even if a future CLI implementation changes.
# The Supabase command still uses its explicitly documented --dry-run.
export PGOPTIONS='-c default_transaction_read_only=on'

# SELECT exactly one approved recovery SQL statement from the existing
# migration ledger. Hex transport avoids loss of trailing newlines or
# arbitrary SQL characters. Never print SQL body to an Actions log.
sql="select encode(convert_to(statements[1], 'UTF8'), 'hex')
from supabase_migrations.schema_migrations
where version = '${history_version}'
  and name = '${history_name}'
  and cardinality(statements) = 1
  and octet_length(convert_to(statements[1], 'UTF8')) = ${history_bytes}
  and encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') = '${history_sha256}'"

psql -X -qAt -v ON_ERROR_STOP=1 -c "$sql" |
  python3 -c 'import sys; sys.stdout.buffer.write(bytes.fromhex(sys.stdin.read().strip()))' > "$historical_file"

actual_bytes="$(wc -c < "$historical_file" | tr -d ' ')"
if [[ "$actual_bytes" != "$history_bytes" ]] ||
   ! printf '%s  %s\n' "$history_sha256" "$historical_file" | sha256sum --check --status; then
  echo 'HOLD: Production incident bundle not present or SHA-256 differs from approved observation.' >&2
  exit 1
fi

# All work takes place in a disposable copy; no historical migration file
# is committed to the source repository or scheduled for fresh DB replay.
encoded_password="$(python3 -c 'import os,urllib.parse; print(urllib.parse.quote(os.environ["SUPABASE_DB_PASSWORD"],safe=""))')"
db_url="postgresql://postgres.${project_id}:${encoded_password}@${host}:5432/postgres?sslmode=require"
if [[ "${GITHUB_ACTIONS:-}" == 'true' ]]; then
  echo "::add-mask::$db_url"
fi
echo "Read-only history fingerprint confirmed: ${history_version} (SHA-256 ${history_sha256})."
echo 'Reconstructing LOCAL-ONLY migration catalog in an isolated temporary directory.'
cd "$sandbox"
supabase migration list --db-url "$db_url"
echo 'Running Supabase dry-run only. There is no apply/repair command in this script.'
supabase db push --include-all --dry-run --db-url "$db_url"
echo 'READ_ONLY_DRYRUN_PASS: database unchanged. Pending migrations are NOT approved for deployment.'
