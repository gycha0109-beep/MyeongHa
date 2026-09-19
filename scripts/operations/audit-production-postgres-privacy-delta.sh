#!/usr/bin/env bash
set -euo pipefail
umask 077

encoded_password="$(python3 - <<'PY'
import os
import urllib.parse
print(urllib.parse.quote(os.environ['SUPABASE_DB_PASSWORD'], safe=''))
PY
)"
admin_pool_user="postgres.$SUPABASE_PROJECT_ID"
db_url="postgresql://${admin_pool_user}:${encoded_password}@${SUPABASE_PRODUCTION_SESSION_POOLER_HOST}:5432/postgres?sslmode=require"
echo "::add-mask::$db_url"

export PGOPTIONS='-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000'

counts_path="$RUNNER_TEMP/privacy-delta-counts.json"
evidence_dir="$RUNNER_TEMP/privacy-delta-audit-evidence"
evidence_path="$evidence_dir/privacy-delta-count-audit.json"
mkdir -p "$evidence_dir"

sql="$(cat <<'SQL'
begin transaction read only;
select jsonb_build_object(
  'data_deletion_jobs_requested_at', (select count(*)::bigint from public.data_deletion_jobs where requested_at > :'cutoff'::timestamptz),
  'share_artifacts_revoked_at', (select count(*)::bigint from public.share_artifacts where revoked_at > :'cutoff'::timestamptz),
  'device_installations_revoked_at', (select count(*)::bigint from public.device_installations where revoked_at > :'cutoff'::timestamptz),
  'life_facts_revoked_at', (select count(*)::bigint from public.life_facts where revoked_at > :'cutoff'::timestamptz),
  'memory_items_revoked_at', (select count(*)::bigint from public.memory_items where revoked_at > :'cutoff'::timestamptz),
  'record_access_grants_revoked_at', (select count(*)::bigint from public.record_access_grants where revoked_at > :'cutoff'::timestamptz),
  'subjects_non_active_updated_at', (select count(*)::bigint from public.subjects where status <> 'active' and updated_at > :'cutoff'::timestamptz)
)::text
where current_setting('transaction_read_only') = 'on';
rollback;
SQL
)"

if ! printf '%s\n' "$sql" | psql "$db_url" -X -qAt             -v ON_ERROR_STOP=1             -v "cutoff=$BACKUP_COMPLETED_AT_UTC" > "$counts_path"; then
  echo '::error title=Production privacy delta count query failed::Explicit READ ONLY transaction could not complete.'
  exit 1
fi

[[ -s "$counts_path" ]]

jq -e '
  type == "object"
  and (keys | sort) == ([
    "data_deletion_jobs_requested_at",
    "device_installations_revoked_at",
    "life_facts_revoked_at",
    "memory_items_revoked_at",
    "record_access_grants_revoked_at",
    "share_artifacts_revoked_at",
    "subjects_non_active_updated_at"
  ] | sort)
  and all(.[]; type == "number" and floor == . and . >= 0)
' "$counts_path" >/dev/null

total_count="$(jq '[.[]] | add' "$counts_path")"
observed_deltas=false
if [[ "$total_count" -gt 0 ]]; then
  observed_deltas=true
fi

jq -n             --arg schema_version 'myeongha-postgres-privacy-delta-count-audit-v1'             --arg backup_run_id "$BACKUP_RUN_ID"             --arg backup_source_sha "$BACKUP_SOURCE_SHA"             --arg backup_artifact_name "$BACKUP_ARTIFACT_NAME"             --arg backup_completed_at_utc "$BACKUP_COMPLETED_AT_UTC"             --arg audit_completed_at_utc "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"             --argjson counts "$(cat "$counts_path")"             --argjson total_count "$total_count"             --argjson observed_deltas "$observed_deltas" '
    {
      schema_version: $schema_version,
      backup_run_id: $backup_run_id,
      backup_source_sha: $backup_source_sha,
      backup_artifact_name: $backup_artifact_name,
      backup_completed_at_utc: $backup_completed_at_utc,
      audit_completed_at_utc: $audit_completed_at_utc,
      query_mode: "read_only_count_only",
      counts: $counts,
      observed_delta_total: $total_count,
      observed_deltas: $observed_deltas,
      authoritative_post_backup_source: false,
      authoritative_privacy_reconciliation: false,
      future_safe_privacy_reconciliation: false,
      dr_ready: false
    }
  ' > "$evidence_path"

chmod 600 "$evidence_path"

{
  echo '### PostgreSQL privacy delta count-only audit'
  echo
  printf -- '- backup run: `%s`\n' "$BACKUP_RUN_ID"
  printf -- '- backup completion point: `%s`\n' "$BACKUP_COMPLETED_AT_UTC"
  while IFS='=' read -r key value; do
    printf -- '- %s: `%s`\n' "$key" "$value"
  done < <(jq -r 'to_entries[] | "\(.key)=\(.value)"' "$counts_path")
  printf -- '- observed delta total: `%s`\n' "$total_count"
  echo
  echo 'This workflow reports count-only primary-database observations. It does not create a durable post-backup privacy authority, perform reconciliation, approve RPO/RTO, or make DR Ready true.'
} >> "$GITHUB_STEP_SUMMARY"

echo "evidence_path=$evidence_path" >> "$GITHUB_OUTPUT"
echo "observed_delta_total=$total_count" >> "$GITHUB_OUTPUT"
