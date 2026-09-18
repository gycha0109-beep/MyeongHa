import { readdir, readFile } from 'node:fs/promises';

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

if (!/^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*OPEN-P0\*\*\s*\|/m.test(decisions)) {
  throw new Error('P0-PR-01 must remain OPEN-P0 while deletion/retention authority is unresolved.');
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
  'authoritative_post_backup_source: false',
  'privacy_reconciliation: BLOCKED_BY_P0_PR_01_AND_ISSUE_964',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
]) {
  if (!drStatus.includes(fragment)) {
    throw new Error('DR authority drifted while P0-PR-01 remains open: ' + fragment);
  }
}

const migrationFiles = (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql'));
const migrationBodies = await Promise.all(
  migrationFiles.map(async (name) => [name, await readFile('supabase/migrations/' + name, 'utf8')]),
);

for (const [name, body] of migrationBodies) {
  for (const forbidden of [
    'cmd_finalize_account_deletion',
    'cmd_complete_account_deletion',
    'cmd_destructively_delete_account',
  ]) {
    if (body.toLowerCase().includes(forbidden)) {
      throw new Error(
        'Executable account deletion finalization command appeared while P0-PR-01 is OPEN-P0: ' +
          name +
          ' contains ' +
          forbidden,
      );
    }
  }
}

console.log(
  'Account deletion finalization policy candidate PASS: 9 destructive slots and 8 subject-linked Commerce tables are inventoried, all policy values remain undecided, and execution is fail-closed.',
);
