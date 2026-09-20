import { readFile } from 'node:fs/promises';

import {
  PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1,
  PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1,
  buildPrivacyRecoveryLedgerManifest,
} from './build-postgres-privacy-recovery-ledger-manifest.mjs';
import { validatePrivacyRecoveryLedgerCoverage } from './validate-postgres-privacy-recovery-ledger-coverage.mjs';

const paths = {
  workflow: '.github/workflows/production-postgres-privacy-recovery-ledger.yml',
  runner: 'scripts/operations/export-production-postgres-privacy-recovery-ledger.sh',
  builder: 'scripts/build-postgres-privacy-recovery-ledger-manifest.mjs',
  coverage: 'scripts/validate-postgres-privacy-recovery-ledger-coverage.mjs',
  decisions: 'docs/P0_DECISION_REGISTER.md',
  authority: 'docs/operations/POSTGRES_PRIVACY_RECOVERY_LEDGER_AUTHORITY_V1.md',
  historicalCandidate: 'docs/operations/POSTGRES_PRIVACY_RECOVERY_LEDGER_CANDIDATE_V1.md',
  status: 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md',
};

const entries = await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
);
const files = Object.fromEntries(entries);
const contract = files.workflow + '\n' + files.runner;

function requireFragment(key, fragment) {
  if (!files[key].includes(fragment)) {
    throw new Error(`${paths[key]} is missing privacy ledger authority fragment: ${fragment}`);
  }
}

for (const fragment of [
  'name: Production PostgreSQL Privacy Recovery Ledger',
  'workflow_dispatch:',
  'schedule:',
  "cron: '47 * * * *'",
  'actions: read',
  'contents: read',
  'environment: production',
  'SUPABASE_DB_PASSWORD: ' + '$' + '{{ secrets.SUPABASE_DB_PASSWORD }}',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST: ' + '$' + '{{ secrets.SUPABASE_PRODUCTION_SESSION_POOLER_HOST }}',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE: ' + '$' + '{{ secrets.MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE }}',
  '.name == "Production PostgreSQL Logical Backup"',
  '.path == ".github/workflows/production-postgres-backup.yml"',
  'begin transaction read only;',
  "where current_setting('transaction_read_only') = 'on';",
  'rollback;',
  'ACCOUNT_DELETION_STARTED',
  'SHARE_ARTIFACT_REVOKED',
  'DEVICE_INSTALLATION_REVOKED',
  'MEMORY_ITEM_REVOKED',
  'LIFE_FACT_REVOKED',
  'MEMORY_CHARACTER_GRANT_REVOKED',
  'LIFE_FACT_CHARACTER_GRANT_REVOKED',
  "s.status in ('deletion_pending', 'deleted')",
  "oe.event_type = 'ACCOUNT_DELETION_STARTED'",
  "oe.event_schema_version = 'v1'",
  'accountDeletionWithoutExactOutboxCount',
  'nonAccountDeletionJobCount',
  'unsupportedSubjectLifecycleCount',
  'build-postgres-privacy-recovery-ledger-manifest.mjs',
  'AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'incident_reference_must_not_exceed_authoritative_coverage_through',
  'openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000',
  'retention-days: 30',
  'authoritative only for the exact governed backup cutoff through captured-at window',
]) {
  if (!contract.includes(fragment)) {
    throw new Error('Missing privacy recovery ledger workflow contract fragment: ' + fragment);
  }
}

for (const fragment of [
  'SUPABASE_SERVICE_ROLE_KEY',
  'sslmode=disable',
  'pg_dump',
  'supabase db dump',
  'authoritativePrivacyReconciliation: true',
  'futureSafePrivacyReconciliation: true',
  'drReady: true',
  'dr_ready: true',
]) {
  if (contract.toLowerCase().includes(fragment.toLowerCase())) {
    throw new Error('Forbidden privacy recovery ledger workflow fragment: ' + fragment);
  }
}

for (const fragment of [
  'myeongha-production-postgres-privacy-ledger-v1',
  'myeongha-postgres-privacy-recovery-ledger-summary-v1',
  'sourceAuthorityClass: \'AUTHORITATIVE_CAPTURED_WINDOW_V1\'',
  'authoritativeCoverageThrough: normalizedCapturedAt.text',
  "incident_reference_must_not_exceed_authoritative_coverage_through",
  'candidateSourceAuthority: false',
  'authoritativePostBackupSource: true',
  'authoritativePrivacyReconciliation: false',
  'futureSafePrivacyReconciliation: false',
  'drReady: false',
]) {
  requireFragment('builder', fragment);
}

for (const fragment of [
  'incident reference exceeds authoritative ledger coverage',
  'incident reference precedes governed backup completion',
  'recoveryServiceabilityGate: \'pass\'',
  'outputContainsIdentifiers: false',
  'drReady: false',
]) {
  requireFragment('coverage', fragment);
}

for (const fragment of [
  'authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'serviceability_guard: incident_reference_utc <= authoritative_coverage_through',
  'snapshot_cadence_is_rpo: false',
  'authoritative_post_backup_source: BOUNDED_CAPTURED_WINDOW_AUTHORITY',
  'authoritative_privacy_reconciliation: false',
  'dr_ready: false',
]) {
  requireFragment('decisions', fragment);
}

for (const fragment of [
  'authoritative post-backup privacy source **only for its explicit captured window**',
  'incident_reference_utc <= authoritative_coverage_through',
  'hourly capture cadence is operational mechanics only',
  'promoted authoritative workflow runtime  = PROVEN — run 35539838537 / artifact 10614412005',
  'DR Ready                                 = false',
]) {
  requireFragment('authority', fragment);
}

for (const fragment of [
  'CANDIDATE TRANSPORT MECHANICS / NOT AUTHORITATIVE',
  'workflow run                      = 35361080803 / SUCCESS',
  'authoritative_post_backup_source = false',
]) {
  requireFragment('historicalCandidate', fragment);
}

for (const fragment of [
  'privacy_recovery_ledger_run_id: 35539838537',
  'privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'authoritative_post_backup_source: true_bounded_captured_window_only',
  'authoritative_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: false',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
]) {
  requireFragment('status', fragment);
}

const rawSource = {
  events: [
    {
      occurredAt: '2026-09-18T09:23:20.000Z',
      type: 'ACCOUNT_DELETION_STARTED',
      deletionJobId: '10000000-0000-0000-0000-000000000001',
      outboxEventId: '20000000-0000-0000-0000-000000000001',
      requestDedupeKey: 'delete-account-1',
      subjectId: '30000000-0000-0000-0000-000000000001',
    },
    {
      occurredAt: '2026-09-18T09:23:21.000Z',
      type: 'MEMORY_ITEM_REVOKED',
      memoryItemId: '60000000-0000-0000-0000-000000000001',
      subjectId: '30000000-0000-0000-0000-000000000001',
    },
  ],
  unsupported: {
    accountDeletionWithoutExactOutboxCount: 0,
    nonAccountDeletionJobCount: 0,
    unsupportedSubjectLifecycleCount: 0,
  },
};

const args = {
  rawSource,
  backupRunId: 35329018925,
  backupCompletedAt: '2026-09-18T09:23:19Z',
  capturedAt: '2026-09-18T09:24:00Z',
};

const first = buildPrivacyRecoveryLedgerManifest(args);
const second = buildPrivacyRecoveryLedgerManifest(args);
if (JSON.stringify(first.manifest) !== JSON.stringify(second.manifest)) {
  throw new Error('Privacy recovery ledger manifest must remain deterministic.');
}
if (first.manifest.sourceAuthority !== PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1) {
  throw new Error('Privacy recovery ledger source authority marker drifted.');
}
if (first.summary.schema !== PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1) {
  throw new Error('Privacy recovery ledger summary schema drifted.');
}
if (
  first.summary.authoritativePostBackupSource !== true ||
  first.summary.candidateSourceAuthority !== false ||
  first.summary.authoritativePrivacyReconciliation !== false ||
  first.summary.futureSafePrivacyReconciliation !== false ||
  first.summary.drReady !== false
) {
  throw new Error('Captured-window source authority flags drifted.');
}

const coverage = validatePrivacyRecoveryLedgerCoverage(
  first.summary,
  '2026-09-18T09:24:00.000Z',
);
if (coverage.coverageStatus !== 'covered' || coverage.drReady !== false) {
  throw new Error('Captured-window coverage validator did not admit an exact covered incident.');
}
let gapRejected = false;
try {
  validatePrivacyRecoveryLedgerCoverage(first.summary, '2026-09-18T09:24:00.001Z');
} catch (error) {
  gapRejected = /exceeds authoritative ledger coverage/u.test(String(error));
}
if (!gapRejected) {
  throw new Error('Recovery coverage must fail closed beyond captured-at.');
}

const publicText = JSON.stringify(first.summary) + JSON.stringify(coverage);
for (const identifier of [
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'delete-account-1',
]) {
  if (publicText.includes(identifier)) {
    throw new Error('Identifier-free authority evidence leaked event material: ' + identifier);
  }
}

console.log(
  'MyeongHa PostgreSQL privacy recovery ledger authority PASS: encrypted captured-window source is authoritative only through captured-at; reconciliation and DR remain fail-closed.',
);
