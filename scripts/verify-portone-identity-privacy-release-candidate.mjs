import { readFile } from 'node:fs/promises';
import { evaluateAccountDeletionDispositionContract } from './evaluate-account-deletion-disposition-contract.mjs';

const fail = (reason) => { throw new Error('PortOne identity privacy release candidate rejected: ' + reason); };
const load = async (path) => readFile(path, 'utf8');
const [policyRaw, graphRaw, deltaRaw, sqlProposal, sqlRelease, finalizer] = await Promise.all([
  load('docs/operations/ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json'),
  load('docs/operations/TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json'),
  load('docs/operations/PORTONE_IDENTITY_PRIVACY_DISPOSITION_DELTA_CANDIDATE_V1.json'),
  load('supabase/proposals/1740_portone_identity_age_authority_v1.proposed.sql'),
  load('supabase/release-candidates/1740_portone_identity_age_authority_v1.sql'),
  load('supabase/migrations/1171_account_deletion_db_finalizer.sql'),
]);

const policy = JSON.parse(policyRaw);
const graph = JSON.parse(graphRaw);
const delta = JSON.parse(deltaRaw);
const baseline = evaluateAccountDeletionDispositionContract(policy, graph);
if (baseline.policyReady !== true || baseline.coveredTableCount !== 59 ||
    baseline.graphReachableTableCount !== 59 || baseline.dependencyConflictCount !== 0) {
  fail('approved 59-table deletion authority is not intact');
}
const counts = { DELETE: 0, ANONYMIZE: 0, RETAIN: 0 };
const approvedNames = new Set();
for (const row of policy.tableDispositions) {
  if (!(row.disposition in counts) || approvedNames.has(row.table)) fail('approved disposition drift');
  counts[row.disposition]++;
  approvedNames.add(row.table);
}
if (JSON.stringify(counts) !== JSON.stringify({ DELETE: 46, ANONYMIZE: 4, RETAIN: 9 })) {
  fail('approved DELETE/ANONYMIZE/RETAIN split changed');
}
if (delta.schema !== 'myeongha-portone-identity-privacy-disposition-delta-candidate-v1' ||
    delta.status !== 'PROPOSED_NOT_APPLIED' || delta.executionAuthorized !== false ||
    delta.existingApprovedGraphFingerprintSha256 !== policy.graphRef.fingerprintSha256 ||
    delta.existingApprovedReachableTables !== 59 ||
    delta.backupHandling !== 'P30D_EXISTING_CYCLE_UNCHANGED' ||
    delta.commerceEvidenceRetention !== 'P5Y_EXISTING_CLASSES_UNCHANGED') {
  fail('candidate must preserve approved authority and stay unapplied');
}
const expected = ['legal_portone_identity_attempts_v1', 'legal_portone_verified_age_v1'];
if (!Array.isArray(delta.additionalSubjectOwnedTables) ||
    JSON.stringify(delta.additionalSubjectOwnedTables.map((x) => x.table)) !== JSON.stringify(expected)) {
  fail('exact two-table disposition delta required');
}
for (const entry of delta.additionalSubjectOwnedTables) {
  if (approvedNames.has(entry.table) || entry.disposition !== 'DELETE' ||
      entry.subjectColumn !== 'subject_id' || entry.retentionPeriod !== null ||
      entry.containsRawIdentityResult !== false ||
      !['subject_inactive', 'subject_merged', 'subject_deleted'].every((x) => entry.purgeEvents?.includes(x))) {
    fail('unapproved identity table retention or disposition: ' + entry.table);
  }
  const tableDefinition = sqlProposal.match(new RegExp(
    'create\\s+table\\s+public\\.' + entry.table + '\\s*\\(([\\s\\S]*?)\\n\\);', 'i'));
  if (!tableDefinition || !/subject_id\s+uuid\s+(?:primary key\s+)?references\s+public\.subjects\(id\)\s+on\s+delete\s+cascade/i.test(tableDefinition[1])) {
    fail('missing cascade ownership for ' + entry.table);
  }
}
if (delta.additionalSubjectOwnedTables[0].expiryDuration !== 'PT10M' ||
    delta.additionalSubjectOwnedTables[0].expiryPurgeMaxBatch !== 250 ||
    delta.additionalSubjectOwnedTables[0].expiryPurgeScheduled !== false) {
  fail('attempt TTL or unscheduled cleanup policy drift');
}
if (sqlRelease !== sqlProposal || !/set status = 'deleted'/i.test(finalizer)) {
  fail('release SQL diverged or existing account finalizer no longer transitions to deleted');
}
for (const expression of [
  /after update of status, merged_into_subject_id on public\.subjects/i,
  /when \(new\.status <> 'active' or new\.merged_into_subject_id is not null\)/i,
  /delete from public\.legal_portone_identity_attempts_v1 where subject_id=new\.id/i,
  /delete from public\.legal_portone_verified_age_v1 where subject_id=new\.id/i,
  /for update skip locked/i,
  /a\.expires_at <= clock_timestamp\(\)/i,
  /grant execute on function public\.internal_purge_expired_legal_portone_attempts_v1\(integer\)\s+to myeongha_system_executor/i,
  /revoke all on public\.legal_portone_verified_age_v1 from public, anon, authenticated/i,
]) {
  if (!expression.test(sqlProposal)) fail('missing physical deletion or access restriction: ' + expression);
}
console.log('PortOne privacy candidate PASS (not deployed): 59 approved tables unchanged; two additional DELETE-only Subject tables; existing P5Y/P30D unchanged; Subject transition cleanup and bounded worker purge present; no production migration or scheduled execution authorized.');
