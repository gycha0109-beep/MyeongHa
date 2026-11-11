// Verify metadata-only restore evidence. All fixture roles are synthetic.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { observeSealedRoleDumpCoverage } from
  './operations/observe-postgres-sealed-role-dump-coverage.mjs';

const runner = await readFile(
  'scripts/operations/run-production-postgres-strict-dump.sh', 'utf8');
const e = (granted, member, grantor = 'postgres') => ({
  granted_role: granted, member_role: member, grantor_name: grantor,
  admin_option: false, inherit_option: true, set_option: false,
});
const scope = 'myeongha_to_non_myeongha_direct_membership_only_v1';
const source = rows => ({
  schemaVersion: 'ops-postgres-application-schema-fingerprint-v1',
  transactionReadOnly: 'on',
  sourceCatalogProvenance: 'encrypted_backup_bracketed_readonly_v1',
  sourceCatalogBoundToBackupSnapshot: false,
  applicationExternalRoleBoundary: {
    scope, providerOwnedOnlyProven: false,
    inheritedEffectiveAccessIncluded: false, directMemberships: rows,
  },
});
const rows = Array.from({ length: 48 }, (_, i) =>
  e('myeongha_test_' + i, 'postgres'));
const without = observeSealedRoleDumpCoverage(
  source(rows),
  'GRANT "myeongha_test_0" TO "myeongha_other" WITH INHERIT TRUE GRANTED BY "postgres";\n',
  runner);
assert.equal(without.sourceDirectMembershipCount, 48);
assert.equal(without.sourceRowsWithPairInFilteredSqlCount, 0);
assert.equal(without.sourceRowsWithoutPairInFilteredSqlCount, 48);
assert.equal(without.missingPairReservedRecipientCandidateCount, 48);
assert.equal(without.missingPairOtherRecipientCount, 0);
assert.equal(without.filteredRolesSqlGrantStatementCount, 1);
assert.equal(without.filteredRolesSqlUnparsedGrantStatementCount, 0);
assert.equal(without.verdict,
  'HOLD_SOURCE_EXTERNAL_ROLE_GRANT_PAIRS_MISSING_FROM_FILTERED_DUMP');
assert.equal(without.drReady, false);
assert.equal(without.serviceResumptionAllowed, false);
assert.equal(without.providerOwnershipProven, false);
assert.ok(!JSON.stringify(without).includes('myeongha_test_'));
assert.ok(!JSON.stringify(without).includes('postgres'));
const partial = observeSealedRoleDumpCoverage(source([
  e('myeongha_alpha', 'postgres'), e('other_system', 'myeongha_beta'),
]),
'GRANT "myeongha_alpha" TO "postgres" WITH INHERIT TRUE GRANTED BY "postgres";\n', runner);
assert.equal(partial.sourceRowsWithPairInFilteredSqlCount, 1);
assert.equal(partial.sourceRowsWithoutPairInFilteredSqlCount, 1);
assert.equal(partial.missingPairReservedRecipientCandidateCount, 0);
assert.equal(partial.missingPairOtherRecipientCount, 1);
assert.equal(partial.perGrantorAndOptionsRestoreParityProven, false);
const present = observeSealedRoleDumpCoverage(
  source([e('myeongha_alpha', 'postgres')]),
  'GRANT "myeongha_alpha" TO "postgres";\n', runner);
assert.equal(present.verdict, 'OBSERVED_PAIR_PRESENCE_ONLY_NOT_ROLE_PARITY');
assert.equal(present.fullProviderCompatibleRestoreProven, false);
const old = observeSealedRoleDumpCoverage({
  ...source([]), applicationExternalRoleBoundary: undefined,
}, '', runner);
assert.equal(old.sourceWitnessAvailable, false);
assert.equal(old.sourceDirectMembershipCount, null);
assert.equal(old.verdict, 'HOLD_SOURCE_WITNESS_MISSING');
const unknownGrammar = observeSealedRoleDumpCoverage(
  source([e('myeongha_alpha','postgres')]),
  'GRANT role_without_quotes TO another;\n', runner);
assert.equal(unknownGrammar.filteredRolesSqlUnparsedGrantStatementCount, 1);
assert.deepEqual(unknownGrammar.filteredRolesSqlUnparsedGrantShapeCounts,
  { unquoted_or_unexpected_granted_roles: 1 });
assert.equal(unknownGrammar.verdict,
  'HOLD_FILTERED_DUMP_GRANT_GRAMMAR_UNRECOGNIZED');
assert.throws(() => observeSealedRoleDumpCoverage(source([
  e('myeongha_alpha','myeongha_beta'),
]), '',runner), /exactly one/);
assert.throws(() => observeSealedRoleDumpCoverage(source([rows[0],rows[0]]),
  '',runner), /Duplicate source membership/);
assert.throws(() => observeSealedRoleDumpCoverage(source(rows),
  '',runner.replace("reserved_roles='", "reserved_roles='tampered|")), /exclusion list changed/);
assert.throws(() => observeSealedRoleDumpCoverage({
  ...source(rows), sourceCatalogBoundToBackupSnapshot: true,
}, '',runner), /true !== false/);
const multilineSource = source([
  e('myeongha_alpha', 'postgres'), e('myeongha_beta', 'postgres'),
  e('myeongha_alpha', 'service_role'),
]);
const multilineSql = [
  '-- GRANT "decoy" TO "postgres";',
  'GRANT',
  ' "myeongha_alpha",',
  ' "myeongha_beta"',
  ' TO',
  ' "postgres", "service_role"',
  ' WITH INHERIT TRUE, SET FALSE GRANTED BY "postgres";',
].join('\n') + '\n';
const multiline = observeSealedRoleDumpCoverage(
  multilineSource, multilineSql, runner);
assert.equal(multiline.filteredRolesSqlGrantStatementCount, 1);
assert.equal(multiline.filteredRolesSqlUnparsedGrantStatementCount, 0);
assert.equal(multiline.sourceRowsWithPairInFilteredSqlCount, 3);
assert.equal(multiline.sourceRowsWithoutPairInFilteredSqlCount, 0);
assert.equal(multiline.verdict, 'OBSERVED_PAIR_PRESENCE_ONLY_NOT_ROLE_PARITY');
assert.equal(multiline.drReady, false);
const semicolonInQuotedMember = observeSealedRoleDumpCoverage(
  source([e('myeongha_alpha', 'external;role')]),
  'GRANT "myeongha_alpha" TO "external;role";\n', runner);
assert.equal(semicolonInQuotedMember.sourceRowsWithPairInFilteredSqlCount, 1);
assert.equal(semicolonInQuotedMember.filteredRolesSqlUnparsedGrantStatementCount, 0);
const unterminated = observeSealedRoleDumpCoverage(
  source([e('myeongha_alpha', 'postgres')]),
  'GRANT "myeongha_alpha" TO "postgres"\n', runner);
assert.equal(unterminated.filteredRolesSqlUnparsedGrantStatementCount, 1);
assert.deepEqual(unterminated.filteredRolesSqlUnparsedGrantShapeCounts,
  { unterminated_statement: 1 });
assert.equal(unterminated.verdict,
  'HOLD_FILTERED_DUMP_GRANT_GRAMMAR_UNRECOGNIZED');
const invalidTail = observeSealedRoleDumpCoverage(
  source([e('myeongha_alpha', 'postgres')]),
  'GRANT "myeongha_alpha" TO "postgres" UNKNOWN OPTION;\n', runner);
assert.equal(invalidTail.filteredRolesSqlUnparsedGrantStatementCount, 1);
assert.deepEqual(invalidTail.filteredRolesSqlUnparsedGrantShapeCounts,
  { unsupported_role_options_or_other_syntax: 1 });
assert.equal(invalidTail.sourceRowsWithPairInFilteredSqlCount, 0);
const objectPrivilege = observeSealedRoleDumpCoverage(
  source([e('myeongha_alpha', 'postgres')]),
  'GRANT SELECT ON TABLE "public"."example" TO "postgres";\n', runner);
assert.deepEqual(objectPrivilege.filteredRolesSqlUnparsedGrantShapeCounts, {});
assert.equal(objectPrivilege.filteredRolesSqlRecognizedObjectPrivilegeGrantCount, 1);
assert.equal(objectPrivilege.filteredRolesSqlUnparsedGrantStatementCount, 0);
assert.equal(objectPrivilege.sourceRowsWithoutPairInFilteredSqlCount, 1);
assert.equal(objectPrivilege.drReady, false);
assert.equal(objectPrivilege.serviceResumptionAllowed, false);
const onAsRoleName = observeSealedRoleDumpCoverage(
  source([e('myeongha_alpha', 'ON')]),
  'GRANT "myeongha_alpha" TO "ON";\n', runner);
assert.equal(onAsRoleName.filteredRolesSqlRecognizedObjectPrivilegeGrantCount, 0);
assert.equal(onAsRoleName.sourceRowsWithPairInFilteredSqlCount, 1);
const malformedObject = observeSealedRoleDumpCoverage(
  source([e('myeongha_alpha', 'postgres')]),
  'GRANT ALL ON UNDOCUMENTED_OBJECT "x" TO "postgres";\n', runner);
assert.equal(malformedObject.filteredRolesSqlRecognizedObjectPrivilegeGrantCount, 0);
assert.equal(malformedObject.filteredRolesSqlUnparsedGrantStatementCount, 1);
for (const report of [unknownGrammar, unterminated, invalidTail, malformedObject]) {
  assert.equal(Object.values(report.filteredRolesSqlUnparsedGrantShapeCounts)
    .reduce((a, b) => a + b, 0),
  report.filteredRolesSqlUnparsedGrantStatementCount);
  const json = JSON.stringify(report);
  for (const forbidden of ['myeongha_alpha', 'role_without_quotes',
    'unknown_option', 'public', 'postgres']) {
    assert.equal(json.toLowerCase().includes(forbidden), false);
  }
}
const harness = await readFile('scripts/run-postgres-isolated-restore-drill.sh','utf8');
for (const fragment of [
  '--source "$work_dir/source-app-catalog.json"',
  '--roles "$work_dir/roles.sql"',
  '--dump-runner scripts/operations/run-production-postgres-strict-dump.sh',
  'role-dump-coverage.json',
]) {
  assert.ok(harness.includes(fragment), 'Restore harness missing private coverage proof');
}
console.log('Phase 8-A sealed filtered role dump coverage verification PASS; DR BLOCKED');
