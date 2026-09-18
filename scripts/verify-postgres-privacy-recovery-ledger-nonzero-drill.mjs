import { readFile } from 'node:fs/promises';

const drillPath = 'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh';
const candidateDocPath = 'docs/operations/POSTGRES_PRIVACY_RECOVERY_LEDGER_CANDIDATE_V1.md';
const policyPath = 'docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_CANDIDATE_V1.json';
const decisionPath = 'docs/P0_DECISION_REGISTER.md';
const statusPath = 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md';

const [drill, candidateDoc, policyText, decisions, status] = await Promise.all([
  readFile(drillPath, 'utf8'),
  readFile(candidateDocPath, 'utf8'),
  readFile(policyPath, 'utf8'),
  readFile(decisionPath, 'utf8'),
  readFile(statusPath, 'utf8'),
]);

const policy = JSON.parse(policyText);

function fail(message) {
  throw new Error('Non-zero privacy ledger roundtrip drill rejected: ' + message);
}

for (const fragment of [
  'build-postgres-privacy-recovery-ledger-manifest.mjs',
  '--input "$raw_source"',
  '--manifest "$manifest"',
  '--summary "$ledger_summary"',
  'summary.eventCount !== 4',
  'summary.replayPlannerAccepted !== true',
  "roundtrip_passphrase=\"$(openssl rand -hex 32)\"",
  'openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000',
  'grep -aFq "$identifier" "$encrypted_manifest"',
  'openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000',
  'sha256sum "$manifest"',
  'sha256sum "$decrypted_manifest"',
  'cmp -s "$manifest" "$decrypted_manifest"',
  '--input "$decrypted_manifest"',
  'second identical replay is idempotent after subject becomes deletion_pending',
  'deletion-pending replay fails closed when a required terminal revoke is absent',
]) {
  if (!drill.includes(fragment)) fail('drill contract missing: ' + fragment);
}

for (const eventType of [
  'MEMORY_ITEM_REVOKED',
  'LIFE_FACT_REVOKED',
  'DEVICE_INSTALLATION_REVOKED',
  'ACCOUNT_DELETION_STARTED',
]) {
  if (!drill.includes(eventType)) fail('non-zero fixture missing event type: ' + eventType);
}

if (/roundtrip_passphrase=['"][^$]/.test(drill)) {
  fail('roundtrip passphrase must not be a repository-stored literal');
}

for (const fragment of [
  'Synthetic non-zero transport-to-replay proof',
  '4 replay-supported synthetic events',
  'production ledger manifest builder',
  'byte-for-byte + SHA-256 parity check',
  'synthetic CI evidence only',
  'run `35361080803` observed zero replay-supported events',
  'P0-PR-01 = OPEN-P0',
  'executionAuthorized = false',
  'authoritative_post_backup_source = false',
  'authoritative_privacy_reconciliation = false',
  'future_safe_privacy_reconciliation = false',
  'dr_ready = false',
]) {
  if (!candidateDoc.includes(fragment)) fail('candidate documentation boundary missing: ' + fragment);
}

if (
  policy.decisionId !== 'P0-PR-01' ||
  policy.decisionStatus !== 'OPEN-P0' ||
  policy.policyAuthority !== 'NOT_APPROVED' ||
  policy.executionAuthorized !== false ||
  policy.authoritativePostBackupSource !== false ||
  policy.authoritativePrivacyReconciliation !== false ||
  policy.futureSafePrivacyReconciliation !== false ||
  policy.drReady !== false
) {
  fail('account deletion policy candidate authority drifted');
}

if (!/^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*OPEN-P0\*\*\s*\|/m.test(decisions)) {
  fail('P0-PR-01 must remain OPEN-P0');
}

for (const fragment of [
  'authoritative_post_backup_source: false',
  'privacy_recovery_ledger_candidate_event_count: 0',
  'privacy_reconciliation: BLOCKED_BY_P0_PR_01_AND_ISSUE_964',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
]) {
  if (!status.includes(fragment)) fail('DR authority drifted: ' + fragment);
}

console.log(
  'Non-zero privacy ledger roundtrip drill contract PASS: synthetic builder -> encryption -> decryption -> DB replay is guarded while production event count remains 0 and all authority stays false.',
);
