import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/postgres-isolated-restore-drill.yml';
const sourceResolverPath = 'scripts/operations/resolve-postgres-restore-source.sh';
const privacyRunnerPath = 'scripts/operations/run-restored-postgres-privacy-drill.sh';
const evidenceRunnerPath = 'scripts/operations/build-postgres-restore-evidence.sh';
const harnessPath = 'scripts/run-postgres-isolated-restore-drill.sh';
const portableReplayPath = 'scripts/build-postgres-portable-data-replay.mjs';
const privacySyntheticPath = 'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh';
const runbookPath = 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md';

for (const script of [
  sourceResolverPath,
  privacyRunnerPath,
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
  evidenceRunner,
  harness,
  portableReplay,
  privacySynthetic,
  runbook,
] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(sourceResolverPath, 'utf8'),
  readFile(privacyRunnerPath, 'utf8'),
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
  'run: bash scripts/operations/run-restored-postgres-privacy-drill.sh',
  'run: bash scripts/operations/build-postgres-restore-evidence.sh',
  'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7',
  '${{ runner.temp }}/restore-evidence/restore-evidence.json',
  '${{ runner.temp }}/restore-evidence/privacy-reconciliation-evidence.json',
  'retention-days: 30',
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
