import { readFile } from 'node:fs/promises';
import {
  evaluateAccountDeletionDispositionContract,
  buildAccountDeletionExecutionPlan,
} from './evaluate-account-deletion-disposition-contract.mjs';

// Additive, owner-authorized extension of the *historical* P0-PR-01 59/140
// baseline. This MUST NOT rewrite the original #964 signature or pretend
// previous approval covered the new 60th personal-data table.
const dir = 'docs/operations/';
const [baseGraph, graph, baseDisposition, disposition, baseFinal, final, migration] =
  await Promise.all([
    readFile(dir + 'TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json', 'utf8'),
    readFile(dir + 'TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_RR03_V2.json', 'utf8'),
    readFile(dir + 'ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json', 'utf8'),
    readFile(dir + 'ACCOUNT_DELETION_DISPOSITION_POLICY_RR03_V2.json', 'utf8'),
    readFile(dir + 'ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json', 'utf8'),
    readFile(dir + 'ACCOUNT_DELETION_FINALIZATION_POLICY_RR03_V2.json', 'utf8'),
    readFile('supabase/migrations/1710_official_reader_assistant_provenance_storage_v1.sql', 'utf8'),
  ]).then(v => v.map((x, i) => i === 6 ? x : JSON.parse(x)));

function assert(condition, message) {
  if (!condition) throw new Error('RR-03 private provenance policy gate: ' + message);
}
const table = 'official_reader_assistant_saju_provenance';
const authority = 'https://github.com/gycha0109-beep/MyeongHa/issues/1884#issuecomment-6103479019';
const fingerprint = 'c8027aeaf8c137d7d1629c200ed86960537ca99ddb9202a6025e3a7b9fd2fb2f';
const edgeKey = edge => [edge.minDepth,edge.parentTable,edge.childTable,edge.constraintName,edge.childColumns.join(','),edge.parentColumns.join(',')].join('|');
const oldEdges = new Set(baseGraph.edges.map(edgeKey));
const newEdges = graph.edges.filter(edge => !oldEdges.has(edgeKey(edge)));
assert(baseGraph.edges.length === 140 && baseGraph.discovery.distinctReachableTableCount === 59, 'historical graph changed');
assert(graph.edges.length === 146 && graph.discovery.distinctReachableTableCount === 60, 'new graph must cover exactly 60 tables / 146 edges');
assert(graph.discovery.maxDepth === 4 && graph.discovery.directDepthOneEdgeCount === 30, 'unexplained depth/direct owner graph drift');
assert(newEdges.length === 6 && newEdges.every(edge => edge.childTable === table), 'six distinct new Reader-provenance FK paths required');
assert(graph.edges.filter(edge => oldEdges.has(edgeKey(edge))).length === 140, 'baseline edges must be immutable');
const expectedEdges = [
  'official_reader_provenance_thread_subject_fk',
  'official_reader_provenance_attempt_turn_subject_fk',
  'official_reader_provenance_turn_thread_subject_fk',
  'official_reader_provenance_message_turn_subject_fk',
  'official_reader_provenance_reading_subject_fk',
  'official_reader_provenance_interpretation_fk',
].sort();
assert(JSON.stringify(newEdges.map(e => e.constraintName).sort()) === JSON.stringify(expectedEdges), 'approved new FK identities changed');

const oldTables = new Map(baseDisposition.tableDispositions.map(t => [t.table, t]));
assert(oldTables.size === 59, 'old disposition size drift');
assert(disposition.tableDispositions.length === 60, 'new disposition must contain all 60 tables');
assert(disposition.graphRef.fingerprintSha256 === fingerprint, 'new graph fingerprint must be pinned');
assert(disposition.graphRef.edgeCount === 146 && disposition.graphRef.distinctReachableTableCount === 60, 'policy graph size mismatch');
assert(disposition.approvedBy === 'PROJECT_OWNER' && disposition.approvedAt === '2026-10-11' && disposition.privacyApprovalReference === authority, 'new authorization evidence missing');
for (const old of baseDisposition.tableDispositions) {
  assert(JSON.stringify(disposition.tableDispositions.find(e => e.table === old.table)) === JSON.stringify(old), 'old approved disposition modified: ' + old.table);
}
assert(JSON.stringify(disposition.edgeConflictResolutions) === JSON.stringify(baseDisposition.edgeConflictResolutions), 'old mixed-edge decision changed');
const extra = disposition.tableDispositions.filter(t => !oldTables.has(t.table));
assert(extra.length === 1 && extra[0].table === table && extra[0].disposition === 'DELETE' &&
  extra[0].authorityReference === authority && extra[0].retentionDurationDays === null && extra[0].retentionPeriod === null,
  'new personal-data table must be DELETE with a distinct owner authority');
const counts = disposition.tableDispositions.reduce((a, t) => (a[t.disposition] = (a[t.disposition] || 0) + 1, a), {});
assert(JSON.stringify(counts) === JSON.stringify({DELETE:47,RETAIN:9,ANONYMIZE:4}), '47/4/9 split drift');

const report = evaluateAccountDeletionDispositionContract(disposition, graph);
assert(report.graphEdgeCount === 146 && report.coveredEdgeCount === 146 &&
  report.graphReachableTableCount === 60 && report.coveredTableCount === 60 &&
  report.unresolvedTableCount === 0 && report.unresolvedEdgeCount === 0 &&
  report.dependencyConflictCount === 0 && report.explicitConflictResolutionCount === 37 &&
  report.policyReady === true && report.destructiveSqlAllowed === false, 'expanded policy graph cannot be accepted');
const plan = buildAccountDeletionExecutionPlan(disposition, graph);
assert(plan.stepCount === 60 && plan.destructiveSqlGenerated === false && plan.sql === null, 'must not mint destructive SQL');
assert(final.subjectGraphFingerprintSha256 === fingerprint &&
  final.policyVersion === disposition.approvedPolicyVersion &&
  final.approvedBy === 'PROJECT_OWNER' && final.authorityReference === authority, 'finalization policy approval drift');
assert(final.destructiveRuntimeAuthorized === false && final.drReady === false &&
  final.authoritativePrivacyReconciliation === false && final.futureSafePrivacyReconciliation === false,
  'approval must not assert active destructive SQL or DR readiness');
assert(JSON.stringify(final.destructiveFinalization) === JSON.stringify(baseFinal.destructiveFinalization) &&
  JSON.stringify(final.commerceRetentionClasses) === JSON.stringify(baseFinal.commerceRetentionClasses) &&
  final.backupRetentionPeriod === 'P30D', 'old retention/backup semantics must remain intact');
assert(final.additionalPrivacyDeletes?.length === 1 &&
  final.additionalPrivacyDeletes[0].table === table &&
  final.additionalPrivacyDeletes[0].deleteMechanism === 'FK_CASCADE_WITH_CONVERSATION_MESSAGE', 'deletion path not defined');

for (const fragment of [
  'on delete cascade',
  'official_reader_provenance_message_turn_subject_fk',
  'official_reader_provenance_thread_subject_fk',
  'official_reader_provenance_attempt_turn_subject_fk',
  'official_reader_provenance_reading_subject_fk',
  'force row level security',
  'tr_official_reader_provenance_immutable_v1',
  'myeongha.account_deletion_finalizer_subject_id',
]) {
  assert(migration.toLowerCase().includes(fragment.toLowerCase()), 'migration missing cascade/tenant/immutable guard: ' + fragment);
}
assert(!/create\s+(?:or\s+replace\s+)?function\s+public\.(?:qry_official_reader_followup_anchor_runtime_v1|cmd_commit_official_reader_chat_turn_v1)/i.test(migration),
  'unverified Reader Writer/query must not be activated by storage migration');

console.log('RR-03 owner-approved private provenance extension gate PASS: 60/146, DELETE=47, ANONYMIZE=4, RETAIN=9; existing v1 policy immutable; no production Writer or DR readiness');
