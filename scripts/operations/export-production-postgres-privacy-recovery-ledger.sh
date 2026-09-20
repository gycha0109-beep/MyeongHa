#!/usr/bin/env bash
set -euo pipefail
umask 077

work_dir="$RUNNER_TEMP/privacy-recovery-ledger"
rm -rf "$work_dir"
mkdir -p "$work_dir"

cleanup() {
  exit_code=$?
  trap - EXIT
  rm -rf "$work_dir"
  exit "$exit_code"
}
trap cleanup EXIT

captured_at_utc="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

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

raw_source="$work_dir/raw-source.json"
manifest="$work_dir/privacy-reconciliation-manifest.json"
summary="$work_dir/privacy-recovery-ledger-summary.json"

sql="$(cat <<'SQL'
begin transaction read only;
with
account_jobs as (
  select
    dj.requested_at as occurred_at,
    dj.id as deletion_job_id,
    dj.subject_id,
    dj.request_dedupe_key,
    oe.id as outbox_event_id
  from public.data_deletion_jobs dj
  join public.outbox_events oe
    on oe.aggregate_type = 'data_deletion_job'
   and oe.aggregate_id = dj.id::text
   and oe.event_type = 'ACCOUNT_DELETION_STARTED'
   and oe.event_schema_version = 'v1'
  where dj.scope = 'account'
    and dj.requested_at > :'cutoff'::timestamptz
    and dj.requested_at <= :'captured'::timestamptz
),
supported_events as (
  select
    aj.occurred_at,
    'ACCOUNT_DELETION_STARTED'::text as event_type,
    aj.deletion_job_id::text as stable_key,
    jsonb_build_object(
      'occurredAt', to_char(aj.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'type', 'ACCOUNT_DELETION_STARTED',
      'deletionJobId', aj.deletion_job_id,
      'outboxEventId', aj.outbox_event_id,
      'requestDedupeKey', aj.request_dedupe_key,
      'subjectId', aj.subject_id
    ) as payload
  from account_jobs aj

  union all

  select
    sa.revoked_at,
    'SHARE_ARTIFACT_REVOKED',
    sa.id::text,
    jsonb_build_object(
      'occurredAt', to_char(sa.revoked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'type', 'SHARE_ARTIFACT_REVOKED',
      'shareArtifactId', sa.id,
      'subjectId', sa.subject_id
    )
  from public.share_artifacts sa
  where sa.status = 'revoked'
    and sa.revoked_at > :'cutoff'::timestamptz
    and sa.revoked_at <= :'captured'::timestamptz

  union all

  select
    di.revoked_at,
    'DEVICE_INSTALLATION_REVOKED',
    di.id::text,
    jsonb_build_object(
      'occurredAt', to_char(di.revoked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'type', 'DEVICE_INSTALLATION_REVOKED',
      'installationId', di.id,
      'subjectId', di.subject_id
    )
  from public.device_installations di
  where di.revoked_at > :'cutoff'::timestamptz
    and di.revoked_at <= :'captured'::timestamptz

  union all

  select
    mi.revoked_at,
    'MEMORY_ITEM_REVOKED',
    mi.id::text,
    jsonb_build_object(
      'occurredAt', to_char(mi.revoked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'type', 'MEMORY_ITEM_REVOKED',
      'memoryItemId', mi.id,
      'subjectId', mi.subject_id
    )
  from public.memory_items mi
  where mi.revoked_at > :'cutoff'::timestamptz
    and mi.revoked_at <= :'captured'::timestamptz

  union all

  select
    lf.revoked_at,
    'LIFE_FACT_REVOKED',
    lf.id::text,
    jsonb_build_object(
      'occurredAt', to_char(lf.revoked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'type', 'LIFE_FACT_REVOKED',
      'lifeFactId', lf.id,
      'subjectId', lf.subject_id
    )
  from public.life_facts lf
  where lf.revoked_at > :'cutoff'::timestamptz
    and lf.revoked_at <= :'captured'::timestamptz

  union all

  select
    g.revoked_at,
    case when g.memory_item_id is not null
      then 'MEMORY_CHARACTER_GRANT_REVOKED'
      else 'LIFE_FACT_CHARACTER_GRANT_REVOKED'
    end,
    g.id::text,
    case when g.memory_item_id is not null
      then jsonb_build_object(
        'occurredAt', to_char(g.revoked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'type', 'MEMORY_CHARACTER_GRANT_REVOKED',
        'memoryItemId', g.memory_item_id,
        'characterId', g.grantee_character_id,
        'subjectId', g.subject_id
      )
      else jsonb_build_object(
        'occurredAt', to_char(g.revoked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'type', 'LIFE_FACT_CHARACTER_GRANT_REVOKED',
        'lifeFactId', g.life_fact_id,
        'characterId', g.grantee_character_id,
        'subjectId', g.subject_id
      )
    end
  from public.record_access_grants g
  where g.revoked_at > :'cutoff'::timestamptz
    and g.revoked_at <= :'captured'::timestamptz
),
unsupported as (
  select
    (
      select count(*)::bigint
      from public.data_deletion_jobs dj
      where dj.scope = 'account'
        and dj.requested_at > :'cutoff'::timestamptz
        and dj.requested_at <= :'captured'::timestamptz
        and (
          select count(*)
          from public.outbox_events oe
          where oe.aggregate_type = 'data_deletion_job'
            and oe.aggregate_id = dj.id::text
            and oe.event_type = 'ACCOUNT_DELETION_STARTED'
            and oe.event_schema_version = 'v1'
        ) <> 1
    ) as account_deletion_without_exact_outbox_count,
    (
      select count(*)::bigint
      from public.data_deletion_jobs dj
      where dj.scope <> 'account'
        and dj.requested_at > :'cutoff'::timestamptz
        and dj.requested_at <= :'captured'::timestamptz
    ) as non_account_deletion_job_count,
    (
      select count(*)::bigint
      from public.subjects s
      where s.status <> 'active'
        and s.updated_at > :'cutoff'::timestamptz
        and s.updated_at <= :'captured'::timestamptz
        and not (
          s.status in ('deletion_pending', 'deleted')
          and exists (
            select 1
            from public.data_deletion_jobs dj
            join public.outbox_events oe
              on oe.aggregate_type = 'data_deletion_job'
             and oe.aggregate_id = dj.id::text
             and oe.event_type = 'ACCOUNT_DELETION_STARTED'
             and oe.event_schema_version = 'v1'
            where dj.subject_id = s.id
              and dj.scope = 'account'
              and dj.requested_at > :'cutoff'::timestamptz
              and dj.requested_at <= :'captured'::timestamptz
          )
        )
    ) as unsupported_subject_lifecycle_count
)
select jsonb_build_object(
  'events',
  coalesce(
    (
      select jsonb_agg(se.payload order by se.occurred_at, se.event_type, se.stable_key)
      from supported_events se
    ),
    '[]'::jsonb
  ),
  'unsupported',
  jsonb_build_object(
    'accountDeletionWithoutExactOutboxCount', u.account_deletion_without_exact_outbox_count,
    'nonAccountDeletionJobCount', u.non_account_deletion_job_count,
    'unsupportedSubjectLifecycleCount', u.unsupported_subject_lifecycle_count
  )
)::text
from unsupported u
where current_setting('transaction_read_only') = 'on';
rollback;
SQL
)"

if ! printf '%s\n' "$sql" | psql "$db_url" -X -qAt \
  -v ON_ERROR_STOP=1 \
  -v "cutoff=$BACKUP_COMPLETED_AT_UTC" \
  -v "captured=$captured_at_utc" > "$raw_source"; then
  echo '::error title=Privacy recovery ledger source query failed::Explicit READ ONLY transaction could not complete.'
  exit 1
fi

[[ -s "$raw_source" ]]
jq -e '
  type == "object"
  and (.events | type == "array")
  and (.unsupported | type == "object")
  and (.unsupported | keys | sort) == ([
    "accountDeletionWithoutExactOutboxCount",
    "nonAccountDeletionJobCount",
    "unsupportedSubjectLifecycleCount"
  ] | sort)
  and all(.unsupported[]; type == "number" and floor == . and . >= 0)
' "$raw_source" >/dev/null

unsupported_total="$(jq '[.unsupported[]] | add' "$raw_source")"
if [[ "$unsupported_total" -ne 0 ]]; then
  echo "::error title=Privacy recovery ledger incomplete::Unsupported post-backup privacy/lifecycle deltas were observed; fail closed rather than exporting a partial ledger."
  jq -r '.unsupported | to_entries[] | "- \(.key): \(.value)"' "$raw_source" >> "$GITHUB_STEP_SUMMARY"
  exit 1
fi

node scripts/build-postgres-privacy-recovery-ledger-manifest.mjs \
  --input "$raw_source" \
  --backup-run-id "$BACKUP_RUN_ID" \
  --backup-completed-at "$BACKUP_COMPLETED_AT_UTC" \
  --captured-at "$captured_at_utc" \
  --manifest "$manifest" \
  --summary "$summary"

jq -e '
  .sourceAuthorityClass == "AUTHORITATIVE_CAPTURED_WINDOW_V1"
  and .authoritativeCoverageThrough == .capturedAt
  and .serviceabilityCoverageRule == "incident_reference_must_not_exceed_authoritative_coverage_through"
  and .candidateSourceAuthority == false
  and .authoritativePostBackupSource == true
  and .authoritativePrivacyReconciliation == false
  and .futureSafePrivacyReconciliation == false
  and .drReady == false
' "$summary" >/dev/null

manifest_sha256="$(sha256sum "$manifest" | awk '{print $1}')"
printf '%s  %s\n' "$manifest_sha256" "$(basename "$manifest")" > "$work_dir/plaintext-sha256.txt"

ledger_passphrase="$(python3 - <<'PY'
import base64
import hashlib
import hmac
import os
root = os.environ['MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE'].encode('utf-8')
value = hmac.new(root, b'myeongha-postgres-privacy-recovery-ledger-v1', hashlib.sha256).digest()
print(base64.b64encode(value).decode('ascii'))
PY
)"
export MYEONGHA_PRIVACY_LEDGER_DERIVED_PASSPHRASE="$ledger_passphrase"
echo "::add-mask::$MYEONGHA_PRIVACY_LEDGER_DERIVED_PASSPHRASE"

ledger_stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
plaintext_archive="$work_dir/myeongha-privacy-ledger-${ledger_stamp}.tar.gz"
encrypted_archive="$RUNNER_TEMP/myeongha-privacy-ledger-${ledger_stamp}.tar.gz.enc"
tar -C "$work_dir" -czf "$plaintext_archive" \
  privacy-reconciliation-manifest.json plaintext-sha256.txt

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "$plaintext_archive" \
  -out "$encrypted_archive" \
  -pass env:MYEONGHA_PRIVACY_LEDGER_DERIVED_PASSPHRASE
rm -f "$plaintext_archive" "$raw_source" "$manifest"

encrypted_sha256="$(sha256sum "$encrypted_archive" | awk '{print $1}')"
checksum="${encrypted_archive}.sha256"
printf '%s  %s\n' "$encrypted_sha256" "$(basename "$encrypted_archive")" > "$checksum"

public_manifest="$RUNNER_TEMP/myeongha-privacy-ledger-${ledger_stamp}.manifest.json"
jq \
  --arg schema_version 'myeongha-postgres-privacy-recovery-ledger-artifact-v1' \
  --arg source_sha "$GITHUB_SHA" \
  --arg backup_source_sha "$BACKUP_SOURCE_SHA" \
  --arg backup_artifact_name "$BACKUP_ARTIFACT_NAME" \
  --arg encrypted_sha256 "$encrypted_sha256" \
  --arg archive_name "$(basename "$encrypted_archive")" \
  '. + {
    schema_version: $schema_version,
    workflow_source_sha: $source_sha,
    backup_source_sha: $backup_source_sha,
    backup_artifact_name: $backup_artifact_name,
    encrypted_sha256: $encrypted_sha256,
    archive_name: $archive_name
  }' "$summary" > "$public_manifest"

rm -f "$summary" "$work_dir/plaintext-sha256.txt"

echo "archive=$encrypted_archive" >> "$GITHUB_OUTPUT"
echo "checksum=$checksum" >> "$GITHUB_OUTPUT"
echo "public_manifest=$public_manifest" >> "$GITHUB_OUTPUT"
echo "artifact_name=myeongha-privacy-ledger-${ledger_stamp}" >> "$GITHUB_OUTPUT"
echo "event_count=$(jq -r '.eventCount' "$public_manifest")" >> "$GITHUB_OUTPUT"
echo "captured_at_utc=$captured_at_utc" >> "$GITHUB_OUTPUT"

{
  echo '### PostgreSQL privacy recovery ledger authority'
  echo
  printf -- '- backup run: `%s`\n' "$BACKUP_RUN_ID"
  printf -- '- backup cutoff: `%s`\n' "$BACKUP_COMPLETED_AT_UTC"
  printf -- '- captured at: `%s`\n' "$captured_at_utc"
  printf -- '- replay-supported event count: `%s`\n' "$(jq -r '.eventCount' "$public_manifest")"
  echo
  echo 'This encrypted artifact is authoritative only for the exact governed backup cutoff through captured-at window recorded above. Recovery must fail closed when its incident reference is later than captured-at. Snapshot cadence is operational mechanics, not an approved RPO. Authoritative reconciliation, RPO/RTO, and DR Ready remain separately gated.'
} >> "$GITHUB_STEP_SUMMARY"

trap - EXIT
rm -rf "$work_dir"
