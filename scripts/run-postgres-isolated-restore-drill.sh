#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_ARTIFACT_DIR:?BACKUP_ARTIFACT_DIR is required}"
: "${MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE:?MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${EXPECTED_PROJECT_REF:?EXPECTED_PROJECT_REF is required}"
: "${EXPECTED_SOURCE_SHA:?EXPECTED_SOURCE_SHA is required}"
: "${RESTORE_EVIDENCE_PATH:?RESTORE_EVIDENCE_PATH is required}"

if [[ "${#MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE}" -lt 32 ]]; then
  echo 'Backup passphrase must be at least 32 characters.' >&2
  exit 1
fi
if [[ ! "$EXPECTED_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'EXPECTED_SOURCE_SHA must be a 40-character Git SHA.' >&2
  exit 1
fi

# Safety invariant: this harness has no remote restore target input.
# Both connections are fixed to the ephemeral Supabase PostgreSQL service on loopback.
# supabase_admin is used only for privileged logical replay; ordinary postgres is used
# for post-restore validation so evidence does not depend on a superuser reader.
readonly RESTORE_DATABASE_URL='postgresql://postgres:restore-drill@127.0.0.1:5432/postgres'
readonly RESTORE_ADMIN_DATABASE_URL='postgresql://supabase_admin:restore-drill@127.0.0.1:5432/postgres'

[[ "$(psql "$RESTORE_ADMIN_DATABASE_URL" -At --set ON_ERROR_STOP=1 -c \
  "select current_user = 'supabase_admin' and rolsuper from pg_roles where rolname = current_user;")" == 't' ]]

shopt -s nullglob
archives=("$BACKUP_ARTIFACT_DIR"/*.tar.gz.enc)
checksums=("$BACKUP_ARTIFACT_DIR"/*.tar.gz.enc.sha256)
manifests=("$BACKUP_ARTIFACT_DIR"/*.manifest.json)
shopt -u nullglob

if [[ ${#archives[@]} -ne 1 || ${#checksums[@]} -ne 1 || ${#manifests[@]} -ne 1 ]]; then
  echo 'Expected exactly one encrypted archive, checksum, and public manifest.' >&2
  exit 1
fi

archive="${archives[0]}"
checksum="${checksums[0]}"
manifest="${manifests[0]}"

[[ "$(jq -er '.schema_version' "$manifest")" == 'myeongha-postgres-backup-artifact-v1' ]]
[[ "$(jq -er '.project_ref' "$manifest")" == "$EXPECTED_PROJECT_REF" ]]
[[ "$(jq -er '.source_sha' "$manifest")" == "$EXPECTED_SOURCE_SHA" ]]
[[ "$(jq -er '.archive_name' "$manifest")" == "$(basename "$archive")" ]]
expected_cipher_sha="$(jq -er '.encrypted_sha256' "$manifest")"
[[ "$expected_cipher_sha" =~ ^[0-9a-f]{64}$ ]]
[[ "$(sha256sum "$archive" | awk '{print $1}')" == "$expected_cipher_sha" ]]

(
  cd "$BACKUP_ARTIFACT_DIR"
  sha256sum -c "$(basename "$checksum")"
)

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$archive" \
  -out "$work_dir/restore.tar.gz" \
  -pass env:MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE

tar -tzf "$work_dir/restore.tar.gz" | sed 's#^\./##' | sort > "$work_dir/listing.txt"
printf '%s\n' data.sql manifest.json plaintext-sha256.txt roles.sql schema.sql | sort > "$work_dir/expected.txt"
cmp -s "$work_dir/listing.txt" "$work_dir/expected.txt"
! grep -Eq '(^/|(^|/)\.\.(/|$))' "$work_dir/listing.txt"

tar -xzf "$work_dir/restore.tar.gz" -C "$work_dir"
rm -f "$work_dir/restore.tar.gz"

# Historical governed artifacts recorded the producing runner's absolute paths
# in plaintext-sha256.txt. Accept only the three governed dump members and
# normalize their paths to local basenames before integrity verification.
normalized_plaintext_checksum="$work_dir/plaintext-sha256.normalized.txt"
declare -A seen_plaintext_checksum_names=()
checksum_count=0
while read -r checksum_hash checksum_path checksum_extra; do
  [[ -n "$checksum_hash" ]]
  [[ -n "$checksum_path" ]]
  [[ -z "${checksum_extra:-}" ]]
  [[ "$checksum_hash" =~ ^[0-9a-f]{64}$ ]]

  checksum_name="${checksum_path##*/}"
  case "$checksum_name" in
    roles.sql|schema.sql|data.sql) ;;
    *)
      echo "Unexpected plaintext checksum member: $checksum_name" >&2
      exit 1
      ;;
  esac

  if [[ -n "${seen_plaintext_checksum_names[$checksum_name]:-}" ]]; then
    echo "Duplicate plaintext checksum member: $checksum_name" >&2
    exit 1
  fi
  seen_plaintext_checksum_names[$checksum_name]=1
  checksum_count=$((checksum_count + 1))
  printf '%s  %s\n' "$checksum_hash" "$checksum_name" >> "$normalized_plaintext_checksum"
done < "$work_dir/plaintext-sha256.txt"
[[ "$checksum_count" -eq 3 ]]

(
  cd "$work_dir"
  sha256sum -c "$(basename "$normalized_plaintext_checksum")"
)

[[ "$(jq -er '.schema_version' "$work_dir/manifest.json")" == 'myeongha-postgres-logical-backup-v1' ]]
[[ "$(jq -er '.project_ref' "$work_dir/manifest.json")" == "$EXPECTED_PROJECT_REF" ]]
[[ "$(jq -er '.source_sha' "$work_dir/manifest.json")" == "$EXPECTED_SOURCE_SHA" ]]

restore_started_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
restore_started_epoch="$(date -u +%s)"

# The Supabase CLI role dump can contain provider-managed role settings that
# exist in hosted Production but are intentionally not recreated by every
# self-hosted image revision. Never fabricate those roles in the drill target.
# Application-owned role creation remains fail-closed and must use myeongha_*.
unexpected_role_creations="$(
  grep -Ei '^[[:space:]]*CREATE[[:space:]]+(ROLE|USER)[[:space:]]+' "$work_dir/roles.sql" \
    | grep -Eiv '^[[:space:]]*CREATE[[:space:]]+(ROLE|USER)[[:space:]]+"myeongha_[a-z0-9_]+"' \
    || true
)"
if [[ -n "$unexpected_role_creations" ]]; then
  echo 'roles.sql contains a non-MyeongHa role creation; refusing to fabricate platform or unknown roles.' >&2
  printf '%s\n' "$unexpected_role_creations" >&2
  exit 1
fi

mapfile -t application_roles < <(
  sed -nE 's/^[[:space:]]*CREATE[[:space:]]+(ROLE|USER)[[:space:]]+"(myeongha_[a-z0-9_]+)".*/\2/p' "$work_dir/roles.sql" \
    | sort -u
)
if [[ ${#application_roles[@]} -eq 0 ]]; then
  echo 'roles.sql did not declare any MyeongHa application roles.' >&2
  exit 1
fi

roles_stdout="$work_dir/roles-restore.stdout"
roles_stderr="$work_dir/roles-restore.stderr"
set +e
psql "$RESTORE_ADMIN_DATABASE_URL" --set ON_ERROR_STOP=0 --set VERBOSITY=terse \
  --file "$work_dir/roles.sql" >"$roles_stdout" 2>"$roles_stderr"
roles_psql_status=$?
set -e
if [[ "$roles_psql_status" -ne 0 ]]; then
  echo 'psql could not complete the role restore stream.' >&2
  cat "$roles_stderr" >&2
  exit "$roles_psql_status"
fi

# Continue past SQL errors only to classify them. The sole tolerated SQL error
# is a missing provider-managed supabase_* role. Every other ERROR remains fatal.
unexpected_role_errors="$(
  grep -E 'ERROR:' "$roles_stderr" \
    | grep -Ev 'ERROR:[[:space:]]+role "supabase_[a-z0-9_]+" does not exist$' \
    || true
)"
if [[ -n "$unexpected_role_errors" ]]; then
  echo 'Unexpected roles.sql restore error.' >&2
  printf '%s\n' "$unexpected_role_errors" >&2
  exit 1
fi

mapfile -t provider_managed_roles_absent < <(
  grep -Eo 'role "supabase_[a-z0-9_]+" does not exist' "$roles_stderr" \
    | sed -E 's/^role "([a-z0-9_]+)" does not exist$/\1/' \
    | sort -u \
    || true
)

for role_name in "${application_roles[@]}"; do
  role_count="$(psql "$RESTORE_DATABASE_URL" -At --set ON_ERROR_STOP=1 \
    -c "select count(*) from pg_roles where rolname='${role_name}';")"
  if [[ "$role_count" != '1' ]]; then
    echo "Application role was not restored exactly once: $role_name" >&2
    exit 1
  fi
done

unsafe_application_roles="$(psql "$RESTORE_DATABASE_URL" -At --set ON_ERROR_STOP=1 -c \
  "select count(*) from pg_roles where rolname like 'myeongha\\_%' escape '\\' and (rolsuper or rolbypassrls);")"
[[ "$unsafe_application_roles" == '0' ]]

if [[ ${#provider_managed_roles_absent[@]} -gt 0 ]]; then
  printf 'Provider-managed roles absent from isolated target and not fabricated: %s\n' "${provider_managed_roles_absent[*]}"
fi

psql "$RESTORE_ADMIN_DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 --file "$work_dir/schema.sql"
psql "$RESTORE_ADMIN_DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' --file "$work_dir/data.sql"

# Baseline structural and authorization checks run through the ordinary postgres
# principal rather than the privileged replay principal. No user-owned row contents
# are emitted.
for table_name in subjects birth_profiles products product_offers data_deletion_jobs; do
  [[ "$(psql "$RESTORE_DATABASE_URL" -At --set ON_ERROR_STOP=1 -c "select to_regclass('public.${table_name}') is not null;")" == 't' ]]
done
[[ "$(psql "$RESTORE_DATABASE_URL" -At --set ON_ERROR_STOP=1 -c "select count(*) from pg_roles where rolname='myeongha_api_executor' and not rolsuper and not rolbypassrls;")" == '1' ]]
[[ "$(psql "$RESTORE_DATABASE_URL" -At --set ON_ERROR_STOP=1 -c \
  "select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = to_regprocedure('public.cmd_activate_content_release_v1(uuid,boolean)');")" == 'myeongha_content_publication_owner' ]]

restore_completed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
restore_completed_epoch="$(date -u +%s)"
duration_seconds=$((restore_completed_epoch - restore_started_epoch))
server_version="$(psql "$RESTORE_DATABASE_URL" -At --set ON_ERROR_STOP=1 -c 'show server_version;')"
provider_managed_roles_absent_json="$(printf '%s\n' "${provider_managed_roles_absent[@]}" | jq -Rsc 'split("\n") | map(select(length > 0))')"

mkdir -p "$(dirname "$RESTORE_EVIDENCE_PATH")"
jq -n \
  --arg schema_version 'myeongha-postgres-isolated-restore-drill-v1' \
  --arg source_sha "$EXPECTED_SOURCE_SHA" \
  --arg project_ref "$EXPECTED_PROJECT_REF" \
  --arg restore_server_version "$server_version" \
  --arg restore_started_at_utc "$restore_started_at" \
  --arg restore_completed_at_utc "$restore_completed_at" \
  --argjson isolated_restore_validation_duration_seconds "$duration_seconds" \
  --argjson provider_managed_roles_absent_from_target "$provider_managed_roles_absent_json" \
  '{
    schema_version: $schema_version,
    source_sha: $source_sha,
    project_ref: $project_ref,
    restore_target: "github-actions-loopback-supabase-postgres",
    restore_execution_principal: "supabase_admin-loopback-only",
    post_restore_validation_principal: "postgres-loopback-only",
    restore_server_version: $restore_server_version,
    restore_started_at_utc: $restore_started_at_utc,
    restore_completed_at_utc: $restore_completed_at_utc,
    isolated_restore_validation_duration_seconds: $isolated_restore_validation_duration_seconds,
    archive_integrity: "pass",
    application_role_restore: "pass",
    application_owner_restore: "pass",
    provider_managed_role_policy: "target-baseline-authoritative-no-fabrication",
    provider_managed_roles_absent_from_target: $provider_managed_roles_absent_from_target,
    required_tables: "pass",
    authorization_baseline: "pass",
    privacy_reconciliation: "not_exercised_by_this_workflow",
    dr_ready: false
  }' > "$RESTORE_EVIDENCE_PATH"

chmod 600 "$RESTORE_EVIDENCE_PATH"
echo 'Isolated PostgreSQL restore drill harness completed.'
