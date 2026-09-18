import { readFile } from 'node:fs/promises';

import {
  PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1,
  PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1,
  buildPrivacyRecoveryLedgerManifest,
} from './build-postgres-privacy-recovery-ledger-manifest.mjs';

const workflowPath = '.github/workflows/production-postgres-privacy-recovery-ledger.yml';
const builderPath = 'scripts/build-postgres-privacy-recovery-ledger-manifest.mjs';
const decisionPath = 'docs/P0_DECISION_REGISTER.md';
const statusPath = 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md';
const candidateDocPath = 'docs/operations/POSTGRES_PRIVACY_RECOVERY_LEDGER_CANDIDATE_V1.md';

const [workflow, builder, decisions, status, candidateDoc] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(builderPath, 'utf8'),
  readFile(decisionPath, 'utf8'),
  readFile(statusPath, 'utf8'),
  readFile(candidateDocPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'name: Production PostgreSQL Privacy Recovery Ledger Candidate',
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
  'and .conclusion == "success"',
  'and .head_branch == "main"',
  'uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7',
  '.schema_version == "myeongha-postgres-backup-artifact-v1"',
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
  'accountDeletionWithoutExactOutboxCount',
  'nonAccountDeletionJobCount',
  'unsupportedSubjectLifecycleCount',
  'build-postgres-privacy-recovery-ledger-manifest.mjs',
  'myeongha-postgres-privacy-recovery-ledger-v1',
  'openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000',
  'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7',
  'retention-days: 30',
  'This encrypted artifact is a candidate recovery transport only.',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error('Missing privacy recovery ledger workflow contract fragment: ' + fragment);
  }
}

const forbiddenWorkflowFragments = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'service_role',
  'sslmode=disable',
  'select *',
  'pg_dump',
  'supabase db dump',
  'authoritativePostBackupSource: true',
  'authoritativePrivacyReconciliation: true',
  'futureSafePrivacyReconciliation: true',
  'drReady: true',
  'dr_ready: true',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.toLowerCase().includes(fragment.toLowerCase())) {
    throw new Error('Forbidden privacy recovery ledger workflow fragment: ' + fragment);
  }
}

const requiredBuilderFragments = [
  'myeongha-production-postgres-privacy-ledger-candidate-v1',
  'myeongha-postgres-privacy-recovery-ledger-summary-v1',
  'buildPrivacyReconciliationPlan(manifest)',
  'candidateSourceAuthority: true',
  'authoritativePostBackupSource: false',
  'authoritativePrivacyReconciliation: false',
  'futureSafePrivacyReconciliation: false',
  'drReady: false',
];

for (const fragment of requiredBuilderFragments) {
  if (!builder.includes(fragment)) {
    throw new Error('Missing privacy recovery ledger builder contract fragment: ' + fragment);
  }
}

if (!/^\|\s*.P0-PR-01.\s*\|[^|\n]*\|\s*\*\*OPEN-P0\*\*\s*\|/m.test(decisions)) {
  throw new Error('P0-PR-01 must remain OPEN-P0 while privacy/legal retention authority is unresolved.');
}

for (const fragment of [
  'authoritative_post_backup_source: false',
  'privacy_reconciliation: BLOCKED_BY_P0_PR_01_AND_ISSUE_964',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
]) {
  if (!status.includes(fragment)) {
    throw new Error('DR status lost required fail-closed authority fragment: ' + fragment);
  }
}

for (const fragment of [
  'CANDIDATE TRANSPORT MECHANICS / NOT AUTHORITATIVE',
  'P0-PR-01 = OPEN-P0',
  'operational snapshot mechanics only',
  'authoritative_post_backup_source = false',
  'future_safe_privacy_reconciliation = false',
  'dr_ready = false',
]) {
  if (!candidateDoc.includes(fragment)) {
    throw new Error('Candidate ledger documentation is missing required boundary: ' + fragment);
  }
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
      type: 'SHARE_ARTIFACT_REVOKED',
      shareArtifactId: '40000000-0000-0000-0000-000000000001',
      subjectId: '30000000-0000-0000-0000-000000000001',
    },
    {
      occurredAt: '2026-09-18T09:23:22.000Z',
      type: 'DEVICE_INSTALLATION_REVOKED',
      installationId: '50000000-0000-0000-0000-000000000001',
      subjectId: '30000000-0000-0000-0000-000000000001',
    },
    {
      occurredAt: '2026-09-18T09:23:23.000Z',
      type: 'MEMORY_ITEM_REVOKED',
      memoryItemId: '60000000-0000-0000-0000-000000000001',
      subjectId: '30000000-0000-0000-0000-000000000001',
    },
    {
      occurredAt: '2026-09-18T09:23:24.000Z',
      type: 'LIFE_FACT_REVOKED',
      lifeFactId: '70000000-0000-0000-0000-000000000001',
      subjectId: '30000000-0000-0000-0000-000000000001',
    },
    {
      occurredAt: '2026-09-18T09:23:25.000Z',
      type: 'MEMORY_CHARACTER_GRANT_REVOKED',
      memoryItemId: '60000000-0000-0000-0000-000000000001',
      characterId: 'character-a',
      subjectId: '30000000-0000-0000-0000-000000000001',
    },
    {
      occurredAt: '2026-09-18T09:23:26.000Z',
      type: 'LIFE_FACT_CHARACTER_GRANT_REVOKED',
      lifeFactId: '70000000-0000-0000-0000-000000000001',
      characterId: 'character-b',
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
  throw new Error('Privacy recovery ledger manifest must be deterministic for identical source material.');
}
if (first.manifest.sourceAuthority !== PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1) {
  throw new Error('Privacy recovery ledger source authority marker drifted.');
}
if (first.summary.schema !== PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1) {
  throw new Error('Privacy recovery ledger summary schema drifted.');
}
if (first.manifest.events.length !== 7 || first.summary.eventCount !== 7) {
  throw new Error('Privacy recovery ledger fixture did not preserve all replay-supported events.');
}
if (
  first.summary.authoritativePostBackupSource !== false ||
  first.summary.authoritativePrivacyReconciliation !== false ||
  first.summary.futureSafePrivacyReconciliation !== false ||
  first.summary.drReady !== false
) {
  throw new Error('Privacy recovery ledger candidate must remain non-authoritative and DR-not-ready.');
}

const summaryText = JSON.stringify(first.summary);
for (const identifier of [
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'delete-account-1',
  'character-a',
]) {
  if (summaryText.includes(identifier)) {
    throw new Error('Identifier-free public summary leaked event material: ' + identifier);
  }
}

let unsupportedRejected = false;
try {
  buildPrivacyRecoveryLedgerManifest({
    ...args,
    rawSource: {
      ...rawSource,
      unsupported: {
        ...rawSource.unsupported,
        unsupportedSubjectLifecycleCount: 1,
      },
    },
  });
} catch (error) {
  unsupportedRejected = /unsupportedSubjectLifecycleCount must equal 0/.test(String(error));
}
if (!unsupportedRejected) {
  throw new Error('Privacy recovery ledger builder must fail closed on unsupported lifecycle deltas.');
}

console.log(
  'MyeongHa encrypted PostgreSQL privacy recovery ledger candidate verification passed; P0-PR-01 and DR authority remain open.',
);
