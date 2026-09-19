#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir="$RUNNER_TEMP/myeongha-postgres-backup"
rm -rf "$backup_dir"
mkdir -p "$backup_dir"

cleanup() {
  exit_code=$?
  trap - EXIT
  rm -rf "$backup_dir"
  exit "$exit_code"
}
trap cleanup EXIT

encoded_password="$(python3 - <<'PY'
import os
import urllib.parse
print(urllib.parse.quote(os.environ['SUPABASE_DB_PASSWORD'], safe=''))
PY
)"
db_url="postgresql://${ADMIN_POOL_USER}:${encoded_password}@${POOL_HOST}:${POOL_PORT}/${POOL_DB}?sslmode=require"
echo "::add-mask::$db_url"

started_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
backup_stamp="$(date -u +'%Y%m%dT%H%M%SZ')"

npx --yes "supabase@$SUPABASE_CLI_VERSION" db dump \
  --db-url "$db_url" \
  -f "$backup_dir/roles.sql" \
  --role-only
npx --yes "supabase@$SUPABASE_CLI_VERSION" db dump \
  --db-url "$db_url" \
  -f "$backup_dir/schema.sql"
npx --yes "supabase@$SUPABASE_CLI_VERSION" db dump \
  --db-url "$db_url" \
  -f "$backup_dir/data.sql" \
  --use-copy \
  --data-only \
  -x 'storage.buckets_vectors' \
  -x 'storage.vector_indexes'

test -s "$backup_dir/roles.sql"
test -s "$backup_dir/schema.sql"
test -s "$backup_dir/data.sql"

(
  cd "$backup_dir"
  sha256sum roles.sql schema.sql data.sql > plaintext-sha256.txt
)

completed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
jq -n \
  --arg schema_version 'myeongha-postgres-logical-backup-v1' \
  --arg project_ref "$SUPABASE_PROJECT_ID" \
  --arg source_sha "$GITHUB_SHA" \
  --arg cli_version "$SUPABASE_CLI_VERSION" \
  --arg started_at "$started_at" \
  --arg completed_at "$completed_at" \
  '{
    schema_version: $schema_version,
    project_ref: $project_ref,
    source_sha: $source_sha,
    supabase_cli_version: $cli_version,
    started_at_utc: $started_at,
    completed_at_utc: $completed_at
  }' > "$backup_dir/manifest.json"

plaintext_archive="$RUNNER_TEMP/myeongha-postgres-${backup_stamp}.tar.gz"
encrypted_archive="${plaintext_archive}.enc"
tar -C "$backup_dir" -czf "$plaintext_archive" \
  roles.sql schema.sql data.sql plaintext-sha256.txt manifest.json

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "$plaintext_archive" \
  -out "$encrypted_archive" \
  -pass env:MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE
rm -f "$plaintext_archive"

encrypted_sha256="$(sha256sum "$encrypted_archive" | awk '{print $1}')"
printf '%s  %s\n' "$encrypted_sha256" "$(basename "$encrypted_archive")" \
  > "${encrypted_archive}.sha256"

public_manifest="$RUNNER_TEMP/myeongha-postgres-${backup_stamp}.manifest.json"
jq -n \
  --arg schema_version 'myeongha-postgres-backup-artifact-v1' \
  --arg project_ref "$SUPABASE_PROJECT_ID" \
  --arg source_sha "$GITHUB_SHA" \
  --arg created_at "$completed_at" \
  --arg encrypted_sha256 "$encrypted_sha256" \
  --arg archive_name "$(basename "$encrypted_archive")" \
  '{
    schema_version: $schema_version,
    project_ref: $project_ref,
    source_sha: $source_sha,
    created_at_utc: $created_at,
    encrypted_sha256: $encrypted_sha256,
    archive_name: $archive_name
  }' > "$public_manifest"

echo "archive=$encrypted_archive" >> "$GITHUB_OUTPUT"
echo "checksum=${encrypted_archive}.sha256" >> "$GITHUB_OUTPUT"
echo "manifest=$public_manifest" >> "$GITHUB_OUTPUT"
echo "artifact_name=myeongha-postgres-${backup_stamp}" >> "$GITHUB_OUTPUT"
