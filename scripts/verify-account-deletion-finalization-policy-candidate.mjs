import { readFile } from 'node:fs/promises';

import { evaluateAccountDeletionPolicyCandidate } from './evaluate-account-deletion-finalization-policy.mjs';

const policyPath =
  'docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_CANDIDATE_V1.json';
const docPath =
  'docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_CANDIDATE_V1.md';
const decisionPath = 'docs/P0_DECISION_REGISTER.md';
const drStatusPath = 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md';

const [policyText, doc, decisions, drStatus] = await Promise.all([
  readFile(policyPath, 'utf8'),
  readFile(docPath, 'utf8'),
  readFile(decisionPath, 'utf8'),
  readFile(drStatusPath, 'utf8'),
]);

const policy = JSON.parse(policyText);
const report = evaluateAccountDeletionPolicyCandidate(policy);

if (
  report.policyReady !== false ||
  report.executionAuthorized !== false ||
  report.authoritativePostBackupSource !== false ||
  report.authoritativePrivacyReconciliation !== false ||
  report.futureSafePrivacyReconciliation !== false ||
  report.drReady !== false
) {
  throw new Error('Account deletion policy candidate must remain fully fail-closed.');
}

if (report.destructiveFinalizationSlotCount !== 9) {
  throw new Error('Expected exactly 9 destructive-finalization decision slots.');
}
if (report.commerceRetentionClassCount !== 4) {
  throw new Error('Expected exactly 4 Commerce retention policy classes.');
}
if (report.commerceSubjectLinkedTableCount !== 8) {
  throw new Error('Expected exactly 8 inventoried subject-linked Commerce tables.');
}

if (!/^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*DECIDED\*\*\s*\|/m.test(decisions)) {
  throw new Error('P0-PR-01 must be DECIDED while the historical OPEN candidate remains immutable.');
}

for (const fragment of [
  'POLICY CONTRACT ONLY / EXECUTION NOT AUTHORIZED',
  'decisionStatus                     = OPEN-P0',
  'policyAuthority                    = NOT_APPROVED',
  'executionAuthorized                = false',
  'The live migrated table set must exactly equal the policy candidate inventory.',
  'no class has a disposition, duration, or legal authority yet',
  'This work adds **no**:',
]) {
  if (!doc.includes(fragment)) {
    throw new Error('Account deletion policy candidate documentation is missing boundary: ' + fragment);
  }
}

for (const fragment of [
  'privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'authoritative_post_backup_source: true_bounded_captured_window_only',
  'authoritative_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: false',
  'privacy_reconciliation: BLOCKED_BY_PRODUCTION_NONZERO_AUTHORITATIVE_DELTA_PROOF',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
]) {
  if (!drStatus.includes(fragment)) {
    throw new Error('DR authority drifted after P0-PR-01 approval: ' + fragment);
  }
}

console.log(
  'Account deletion historical candidate PASS: the pre-approval OPEN-P0 artifact remains unchanged and fail-closed while the decision register points to the separately versioned approved policy.',
);
