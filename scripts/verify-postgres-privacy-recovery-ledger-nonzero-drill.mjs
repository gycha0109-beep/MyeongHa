import { readFile } from 'node:fs/promises';

const drillPath = 'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh';
const authorityDocPath = 'docs/operations/POSTGRES_PRIVACY_RECOVERY_LEDGER_AUTHORITY_V1.md';
const policyPath = 'docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_CANDIDATE_V1.json';
const decisionPath = 'docs/P0_DECISION_REGISTER.md';
const statusPath = 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md';

const [drill, authorityDoc, policyText, decisions, status] = await Promise.all([
  readFile(drillPath, 'utf8'),
  readFile(authorityDocPath, 'utf8'),
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
  'validate-postgres-privacy-recovery-ledger-coverage.mjs',
  'set local role myeongha_system_executor',
  'internal_claim_account_deletion_outbox_v1',
  'internal_finalize_account_deletion_db_v1',
  'internal_complete_account_deletion_v1',
  'recovered database executes governed account-deletion finalizer',
  'recovered state cannot resurrect personalization/access while approved Commerce evidence remains revoked',
  'recovered account deletion completion converges idempotently',
  "recovered_state_finalization: 'synthetic-isolated-pass'",
  "personalization_access_resurrection_guard: 'pass'",
  "commerce_p5y_retention_guard: 'pass'",
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
  'AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'incident_reference_utc <= authoritative_coverage_through',
  'authoritative destructive reconciliation = NOT YET PROVEN',
  'future-safe reconciliation               = false',
  'DR Ready                                 = false',
]) {
  if (!authorityDoc.includes(fragment)) fail('authority documentation boundary missing: ' + fragment);
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

if (!/^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*DECIDED\*\*\s*\|/m.test(decisions)) {
  fail('P0-PR-01 must remain DECIDED while the historical policy candidate stays OPEN-P0');
}

for (const fragment of [
  'privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'authoritative_post_backup_source: true_bounded_captured_window_only',
  'authoritative_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: false',
  'privacy_reconciliation: BLOCKED_BY_PRODUCTION_NONZERO_AUTHORITATIVE_DELTA_PROOF',
  'rpo_authority: PRODUCT_OWNER_APPROVED_PT24H',
  'rto_authority: PRODUCT_OWNER_APPROVED_PT6H',
  'dr_ready: false',
]) {
  if (!status.includes(fragment)) fail('DR authority drifted: ' + fragment);
}

console.log(
  'Non-zero privacy ledger recovery drill contract PASS: captured-window coverage -> encrypted roundtrip -> replay -> recovered DB finalization is guarded while authoritative reconciliation and DR Ready remain false.',
);
