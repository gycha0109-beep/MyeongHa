import { readFile } from 'node:fs/promises';

import {
  buildAccountDeletionExecutionPlan,
  evaluateAccountDeletionDispositionContract,
} from './evaluate-account-deletion-disposition-contract.mjs';

const authorityReference =
  'https://github.com/gycha0109-beep/MyeongHa/issues/964#issuecomment-5737913582';
const expectedGraphFingerprint =
  '092b21034cd6c44f6f90561f1296059e1e163866d33d6f700f305cfc71ac2002';

const [policyText, dispositionText, graphText, decisions, drStatus] = await Promise.all([
  readFile('docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json', 'utf8'),
  readFile('docs/operations/ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json', 'utf8'),
  readFile('docs/operations/TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json', 'utf8'),
  readFile('docs/P0_DECISION_REGISTER.md', 'utf8'),
  readFile('docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md', 'utf8'),
]);

const policy = JSON.parse(policyText);
const disposition = JSON.parse(dispositionText);
const graph = JSON.parse(graphText);

function fail(message) {
  throw new Error('Approved account deletion policy rejected: ' + message);
}
function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function expectThrow(label, fn, pattern) {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) fail(label + ' threw unexpected error: ' + message);
    return;
  }
  fail(label + ' did not fail closed');
}

const expectedFinalization = {
  subjectRecordAction: 'ANONYMIZE',
  authMappingAction: 'DELETE',
  authProviderUserAction: 'DELETE',
  profileAction: 'DELETE',
  guestSessionAction: 'DELETE',
  mergeProvenanceAction: 'ANONYMIZE',
  personalizationGraphAction: 'DELETE',
  shareDeviceNotificationAction: 'DELETE',
  backupRetentionHandling:
    'KEEP_EXISTING_30_DAY_LIFECYCLE_AND_RECONCILE_BEFORE_SERVICEABILITY',
};

for (const [field, expected] of [
  ['schema', 'myeongha-account-deletion-finalization-policy-v1'],
  ['decisionId', 'P0-PR-01'],
  ['decisionStatus', 'DECIDED'],
  ['policyAuthority', 'PRODUCT_OWNER_APPROVED'],
  ['policyVersion', 'account-deletion-finalization-v1'],
  ['approvedBy', 'PRODUCT_OWNER'],
  ['approvedAt', '2026-09-19'],
  ['authorityReference', authorityReference],
  ['subjectGraphFingerprintSha256', expectedGraphFingerprint],
  ['destructiveRuntimeAuthorized', false],
  ['structuredDispositionPlanningAuthorized', true],
  ['backupRetentionPeriod', 'P30D'],
  ['retainedCommerceUsage', 'LEGAL_ACCOUNTING_DISPUTE_EVIDENCE_ONLY'],
  ['authoritativePostBackupSource', false],
  ['authoritativePrivacyReconciliation', false],
  ['futureSafePrivacyReconciliation', false],
  ['drReady', false],
]) {
  if (policy[field] !== expected) {
    fail(field + ' mismatch expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(policy[field]));
  }
}

if (!sameJson(policy.destructiveFinalization, expectedFinalization)) {
  fail('destructiveFinalization does not match the product-owner-approved policy');
}

const expectedCommerce = {
  commerce_account_provider_binding: ['commerce_account_links'],
  commerce_purchase_payment_provenance: [
    'commerce_payment_attempts',
    'purchase_intent_reader_selections',
    'purchase_intents',
  ],
  commerce_verified_provider_evidence: ['commerce_provider_events', 'commerce_receipts'],
  commerce_entitlement_history_projection: ['entitlement_events', 'entitlement_grants', 'entitlements'],
};

if (!Array.isArray(policy.commerceRetentionClasses) || policy.commerceRetentionClasses.length !== 4) {
  fail('expected exactly four Commerce retention classes');
}
for (const entry of policy.commerceRetentionClasses) {
  const expectedTables = expectedCommerce[entry.classKey];
  if (!expectedTables) fail('unknown Commerce retention class: ' + String(entry.classKey));
  if (!sameJson([...entry.tables].sort(), [...expectedTables].sort())) {
    fail('Commerce retention membership drifted: ' + entry.classKey);
  }
  if (entry.disposition !== 'RETAIN' || entry.retentionPeriod !== 'P5Y') {
    fail('Commerce class must remain RETAIN/P5Y: ' + entry.classKey);
  }
  if (entry.authorityReference !== authorityReference) {
    fail('Commerce class authority drifted: ' + entry.classKey);
  }
}

if (disposition.graphRef.fingerprintSha256 !== expectedGraphFingerprint) {
  fail('approved disposition graph fingerprint drifted');
}

const report = evaluateAccountDeletionDispositionContract(disposition, graph);
for (const [field, expected] of [
  ['graphEdgeCount', 125],
  ['graphReachableTableCount', 52],
  ['coveredEdgeCount', 125],
  ['coveredTableCount', 52],
  ['unresolvedTableCount', 0],
  ['unresolvedEdgeCount', 0],
  ['dependencyConflictCount', 0],
  ['explicitConflictResolutionCount', 36],
  ['policyReady', true],
  ['executionAuthorized', true],
  ['executionPlanAllowed', true],
  ['destructiveSqlAllowed', false],
  ['authoritativePrivacyReconciliation', false],
  ['drReady', false],
]) {
  if (report[field] !== expected) {
    fail(field + ' mismatch expected=' + expected + ' actual=' + report[field]);
  }
}

const counts = { DELETE: 0, ANONYMIZE: 0, RETAIN: 0 };
for (const entry of disposition.tableDispositions) {
  if (!(entry.disposition in counts)) fail('unexpected resolved disposition: ' + entry.disposition);
  counts[entry.disposition] += 1;
  if (entry.authorityReference !== authorityReference) fail('table authority drifted: ' + entry.table);
  if (entry.disposition === 'RETAIN') {
    if (entry.retentionPeriod !== 'P5Y' || entry.retentionDurationDays !== null) {
      fail('retained table must use calendar P5Y and no day approximation: ' + entry.table);
    }
  } else if ((entry.retentionPeriod ?? null) !== null || entry.retentionDurationDays !== null) {
    fail('non-retained table must not carry retention duration: ' + entry.table);
  }
}
if (!sameJson(counts, { DELETE: 39, ANONYMIZE: 4, RETAIN: 9 })) {
  fail('approved 39/4/9 disposition split drifted: ' + JSON.stringify(counts));
}

for (const resolution of disposition.edgeConflictResolutions) {
  if (resolution.policyAuthorityReference !== authorityReference) {
    fail('mixed-edge authority drifted: ' + resolution.constraintName);
  }
  if (![
    'DELETE_CHILD_BEFORE_PARENT_ANONYMIZATION_V1',
    'RETAIN_CHILD_LINK_TO_ANONYMIZED_PARENT_TOMBSTONE_V1',
    'DETACH_OR_REWRITE_CHILD_REFERENCE_BEFORE_PARENT_DELETE_V1',
    'DELETE_CHILD_KEEP_RETAINED_PARENT_V1',
  ].includes(resolution.executionStrategyRef)) {
    fail('unknown mixed-edge strategy: ' + resolution.executionStrategyRef);
  }
}

const plan = buildAccountDeletionExecutionPlan(disposition, graph);
if (plan.stepCount !== 52 || plan.destructiveSqlGenerated !== false || plan.sql !== null) {
  fail('approved structured plan must cover 52 tables and remain non-SQL');
}
if (plan.graphFingerprintSha256 !== expectedGraphFingerprint) {
  fail('structured plan lost the approved graph fingerprint');
}
const planCounts = { DELETE: 0, ANONYMIZE: 0, RETAIN: 0 };
for (const step of plan.steps) {
  planCounts[step.disposition] += 1;
  if (step.disposition === 'RETAIN' && step.retentionPeriod !== 'P5Y') {
    fail('approved plan lost P5Y retention: ' + step.table);
  }
}
if (!sameJson(planCounts, counts)) fail('plan disposition counts differ from approved contract');

const driftedGraph = clone(graph);
driftedGraph.edges[0].constraintName += '_same-count-drift';
expectThrow(
  'same-count graph identity drift',
  () => evaluateAccountDeletionDispositionContract(disposition, driftedGraph),
  /fingerprintSha256 does not match the canonical graph/,
);

if (!/^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*DECIDED\*\*\s*\|/m.test(decisions)) {
  fail('P0-PR-01 must be DECIDED in the decision register');
}
for (const fragment of [
  'privacy_reconciliation: BLOCKED_BY_FINALIZER_AND_AUTHORITATIVE_NONZERO_RECOVERY_PROOF',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
]) {
  if (!drStatus.includes(fragment)) fail('DR status missing boundary: ' + fragment);
}

console.log(
  'Approved account deletion policy PASS: P0-PR-01 is DECIDED, 52/52 tables map to DELETE 39 / ANONYMIZE 4 / RETAIN 9, 36 mixed FK edges are explicitly planned, retained Commerce uses calendar P5Y, structured plan generation is allowed, and destructive SQL / privacy reconciliation / DR promotion remain blocked.',
);
