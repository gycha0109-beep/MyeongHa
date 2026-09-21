#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${LEDGER_ARTIFACT_DIR:?LEDGER_ARTIFACT_DIR is required}"
: "${CANARY_EVIDENCE_DIR:?CANARY_EVIDENCE_DIR is required}"
: "${MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE:?MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${PRIVACY_RECONCILIATION_BACKUP_RUN_ID:?PRIVACY_RECONCILIATION_BACKUP_RUN_ID is required}"
: "${PRIVACY_RECONCILIATION_LEDGER_RUN_ID:?PRIVACY_RECONCILIATION_LEDGER_RUN_ID is required}"
: "${PRODUCTION_PRIVACY_CANARY_RUN_ID:?PRODUCTION_PRIVACY_CANARY_RUN_ID is required}"
: "${PRIVACY_RECONCILIATION_INCIDENT_REFERENCE_UTC:?PRIVACY_RECONCILIATION_INCIDENT_REFERENCE_UTC is required}"
: "${PRIVACY_RECONCILIATION_EVIDENCE_PATH:?PRIVACY_RECONCILIATION_EVIDENCE_PATH is required}"

[[ "$PRIVACY_RECONCILIATION_BACKUP_RUN_ID" =~ ^[1-9][0-9]*$ ]]
[[ "$PRIVACY_RECONCILIATION_LEDGER_RUN_ID" =~ ^[1-9][0-9]*$ ]]
[[ "$PRODUCTION_PRIVACY_CANARY_RUN_ID" =~ ^[1-9][0-9]*$ ]]
[[ "${#MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE}" -ge 32 ]]
incident_roundtrip="$(date -u -d "$PRIVACY_RECONCILIATION_INCIDENT_REFERENCE_UTC" +'%Y-%m-%dT%H:%M:%SZ')"
[[ "$incident_roundtrip" == "$PRIVACY_RECONCILIATION_INCIDENT_REFERENCE_UTC" ]]

psql_base=(psql -X -v ON_ERROR_STOP=1)
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

mapfile -t encrypted_archives < <(find "$LEDGER_ARTIFACT_DIR" -type f -name 'myeongha-privacy-ledger-*.tar.gz.enc' -print)
mapfile -t encrypted_checksums < <(find "$LEDGER_ARTIFACT_DIR" -type f -name 'myeongha-privacy-ledger-*.tar.gz.enc.sha256' -print)
mapfile -t public_manifests < <(find "$LEDGER_ARTIFACT_DIR" -type f -name 'myeongha-privacy-ledger-*.manifest.json' -print)
mapfile -t canary_evidence_files < <(find "$CANARY_EVIDENCE_DIR" -type f -name 'production-privacy-canary-public-evidence.json' -print)

[[ "${#encrypted_archives[@]}" -eq 1 ]]
[[ "${#encrypted_checksums[@]}" -eq 1 ]]
[[ "${#public_manifests[@]}" -eq 1 ]]
[[ "${#canary_evidence_files[@]}" -eq 1 ]]

encrypted_archive="${encrypted_archives[0]}"
encrypted_checksum="${encrypted_checksums[0]}"
public_manifest="${public_manifests[0]}"
canary_evidence="${canary_evidence_files[0]}"

jq -e \
  --argjson backup_run_id "$PRIVACY_RECONCILIATION_BACKUP_RUN_ID" \
  --argjson ledger_run_id "$PRIVACY_RECONCILIATION_LEDGER_RUN_ID" '
    .governedBackupRunId == $backup_run_id
    and .privacyRecoveryLedgerRunId == $ledger_run_id
    and .privacyRecoveryLedgerEventCount > 0
    and .accountDeletionStartedEventCount >= 1
    and .outputContainsIdentifiers == false
    and .outputContainsRowPayloads == false
    and .authoritativePrivacyReconciliation == false
    and .futureSafePrivacyReconciliation == false
    and .drReady == false
  ' "$canary_evidence" >/dev/null

jq -e \
  --argjson backup_run_id "$PRIVACY_RECONCILIATION_BACKUP_RUN_ID" \
  --arg archive_name "$(basename "$encrypted_archive")" '
    .schema_version == "myeongha-postgres-privacy-recovery-ledger-artifact-v1"
    and .backupRunId == $backup_run_id
    and .archive_name == $archive_name
    and (.encrypted_sha256 | type == "string" and test("^[0-9a-f]{64}$"))
    and .sourceAuthorityClass == "AUTHORITATIVE_CAPTURED_WINDOW_V1"
    and .authoritativePostBackupSource == true
    and .candidateSourceAuthority == false
    and .eventCount > 0
    and (.eventTypeCounts.ACCOUNT_DELETION_STARTED // 0) >= 1
    and .authoritativePrivacyReconciliation == false
    and .futureSafePrivacyReconciliation == false
    and .drReady == false
  ' "$public_manifest" >/dev/null

expected_cipher_sha="$(jq -er '.encrypted_sha256' "$public_manifest")"
[[ "$(sha256sum "$encrypted_archive" | awk '{print $1}')" == "$expected_cipher_sha" ]]
(
  cd "$LEDGER_ARTIFACT_DIR"
  sha256sum -c "$(basename "$encrypted_checksum")"
)

coverage_report="$tmp_dir/coverage-report.json"
node scripts/validate-postgres-privacy-recovery-ledger-coverage.mjs \
  --input "$public_manifest" \
  --incident-reference-at "$PRIVACY_RECONCILIATION_INCIDENT_REFERENCE_UTC" \
  --output "$coverage_report"
jq -e '
  .coverageStatus == "covered"
  and .recoveryServiceabilityGate == "pass"
  and .drReady == false
' "$coverage_report" >/dev/null

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

plaintext_archive="$tmp_dir/privacy-ledger.tar.gz"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$encrypted_archive" \
  -out "$plaintext_archive" \
  -pass env:MYEONGHA_PRIVACY_LEDGER_DERIVED_PASSPHRASE

tar -tzf "$plaintext_archive" | sed 's#^./##' | sort > "$tmp_dir/listing.txt"
printf '%s\n' plaintext-sha256.txt privacy-reconciliation-manifest.json | sort > "$tmp_dir/expected.txt"
cmp -s "$tmp_dir/listing.txt" "$tmp_dir/expected.txt"
tar -xzf "$plaintext_archive" -C "$tmp_dir"
rm -f "$plaintext_archive"

(
  cd "$tmp_dir"
  sha256sum -c plaintext-sha256.txt
)

manifest="$tmp_dir/privacy-reconciliation-manifest.json"
plan="$tmp_dir/privacy-plan.sql"
report="$tmp_dir/privacy-plan-report.json"

node - "$manifest" "$public_manifest" "$PRIVACY_RECONCILIATION_BACKUP_RUN_ID" <<'NODE'
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'));
const publicManifest = JSON.parse(await readFile(process.argv[3], 'utf8'));
const backupRunId = Number(process.argv[4]);

if (manifest.schema !== 'myeongha-postgres-privacy-reconciliation-manifest-v1') {
  throw new Error('authoritative privacy replay manifest schema mismatch');
}
if (manifest.backupRunId !== backupRunId || publicManifest.backupRunId !== backupRunId) {
  throw new Error('authoritative privacy replay backup binding mismatch');
}
if (manifest.sourceAuthority !== 'myeongha-production-postgres-privacy-ledger-v1') {
  throw new Error('authoritative privacy replay source authority mismatch');
}
if (manifest.sourceDigest !== publicManifest.sourceDigest) {
  throw new Error('authoritative privacy replay source digest mismatch');
}
if (manifest.incidentReferenceUtc !== publicManifest.capturedAt) {
  throw new Error('authoritative privacy replay captured-window boundary mismatch');
}
if (!Array.isArray(manifest.events) || manifest.events.length !== publicManifest.eventCount) {
  throw new Error('authoritative privacy replay event count mismatch');
}
const counts = {};
for (const event of manifest.events) counts[event.type] = (counts[event.type] ?? 0) + 1;
if ((counts.ACCOUNT_DELETION_STARTED ?? 0) < 1) {
  throw new Error('authoritative privacy replay requires non-zero account deletion evidence');
}
for (const [type, count] of Object.entries(publicManifest.eventTypeCounts ?? {})) {
  if ((counts[type] ?? 0) !== count) {
    throw new Error('authoritative privacy replay event type count mismatch');
  }
}
NODE

node scripts/build-postgres-privacy-reconciliation-plan.mjs \
  --input "$manifest" \
  --output "$plan" \
  --report "$report"

jq -e '
  .eventCount > 0
  and (.eventTypeCounts.ACCOUNT_DELETION_STARTED // 0) >= 1
  and .outputContainsIdentifiers == false
  and .outputContainsRowPayloads == false
  and .drReady == false
' "$report" >/dev/null

"${psql_base[@]}" -f "$plan" >/dev/null
"${psql_base[@]}" -f "$plan" >/dev/null

account_deletion_count=0
while IFS=$'\t' read -r subject_id deletion_job_id outbox_event_id; do
  [[ "$subject_id" =~ ^[0-9a-fA-F-]{36}$ ]]
  [[ "$deletion_job_id" =~ ^[0-9a-fA-F-]{36}$ ]]
  [[ "$outbox_event_id" =~ ^[0-9a-fA-F-]{36}$ ]]
  account_deletion_count=$((account_deletion_count + 1))

  auth_user_id="$("${psql_base[@]}" -Atc "select auth_user_id::text from public.subjects where id='$subject_id'::uuid;")"
  [[ "$auth_user_id" =~ ^[0-9a-fA-F-]{36}$ ]]

  lock_owner="privacy-restore-${GITHUB_RUN_ID:-local}-$account_deletion_count"
  claim="$("${psql_base[@]}" -Atqc "
    begin;
    set local role myeongha_system_executor;
    select subject_id::text||'|'||deletion_job_id::text||'|'||(reclaimed::int)
    from public.internal_claim_account_deletion_outbox_v1(
      '$outbox_event_id'::uuid,
      '$lock_owner',
      clock_timestamp()+interval '10 minutes'
    );
    commit;
  ")"
  [[ "$claim" == "$subject_id|$deletion_job_id|0" || "$claim" == "$subject_id|$deletion_job_id|1" ]]

  phase="$("${psql_base[@]}" -Atqc "
    begin;
    set local role myeongha_system_executor;
    select phase from public.internal_account_deletion_resume_state_v1(
      '$subject_id'::uuid,
      '$deletion_job_id'::uuid,
      '$lock_owner'
    );
    commit;
  ")"
  [[ "$phase" == "db_finalization_required" ]]

  finalizer="$("${psql_base[@]}" -Atqc "
    begin;
    set local role myeongha_system_executor;
    select (finalized::int)||'|'||(replayed::int)||'|'||(auth_mapping_present::int)
    from public.internal_finalize_account_deletion_db_v1(
      '$subject_id'::uuid,
      '$deletion_job_id'::uuid,
      '$lock_owner'
    );
    commit;
  ")"
  [[ "$finalizer" == "1|0|1" ]]

  post_db_phase="$("${psql_base[@]}" -Atqc "
    begin;
    set local role myeongha_system_executor;
    select phase from public.internal_account_deletion_resume_state_v1(
      '$subject_id'::uuid,
      '$deletion_job_id'::uuid,
      '$lock_owner'
    );
    commit;
  ")"
  [[ "$post_db_phase" == "auth_deletion_required" ]]

  "${psql_base[@]}" -c "delete from auth.users where id='$auth_user_id'::uuid;" >/dev/null

  post_auth_phase="$("${psql_base[@]}" -Atqc "
    begin;
    set local role myeongha_system_executor;
    select phase from public.internal_account_deletion_resume_state_v1(
      '$subject_id'::uuid,
      '$deletion_job_id'::uuid,
      '$lock_owner'
    );
    commit;
  ")"
  [[ "$post_auth_phase" == "completion_ack_required" ]]

  completion="$("${psql_base[@]}" -Atqc "
    begin;
    set local role myeongha_system_executor;
    select (completed::int)||'|'||(replayed::int)
    from public.internal_complete_account_deletion_v1(
      '$subject_id'::uuid,
      '$deletion_job_id'::uuid,
      '$lock_owner'
    );
    commit;
  ")"
  [[ "$completion" == "1|0" ]]

  terminal="$("${psql_base[@]}" -Atc "
    select
      (select status from public.subjects where id='$subject_id'::uuid)||'|'||
      (select case when auth_user_id is null then 'NOAUTH' else 'AUTH' end from public.subjects where id='$subject_id'::uuid)||'|'||
      (select count(*) from auth.users where id='$auth_user_id'::uuid)||'|'||
      (select count(*) from public.profiles where subject_id='$subject_id'::uuid)||'|'||
      (select count(*) from public.readings where subject_id='$subject_id'::uuid)||'|'||
      (select count(*) from public.share_artifacts where subject_id='$subject_id'::uuid)||'|'||
      (select count(*) from public.device_installations where subject_id='$subject_id'::uuid)||'|'||
      (select count(*) from public.notifications where subject_id='$subject_id'::uuid)||'|'||
      (select count(*) from public.memory_items where subject_id='$subject_id'::uuid)||'|'||
      (select count(*) from public.life_facts where subject_id='$subject_id'::uuid)||'|'||
      (select status from public.data_deletion_jobs where id='$deletion_job_id'::uuid)||'|'||
      (select status from public.outbox_events where id='$outbox_event_id'::uuid)||'|'||
      (select count(*) from public.commerce_account_links where subject_id='$subject_id'::uuid and (status <> 'revoked' or revoked_at is null));
  ")"
  [[ "$terminal" == "deleted|NOAUTH|0|0|0|0|0|0|0|0|completed|processed|0" ]]

  completion_replay="$("${psql_base[@]}" -Atqc "
    begin;
    set local role myeongha_system_executor;
    select (completed::int)||'|'||(replayed::int)
    from public.internal_complete_account_deletion_v1(
      '$subject_id'::uuid,
      '$deletion_job_id'::uuid,
      '$lock_owner'
    );
    commit;
  ")"
  [[ "$completion_replay" == "1|1" ]]
done < <(jq -r '.events[] | select(.type == "ACCOUNT_DELETION_STARTED") | [.subjectId, .deletionJobId, .outboxEventId] | @tsv' "$manifest")

[[ "$account_deletion_count" -ge 1 ]]
[[ "$account_deletion_count" -eq "$(jq -r '.eventTypeCounts.ACCOUNT_DELETION_STARTED' "$public_manifest")" ]]

mkdir -p "$(dirname "$PRIVACY_RECONCILIATION_EVIDENCE_PATH")"
node - \
  "$report" \
  "$public_manifest" \
  "$PRIVACY_RECONCILIATION_EVIDENCE_PATH" \
  "$PRIVACY_RECONCILIATION_BACKUP_RUN_ID" \
  "$PRIVACY_RECONCILIATION_LEDGER_RUN_ID" \
  "$PRODUCTION_PRIVACY_CANARY_RUN_ID" \
  "$PRIVACY_RECONCILIATION_INCIDENT_REFERENCE_UTC" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';

const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
const publicManifest = JSON.parse(await readFile(process.argv[3], 'utf8'));
const outputPath = process.argv[4];
const backupRunId = Number(process.argv[5]);
const ledgerRunId = Number(process.argv[6]);
const canaryRunId = Number(process.argv[7]);
const incidentReferenceUtc = process.argv[8];

const evidence = {
  schema_version: 'myeongha-postgres-restored-db-authoritative-privacy-reconciliation-v1',
  backup_workflow_run_id: backupRunId,
  privacy_ledger_workflow_run_id: ledgerRunId,
  production_privacy_canary_run_id: canaryRunId,
  incident_reference_utc: incidentReferenceUtc,
  authoritative_coverage_through: publicManifest.authoritativeCoverageThrough,
  execution_target: 'isolated-restored-postgres',
  production_nonzero_authoritative_delta: true,
  authoritative_post_backup_source: true,
  authoritative_source_scope: 'captured-window-only',
  authoritative_privacy_reconciliation: true,
  future_safe_privacy_reconciliation: false,
  recovered_state_finalization: 'production-ledger-isolated-pass',
  hosted_auth_provider_ack: 'production-canary-separate-plus-isolated-row-removal',
  personalization_access_resurrection_guard: 'pass',
  commerce_p5y_retention_guard: 'pass',
  replay_event_count: report.eventCount,
  event_type_counts: report.eventTypeCounts,
  replay_result: 'pass',
  second_identical_replay: 'idempotent-pass',
  completion_replay: 'idempotent-pass',
  output_contains_identifiers: false,
  output_contains_row_payloads: false,
  dr_ready: false,
};

await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
NODE

echo 'Authoritative Production privacy ledger replay completed on isolated restored PostgreSQL.'
