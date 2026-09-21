import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/postgres-isolated-restore-drill.yml';
const sourceResolverPath = 'scripts/operations/resolve-postgres-restore-source.sh';
const privacyRunnerPath = 'scripts/operations/run-restored-postgres-privacy-drill.sh';
const authoritativePrivacySourcePath =
  'scripts/operations/resolve-postgres-authoritative-privacy-replay-source.sh';
const authoritativePrivacyRunnerPath =
  'scripts/operations/run-restored-postgres-authoritative-privacy-replay.sh';
const evidenceRunnerPath = 'scripts/operations/build-postgres-restore-evidence.sh';
const harnessPath = 'scripts/run-postgres-isolated-restore-drill.sh';
const portableReplayPath = 'scripts/build-postgres-portable-data-replay.mjs';
const privacySyntheticPath = 'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh';
const runbookPath = 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md';

for (const script of [
  sourceResolverPath,
  privacyRunnerPath,
  authoritativePrivacySourcePath,
  authoritativePrivacyRunnerPath,
  evidenceRunnerPath,
  harnessPath,
  privacySyntheticPath,
]) {
  execFileSync('bash', ['-n', script], { stdio: 'inherit' });
}

const [
  workflow,
  sourceResolver,
  privacyRunner,
  authoritativePrivacySource,
  authoritativePrivacyRunner,
  evidenceRunner,
  harness,
  portableReplay,
  privacySynthetic,
  runbook,
] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(sourceResolverPath, 'utf8'),
  readFile(privacyRunnerPath, 'utf8'),
  readFile(authoritativePrivacySourcePath, 'utf8'),
  readFile(authoritativePrivacyRunnerPath, 'utf8'),
  readFile(evidenceRunnerPath, 'utf8'),
  readFile(harnessPath, 'utf8'),
  readFile(portableReplayPath, 'utf8'),
  readFile(privacySyntheticPath, 'utf8'),
  readFile(runbookPath, 'utf8'),
]);

function section(source, start, next) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return '';
  const rest = source.slice(startIndex + start.length);
  const nextIndex = rest.indexOf(next);
  return nextIndex < 0 ? rest : rest.slice(0, nextIndex);
}

const onSection = section(workflow, 'on:\n', '\npermissions:');
const permissionsSection = section(workflow, 'permissions:\n', '\nconcurrency:');

for (const fragment of [
  'name: PostgreSQL Isolated Restore Drill',
  'workflow_dispatch:',
  'backup_run_id:',
  'incident_reference_utc:',
  'privacy_ledger_run_id:',
  'production_privacy_canary_run_id:',
  'environment: production',
  'image: ghcr.io/supabase/postgres:17.6.1.166',
  'POSTGRES_PASSWORD: restore-drill',
  'EXPECTED_PROJECT_REF: cnsfpcdiyofqvhpcegfc',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE }}',
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
  'run: bash scripts/operations/resolve-postgres-restore-source.sh',
  'uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7',
  'artifact-ids: ${{ steps.source.outputs.artifact_id }}',
  'run: bash scripts/run-postgres-isolated-restore-drill.sh',
  'Exercise synthetic privacy reconciliation and finalization on restored database',
  'run: bash scripts/operations/run-restored-postgres-privacy-drill.sh',
  'Resolve authoritative Production privacy replay provenance',
  'run: bash scripts/operations/resolve-postgres-authoritative-privacy-replay-source.sh',
  'Download authoritative privacy ledger artifact',
  'Download Production privacy canary public evidence',
  'Replay authoritative Production privacy ledger on restored database',
  'run: bash scripts/operations/run-restored-postgres-authoritative-privacy-replay.sh',
  'run: bash scripts/operations/build-postgres-restore-evidence.sh',
  'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7',
  '${{ runner.temp }}/restore-evidence/*.json',
  'retention-days: 30',
  "echo 'synthetic_privacy_reconciliation_mechanics=replay_and_finalization_exercised_on_restored_db'",
  "echo 'privacy_reconciliation=synthetic_captured_window_authority_mechanics_only'",
  "echo 'hosted_auth_provider_ack=synthetic_only_real_provider_proven_separately'",
  "echo 'authoritative_privacy_reconciliation=production_nonzero_captured_window_replay_proven'",
  "echo 'future_safe_privacy_reconciliation=false'",
  "echo 'dr_ready=false'",
]) {
  if (!workflow.includes(fragment)) {
    throw new Error('Missing isolated restore workflow invariant: ' + fragment);
  }
}

if ((onSection.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Restore drill must expose exactly one manual workflow_dispatch trigger.');
}
for (const forbidden of ['push:', 'pull_request:', 'schedule:']) {
  if (onSection.includes(forbidden)) {
    throw new Error('Restore drill must remain manual-only; forbidden trigger: ' + forbidden);
  }
}
if (!permissionsSection.includes('actions: read') || !permissionsSection.includes('contents: read')) {
  throw new Error('Restore drill requires read-only Actions and repository permissions.');
}
if (permissionsSection.includes('write')) {
  throw new Error('Restore drill must not request write permissions.');
}

const sourceContract = [
  '.name == "Production PostgreSQL Logical Backup"',
  '.path == ".github/workflows/production-postgres-backup.yml"',
  '.conclusion == "success"',
  '.head_branch == "main"',
  '(.event == "schedule" or .event == "workflow_dispatch")',
  '.expired == false',
  '^myeongha-postgres-[0-9]{8}T[0-9]{6}Z$',
  'echo "artifact_id=$artifact_id" >> "$GITHUB_OUTPUT"',
  'echo "source_sha=$source_sha" >> "$GITHUB_OUTPUT"',
];
for (const fragment of sourceContract) {
  if (!sourceResolver.includes(fragment)) {
    throw new Error('Missing governed backup source invariant: ' + fragment);
  }
}

for (const fragment of [
  "readonly RESTORE_DATABASE_URL='postgresql://postgres:restore-drill@127.0.0.1:5432/postgres'",
  "readonly RESTORE_ADMIN_DATABASE_URL='postgresql://supabase_admin:restore-drill@127.0.0.1:5432/postgres'",
  'myeongha-postgres-backup-artifact-v1',
  'sha256sum -c',
  'openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000',
  'roles.portable.sql',
  'target-copy-catalog.json',
  'node scripts/build-postgres-portable-data-replay.mjs',
  'auth.users',
  'subject_auth_user_referential_integrity: "pass"',
  'restore_target: "github-actions-loopback-supabase-postgres"',
  'dr_ready: false',
]) {
  if (!harness.includes(fragment)) {
    throw new Error('Missing isolated restore harness invariant: ' + fragment);
  }
}

for (const fragment of [
  'myeongha-postgres-portable-data-replay-v2',
  "application_schema_policy: 'public-fail-closed'",
  "provider_schema_policy: 'target-compatible-column-projection'",
  'Application COPY target mismatch',
  'target_requires_unbacked_columns',
  'projectCopyRow',
  'replayed_provider_relations',
]) {
  if (!portableReplay.includes(fragment)) {
    throw new Error('Missing portable replay invariant: ' + fragment);
  }
}

for (const fragment of [
  'PRIVACY_RECONCILIATION_BACKUP_COMPLETED_AT_UTC',
  'bash scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh',
]) {
  if (!privacyRunner.includes(fragment)) {
    throw new Error('Missing restored privacy drill orchestration invariant: ' + fragment);
  }
}

for (const fragment of [
  'synthetic_fixture: true',
  'authoritative_post_backup_source: true',
  "authoritative_source_scope: 'captured-window-only'",
  'authoritative_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: false',
  "recovered_state_finalization: 'synthetic-isolated-pass'",
  "hosted_auth_provider_ack: 'synthetic-row-removal-only-hosted-canary-35522208400-separate'",
  "personalization_access_resurrection_guard: 'pass'",
  "commerce_p5y_retention_guard: 'pass'",
  "replay_result: 'pass'",
  "second_identical_replay: 'idempotent-pass'",
  "negative_terminal_state_guard: 'fail-closed-pass'",
  'dr_ready: false',
]) {
  if (!privacySynthetic.includes(fragment)) {
    throw new Error('Missing restored-db privacy drill invariant: ' + fragment);
  }
}

for (const fragment of [
  '.name == "Production PostgreSQL Privacy Recovery Ledger"',
  '.path == ".github/workflows/production-postgres-privacy-recovery-ledger.yml"',
  '.name == "Production Privacy Recovery Canary"',
  '.path == ".github/workflows/production-privacy-recovery-canary.yml"',
  '^myeongha-privacy-ledger-[0-9]{8}T[0-9]{6}Z
  '--backup-run-id "$BACKUP_RUN_ID"',
  '--incident-reference-utc "$INCIDENT_REFERENCE_UTC"',
  'chmod 600 "$RESTORE_EVIDENCE_PATH"',
]) {
  if (!evidenceRunner.includes(fragment)) {
    throw new Error('Missing restore evidence orchestration invariant: ' + fragment);
  }
}

const isolatedRuntime =
  workflow +
  '\n' +
  sourceResolver +
  '\n' +
  privacyRunner +
  '\n' +
  authoritativePrivacySource +
  '\n' +
  authoritativePrivacyRunner +
  '\n' +
  evidenceRunner +
  '\n' +
  harness;
for (const fragment of [
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'pooler.supabase.com',
  'api.supabase.com/v1/projects',
  'myeongha.vercel.app',
  'gcloud ',
  'service_role',
]) {
  if (isolatedRuntime.includes(fragment)) {
    throw new Error('Restore drill crossed the isolated/local boundary: ' + fragment);
  }
}

for (const fragment of [
  '.github/workflows/postgres-isolated-restore-drill.yml',
  'GitHub Actions loopback Supabase PostgreSQL 17.6.1.166',
  'manual-only',
  'does not accept a remote restore database URL',
  'must not fabricate missing provider-managed roles',
  'identity continuity',
  'DR Ready = FALSE / NOT EVIDENCED',
]) {
  if (!runbook.includes(fragment)) {
    throw new Error('Restore-drill runbook lost required boundary: ' + fragment);
  }
}

console.log(
  'MyeongHa isolated PostgreSQL restore workflow boundary verification passed: governed backup restore, synthetic privacy mechanics, optional Production non-zero authoritative ledger replay/finalization, identifier-free evidence, and DR fail-closed semantics are pinned.',
);
,
  'production-privacy-recovery-canary-$PRODUCTION_PRIVACY_CANARY_RUN_ID',
  'echo "ledger_artifact_id=$ledger_artifact_id" >> "$GITHUB_OUTPUT"',
  'echo "canary_artifact_id=$canary_artifact_id" >> "$GITHUB_OUTPUT"',
]) {
  if (!authoritativePrivacySource.includes(fragment)) {
    throw new Error('Missing authoritative privacy source invariant: ' + fragment);
  }
}

for (const fragment of [
  'myeongha-postgres-privacy-recovery-ledger-artifact-v1',
  'AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'production-privacy-canary-public-evidence.json',
  'validate-postgres-privacy-recovery-ledger-coverage.mjs',
  'myeongha-production-postgres-privacy-ledger-v1',
  'build-postgres-privacy-reconciliation-plan.mjs',
  '"${psql_base[@]}" -f "$plan" >/dev/null',
  'set local role myeongha_system_executor',
  'internal_claim_account_deletion_outbox_v1',
  'internal_finalize_account_deletion_db_v1',
  'delete from auth.users',
  'internal_complete_account_deletion_v1',
  "authoritative_privacy_reconciliation: true",
  "future_safe_privacy_reconciliation: false",
  "production_nonzero_authoritative_delta: true",
  "output_contains_identifiers: false",
  "output_contains_row_payloads: false",
  "dr_ready: false",
]) {
  if (!authoritativePrivacyRunner.includes(fragment)) {
    throw new Error('Missing authoritative restored privacy replay invariant: ' + fragment);
  }
}

for (const fragment of [
  'node scripts/build-postgres-restore-evidence-envelope.mjs',
  '--backup-run-id "$BACKUP_RUN_ID"',
  '--incident-reference-utc "$INCIDENT_REFERENCE_UTC"',
  'chmod 600 "$RESTORE_EVIDENCE_PATH"',
]) {
  if (!evidenceRunner.includes(fragment)) {
    throw new Error('Missing restore evidence orchestration invariant: ' + fragment);
  }
}

const isolatedRuntime = workflow + '\n' + sourceResolver + '\n' + privacyRunner + '\n' + evidenceRunner + '\n' + harness;
for (const fragment of [
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'pooler.supabase.com',
  'api.supabase.com/v1/projects',
  'myeongha.vercel.app',
  'gcloud ',
  'service_role',
]) {
  if (isolatedRuntime.includes(fragment)) {
    throw new Error('Restore drill crossed the isolated/local boundary: ' + fragment);
  }
}

for (const fragment of [
  '.github/workflows/postgres-isolated-restore-drill.yml',
  'GitHub Actions loopback Supabase PostgreSQL 17.6.1.166',
  'manual-only',
  'does not accept a remote restore database URL',
  'must not fabricate missing provider-managed roles',
  'identity continuity',
  'DR Ready = FALSE / NOT EVIDENCED',
]) {
  if (!runbook.includes(fragment)) {
    throw new Error('Restore-drill runbook lost required boundary: ' + fragment);
  }
}

console.log('MyeongHa isolated PostgreSQL restore workflow boundary verification passed.');
