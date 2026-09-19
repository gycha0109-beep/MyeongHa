import { readFile } from 'node:fs/promises';

import {
  buildAccountDeletionExecutionPlan,
  evaluateAccountDeletionDispositionContract,
} from './evaluate-account-deletion-disposition-contract.mjs';

const contractPath = 'docs/operations/ACCOUNT_DELETION_DISPOSITION_INPUT_CANDIDATE_V1.json';
const graphPath = 'docs/operations/TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json';
const parentPolicyPath = 'docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_CANDIDATE_V1.json';
const decisionPath = 'docs/P0_DECISION_REGISTER.md';
const gateDocPath = 'docs/operations/ACCOUNT_DELETION_DISPOSITION_EXECUTION_GATE_V1.md';

const [contractText, graphText, parentPolicyText, decisions, gateDoc] = await Promise.all([
  readFile(contractPath, 'utf8'),
  readFile(graphPath, 'utf8'),
  readFile(parentPolicyPath, 'utf8'),
  readFile(decisionPath, 'utf8'),
  readFile(gateDocPath, 'utf8'),
]);

const contract = JSON.parse(contractText);
const graph = JSON.parse(graphText);
const parentPolicy = JSON.parse(parentPolicyText);

function fail(message) {
  throw new Error('Account deletion disposition execution gate rejected: ' + message);
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

const report = evaluateAccountDeletionDispositionContract(contract, graph);
for (const [field, expected] of [
  ['graphEdgeCount', 107],
  ['graphReachableTableCount', 48],
  ['coveredEdgeCount', 107],
  ['coveredTableCount', 48],
  ['unresolvedTableCount', 48],
  ['unresolvedEdgeCount', 107],
  ['dependencyConflictCount', 0],
  ['explicitConflictResolutionCount', 0],
  ['policyReady', false],
  ['executionAuthorized', false],
  ['executionPlanAllowed', false],
  ['destructiveSqlAllowed', false],
  ['authoritativePrivacyReconciliation', false],
  ['drReady', false],
]) {
  if (report[field] !== expected) fail(field + ' mismatch expected=' + expected + ' actual=' + report[field]);
}

if (parentPolicy.decisionId !== 'P0-PR-01' || parentPolicy.decisionStatus !== 'OPEN-P0') {
  fail('parent deletion policy authority drifted');
}
if (parentPolicy.policyAuthority !== 'NOT_APPROVED' || parentPolicy.executionAuthorized !== false) {
  fail('parent deletion policy must remain non-approved and unauthorized');
}
if (!/^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*DECIDED\*\*\s*\|/m.test(decisions)) {
  fail('P0-PR-01 must be DECIDED in the decision register while the historical candidate remains OPEN-P0');
}

for (const fragment of [
  'reachable FK edges          = 107',
  'reachable tables            = 48',
  'all table dispositions      = UNDECIDED',
  'executionPlanAllowed = false',
  'destructiveSqlAllowed = false',
  'This work adds no:',
]) {
  if (!gateDoc.includes(fragment)) fail('gate documentation missing: ' + fragment);
}

expectThrow(
  'canonical execution plan',
  () => buildAccountDeletionExecutionPlan(contract, graph),
  /execution plan generation is not authorized/,
);

const missing = clone(contract);
missing.tableDispositions.pop();
expectThrow('missing table coverage', () => evaluateAccountDeletionDispositionContract(missing, graph), /coverage mismatch/);

const duplicate = clone(contract);
duplicate.tableDispositions.push(clone(duplicate.tableDispositions[0]));
expectThrow('duplicate table coverage', () => evaluateAccountDeletionDispositionContract(duplicate, graph), /duplicate table disposition/);

const unknown = clone(contract);
unknown.tableDispositions.push({
  table: 'unknown_subject_table',
  disposition: 'UNDECIDED',
  authorityReference: null,
  retentionDurationDays: null,
});
expectThrow('unknown table coverage', () => evaluateAccountDeletionDispositionContract(unknown, graph), /coverage mismatch/);

const invalidDisposition = clone(contract);
invalidDisposition.tableDispositions[0].disposition = 'DROP_EVERYTHING';
expectThrow('invalid disposition', () => evaluateAccountDeletionDispositionContract(invalidDisposition, graph), /unsupported disposition/);

const unauthorizedOpen = clone(contract);
unauthorizedOpen.executionAuthorized = true;
expectThrow('OPEN-P0 authorization', () => evaluateAccountDeletionDispositionContract(unauthorizedOpen, graph), /OPEN-P0 executionAuthorized must be false/);

// Test-only resolved fixture. This is not a policy artifact and carries no production authority.
const testOnlyApproved = clone(contract);
testOnlyApproved.decisionStatus = 'DECIDED';
testOnlyApproved.policyAuthority = 'APPROVED';
testOnlyApproved.executionAuthorized = true;
testOnlyApproved.approvedPolicyVersion = 'TEST_ONLY_NOT_POLICY';
testOnlyApproved.approvedBy = 'TEST_ONLY_NOT_POLICY';
testOnlyApproved.approvedAt = 'TEST_ONLY_NOT_POLICY';
for (const entry of testOnlyApproved.tableDispositions) {
  entry.disposition = 'RETAIN';
  entry.authorityReference = 'TEST_ONLY_NOT_POLICY';
  entry.retentionDurationDays = 1;
}

const testOnlyReport = evaluateAccountDeletionDispositionContract(testOnlyApproved, graph);
if (!testOnlyReport.policyReady || !testOnlyReport.executionPlanAllowed) {
  fail('test-only complete approved fixture should prove the positive plan gate path');
}
const testOnlyPlan = buildAccountDeletionExecutionPlan(testOnlyApproved, graph);
if (testOnlyPlan.stepCount !== 48) fail('test-only plan must cover all 48 reachable tables');
if (testOnlyPlan.destructiveSqlGenerated !== false || testOnlyPlan.sql !== null) {
  fail('v1 execution plan must remain structured and non-SQL');
}

const conflict = clone(testOnlyApproved);
const conflictEdge = graph.edges.find(
  (edge) => edge.parentTable !== edge.childTable && edge.parentTable === 'subjects',
);
if (!conflictEdge) fail('expected a direct Subject dependency edge for conflict test');
const conflictChild = conflict.tableDispositions.find((entry) => entry.table === conflictEdge.childTable);
conflictChild.disposition = 'DELETE';
conflictChild.retentionDurationDays = null;
conflict.executionAuthorized = false;
const conflictReport = evaluateAccountDeletionDispositionContract(conflict, graph);
if (conflictReport.dependencyConflictCount < 1 || conflictReport.policyReady !== false) {
  fail('mixed resolved FK dispositions must be blocked without explicit edge resolution');
}
conflict.executionAuthorized = true;
expectThrow(
  'conflicting execution authorization',
  () => evaluateAccountDeletionDispositionContract(conflict, graph),
  /requires an approved, complete, conflict-free policy/,
);

console.log(
  'Account deletion disposition historical gate PASS: 48/48 tables and 107/107 edges remain covered by the immutable pre-approval candidate, conflict drift fails closed, and SQL generation remains absent.',
);
