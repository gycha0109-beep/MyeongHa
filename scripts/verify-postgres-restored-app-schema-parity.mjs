// Verify Phase 8-A schema parity comparison without another Production query.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRestoredReadOnlyQuery, compareApplicationCatalog,
  observeApplicationDirectRoleGraph } from
  './operations/check-postgres-restored-app-schema-parity.mjs';

const source = JSON.parse(await readFile(
  'docs/operations/POSTGRES_FULL_APP_SCHEMA_FINGERPRINT_20261107.json', 'utf8'));
const query = await readFile(
  'scripts/operations/production-app-schema-fingerprint-readonly.sql', 'utf8');
const restoredQuery = buildRestoredReadOnlyQuery(query);
assert.ok(restoredQuery.includes('BEGIN TRANSACTION READ ONLY;'));
assert.ok(restoredQuery.includes("'totalVersions',null"));
assert.ok(!restoredQuery.includes('FROM supabase_migrations.schema_migrations'));
assert.ok(restoredQuery.includes('full_definition_sha256'));
assert.ok(restoredQuery.includes('structural_sha256'));
assert.ok(restoredQuery.includes('structural_component_sha256'));
assert.ok(restoredQuery.includes('acl_sha256'));
assert.ok(restoredQuery.includes('acl_grant_entries_without_grantor_sha256'));
assert.ok(restoredQuery.includes('acl_by_grantee_privilege_sha256'));
assert.ok(restoredQuery.includes('acl_by_grantee_grantor_privilege_sha256'));
assert.ok(restoredQuery.includes('applicationRoleGraph'));
assert.ok(restoredQuery.includes('pg_catalog.pg_auth_members'));
assert.ok(restoredQuery.includes('m.admin_option, m.inherit_option, m.set_option')
  || restoredQuery.includes('edge.admin_option, edge.inherit_option, edge.set_option'));
assert.ok(!restoredQuery.includes('FROM supabase_migrations.schema_migrations'));

const restored = {
  ...structuredClone(source),
  postgresVersion: source.postgresqlVersion,
  migrationCatalog: { totalVersions: null, latestVersion: null },
};
const frontier = source.migrationCatalog.latestVersion;
const matched = compareApplicationCatalog(source, restored, frontier);
assert.equal(matched.applicationScopeVerdict, 'MATCH_APPLICATION_CATALOG_ONLY');
assert.deepEqual(matched.observedCanonicalAclCatalog, {
  witnessComplete: false, observedApplicationCatalogParity: false,
  legacyHashOnlyByKind: null, unresolvedByKind: null,
});
assert.equal(matched.verifiedApplicationScopeEquivalence, true);
assert.deepEqual(matched.observedApplicationDirectRoleGraph, {
  sourceWitnessAvailable: false,
  observedMembershipOptionsParity: false,
  observedGrantorAttributionParity: false,
  observedPortableGrantorRewriteCompatibility: null,
  scope: 'myeongha_to_myeongha_direct_membership_only_v1',
  providerBoundaryMembershipsIncluded: false, details: null,
});
assert.equal(matched.verifiedFullSchemaCatalogEquivalence, false);
assert.equal(matched.sourceCatalogBoundToBackupSnapshot, false);
assert.equal(matched.restoreMismatchRootCauseProven, false);
assert.deepEqual(matched.componentHashEvidence, {
  tableStructure: false, schemaAclGrantEntries: false,
  routineAclGrantEntries: false,
  tableAclByGrantee: false, schemaAclByGrantee: false, routineAclByGrantee: false,
  tableAclGrantorByGrantee: false, schemaAclGrantorByGrantee: false,
  routineAclGrantorByGrantee: false,
});
assert.equal(matched.sourceCatalogProvenance, 'legacy_date_only_observation');
assert.equal(matched.sourceCatalogProvenanceHold,
  'SOURCE_OBSERVATION_DATE_ONLY_NO_BACKUP_SNAPSHOT_WITNESS');

// Phase 8-A: direct MyeongHa-owned role graph is read-only metadata and
// NEVER proves provider-granted memberships or inherited/effective privileges.
const role = (name, flags = {}) => ({
  role_name: name, superuser: false, inherit: false, create_role: false,
  create_database: false, can_login: false, replication: false,
  bypass_rls: false, connection_limit: -1, ...flags,
});
const sourceGraph = {
  applicationRoleGraph: {
    scope: 'myeongha_to_myeongha_direct_membership_only_v1',
    providerBoundaryMembershipsIncluded: false,
    roles: [role('myeongha_role_a'), role('myeongha_role_b')],
    directMemberships: [{
      granted_role: 'myeongha_role_a', member_role: 'myeongha_role_b',
      grantor_name: 'postgres', admin_option: false,
      inherit_option: false, set_option: false,
    }],
  },
};
const roleGraphSame = structuredClone(sourceGraph);
const sameGraph = observeApplicationDirectRoleGraph(sourceGraph, roleGraphSame);
assert.equal(sameGraph.sourceWitnessAvailable, true);
assert.equal(sameGraph.observedMembershipOptionsParity, true);
assert.equal(sameGraph.observedGrantorAttributionParity, true);
assert.equal(sameGraph.observedPortableGrantorRewriteCompatibility, null);
assert.deepEqual(sameGraph.details, {
  sourceRoleCount: 2, restoredRoleCount: 2,
  sourceDirectMembershipCount: 1, restoredDirectMembershipCount: 1,
  missingRoleCount: 0, addedRoleCount: 0, roleAttributesDifferentCount: 0,
  missingMembershipEntryCount: 0, addedMembershipEntryCount: 0,
  grantorAttributionDifferenceGroupCount: 0,
  portablePostgresGrantorRewriteCompatibleGroupCount: 0,
  unexplainedGrantorAttributionDifferenceGroupCount: 0,
});
const providerGrantorChanged = structuredClone(sourceGraph);
providerGrantorChanged.applicationRoleGraph.directMemberships[0].grantor_name =
  'supabase_admin';
const grantorChanged = observeApplicationDirectRoleGraph(
  sourceGraph, providerGrantorChanged);
assert.equal(grantorChanged.observedMembershipOptionsParity, true);
assert.equal(grantorChanged.observedGrantorAttributionParity, false);
assert.equal(grantorChanged.details.grantorAttributionDifferenceGroupCount, 1);
assert.equal(grantorChanged.observedPortableGrantorRewriteCompatibility, true);
assert.equal(grantorChanged.details.portablePostgresGrantorRewriteCompatibleGroupCount, 1);
assert.equal(grantorChanged.details.unexplainedGrantorAttributionDifferenceGroupCount, 0);
const unrelatedGrantor = structuredClone(providerGrantorChanged);
unrelatedGrantor.applicationRoleGraph.directMemberships[0].grantor_name = 'unknown_grantor';
const unrelatedResult = observeApplicationDirectRoleGraph(sourceGraph, unrelatedGrantor);
assert.equal(unrelatedResult.observedMembershipOptionsParity, true);
assert.equal(unrelatedResult.observedGrantorAttributionParity, false);
assert.equal(unrelatedResult.observedPortableGrantorRewriteCompatibility, false);
assert.equal(unrelatedResult.details.portablePostgresGrantorRewriteCompatibleGroupCount, 0);
assert.equal(unrelatedResult.details.unexplainedGrantorAttributionDifferenceGroupCount, 1);
const otherSourceGrantor = structuredClone(sourceGraph);
otherSourceGrantor.applicationRoleGraph.directMemberships[0].grantor_name =
  'other_provider';
assert.equal(observeApplicationDirectRoleGraph(otherSourceGrantor,
  providerGrantorChanged).observedPortableGrantorRewriteCompatibility, false);
const twoEdgeSource = structuredClone(sourceGraph);
twoEdgeSource.applicationRoleGraph.directMemberships.push({
  granted_role: 'myeongha_role_b', member_role: 'myeongha_role_a',
  grantor_name: 'other_provider', admin_option: false,
  inherit_option: true, set_option: false,
});
const twoEdgeRestored = structuredClone(twoEdgeSource);
twoEdgeRestored.applicationRoleGraph.directMemberships[0].grantor_name =
  'supabase_admin';
twoEdgeRestored.applicationRoleGraph.directMemberships[1].grantor_name =
  'supabase_admin';
const mixedProvenance = observeApplicationDirectRoleGraph(twoEdgeSource,
  twoEdgeRestored);
assert.equal(mixedProvenance.details.grantorAttributionDifferenceGroupCount, 2);
assert.equal(mixedProvenance.details.portablePostgresGrantorRewriteCompatibleGroupCount, 1);
assert.equal(mixedProvenance.details.unexplainedGrantorAttributionDifferenceGroupCount, 1);
assert.equal(mixedProvenance.observedPortableGrantorRewriteCompatibility, false);
const optionsChanged = structuredClone(sourceGraph);
optionsChanged.applicationRoleGraph.directMemberships[0].set_option = true;
const optionsResult = observeApplicationDirectRoleGraph(sourceGraph, optionsChanged);
assert.equal(optionsResult.observedMembershipOptionsParity, false);
assert.equal(optionsResult.details.missingMembershipEntryCount, 1);
assert.equal(optionsResult.details.addedMembershipEntryCount, 1);
const roleFlagsChanged = structuredClone(sourceGraph);
roleFlagsChanged.applicationRoleGraph.roles[0].bypass_rls = true;
assert.equal(observeApplicationDirectRoleGraph(sourceGraph, roleFlagsChanged)
  .details.roleAttributesDifferentCount, 1);
const roleMissing = structuredClone(sourceGraph);
roleMissing.applicationRoleGraph.roles[1].role_name = 'myeongha_role_c';
roleMissing.applicationRoleGraph.directMemberships[0].member_role = 'myeongha_role_c';
assert.equal(observeApplicationDirectRoleGraph(sourceGraph, roleMissing)
  .details.missingRoleCount, 1);
const edgeMissing = structuredClone(sourceGraph);
edgeMissing.applicationRoleGraph.directMemberships = [];
assert.equal(observeApplicationDirectRoleGraph(sourceGraph, edgeMissing)
  .details.missingMembershipEntryCount, 1);
const edgeExtra = structuredClone(sourceGraph);
edgeExtra.applicationRoleGraph.directMemberships.push({
  granted_role: 'myeongha_role_b', member_role: 'myeongha_role_a',
  grantor_name: 'postgres', admin_option: false,
  inherit_option: false, set_option: true,
});
assert.equal(observeApplicationDirectRoleGraph(sourceGraph, edgeExtra)
  .details.addedMembershipEntryCount, 1);
for (const corrupt of [
  g => { g.providerBoundaryMembershipsIncluded = true; },
  g => { g.roles[0].role_name = 'postgres'; },
  g => { g.roles[0].can_login = 'false'; },
  g => { g.directMemberships[0].grantor_name = ''; },
  g => { g.directMemberships[0].set_option = null; },
  g => { g.directMemberships.push(structuredClone(g.directMemberships[0])); },
]) {
  const invalid = structuredClone(sourceGraph);
  corrupt(invalid.applicationRoleGraph);
  assert.throws(() => observeApplicationDirectRoleGraph(invalid, roleGraphSame));
}
const bracketedSource = {
  ...structuredClone(source),
  sourceCatalogProvenance: 'encrypted_backup_bracketed_readonly_v1',
  sourceCatalogBracketStartUtc: '2026-11-07T20:00:00Z',
  sourceCatalogBracketEndUtc: '2026-11-07T20:05:00Z',
  sourceCatalogBracketStable: true,
  sourceCatalogBoundToBackupSnapshot: false,
};
const bracketed = compareApplicationCatalog(bracketedSource, restored, frontier);
assert.equal(bracketed.sourceCatalogProvenance, 'encrypted_backup_bracketed_readonly_v1');
assert.equal(bracketed.sourceCatalogProvenanceHold,
  'SOURCE_BACKUP_EXECUTION_BRACKETED_NO_SHARED_MVCC_SNAPSHOT');
assert.equal(bracketed.verifiedApplicationScopeEquivalence, true);
assert.equal(bracketed.sourceCatalogBoundToBackupSnapshot, false);
assert.equal(bracketed.restoreMismatchRootCauseProven, false);
assert.equal(bracketed.verifiedFullSchemaCatalogEquivalence, false);
assert.equal(bracketed.drReady, false);
const scopedSource = { ...structuredClone(bracketedSource), ...sourceGraph };
const scopedRestored = { ...structuredClone(restored), ...roleGraphSame };
const scopedResult = compareApplicationCatalog(scopedSource, scopedRestored, frontier);
assert.equal(scopedResult.observedApplicationDirectRoleGraph.sourceWitnessAvailable, true);
assert.equal(scopedResult.observedApplicationDirectRoleGraph.observedMembershipOptionsParity, true);
assert.equal(scopedResult.roleMembershipParityProven, false);
assert.throws(() => compareApplicationCatalog(
  { ...structuredClone(source), ...sourceGraph }, scopedRestored, frontier));
assert.throws(() => compareApplicationCatalog(scopedSource,
  { ...structuredClone(restored) }, frontier));
assert.equal(scopedResult.drReady, false);
const scopedDrift = compareApplicationCatalog(scopedSource,
  { ...structuredClone(restored), ...optionsChanged }, frontier);
assert.equal(scopedDrift.observedApplicationDirectRoleGraph.observedMembershipOptionsParity,
  false);
assert.equal(scopedDrift.roleMembershipParityProven, false);
assert.equal(scopedDrift.serviceResumptionAllowed, false);
const rewrittenScopedRestored = {
  ...structuredClone(restored), ...providerGrantorChanged,
};
const rewrittenScope = compareApplicationCatalog(scopedSource,
  rewrittenScopedRestored, frontier);
assert.equal(rewrittenScope.observedApplicationDirectRoleGraph
  .observedPortableGrantorRewriteCompatibility, true);
assert.equal(rewrittenScope.observedApplicationDirectRoleGraph
  .observedGrantorAttributionParity, false);
assert.equal(rewrittenScope.roleMembershipParityProven, false);
assert.equal(rewrittenScope.drReady, false);
assert.equal(rewrittenScope.serviceResumptionAllowed, false);


for (const mutation of [
  s => { s.sourceCatalogBracketStable = false; },
  s => { s.sourceCatalogBoundToBackupSnapshot = true; },
  s => { s.sourceCatalogBracketEndUtc = '2026-11-07T19:59:59Z'; },
  s => { s.sourceCatalogProvenance = 'unapproved_source'; },
]) {
  const corrupted = structuredClone(bracketedSource);
  mutation(corrupted);
  assert.throws(() => compareApplicationCatalog(corrupted, restored, frontier));
}
// New encrypted backups carry facet hashes. Old backups continue to compare
// with aggregate-only hashes; the verifier never invents a facet-level cause.
const facetedSource = structuredClone(bracketedSource);
const componentNames = [
  'columns', 'constraints', 'indexes', 'triggers', 'policies', 'acl',
  'reloptions', 'persistence', 'rowSecurityEnabled', 'rowSecurityForced',
];
for (const row of facetedSource.tables) {
  row.structural_component_sha256 =
    Object.fromEntries(componentNames.map(key => [key, 'a'.repeat(64)]));
}
for (const row of [...facetedSource.schemas, ...facetedSource.functions]) {
  row.acl_grant_entries_without_grantor_sha256 = 'a'.repeat(64);
}
for (const row of [...facetedSource.tables, ...facetedSource.schemas,
  ...facetedSource.functions]) {
  row.acl_by_grantee_privilege_sha256 = {
    anon: 'a'.repeat(64), service_role: 'a'.repeat(64),
  };
  row.acl_by_grantee_grantor_privilege_sha256 = {
    anon: 'a'.repeat(64), service_role: 'a'.repeat(64),
  };
}
const facetedRestored = {
  ...structuredClone(facetedSource),
  postgresVersion: source.postgresqlVersion,
  migrationCatalog: { totalVersions: null, latestVersion: null },
};
const facetedMatch = compareApplicationCatalog(facetedSource, facetedRestored, frontier);
assert.deepEqual(facetedMatch.componentHashEvidence, {
  tableStructure: true, schemaAclGrantEntries: true,
  routineAclGrantEntries: true,
  tableAclByGrantee: true, schemaAclByGrantee: true, routineAclByGrantee: true,
  tableAclGrantorByGrantee: true, schemaAclGrantorByGrantee: true,
  routineAclGrantorByGrantee: true,
});
assert.equal(facetedMatch.applicationScopeVerdict, 'MATCH_APPLICATION_CATALOG_ONLY');
assert.deepEqual(facetedMatch.observedCanonicalAclCatalog, {
  witnessComplete: true, observedApplicationCatalogParity: true,
  legacyHashOnlyByKind: { schemas: 0, tables: 0, functions: 0 },
  unresolvedByKind: { schemas: 0, tables: 0, functions: 0 },
});

// Old sealed catalogs have no facet hashes while the newer restored SQL does;
// do not misclassify all objects merely because newer read-only output grew.
const olderSealedAgainstNewerRestore = compareApplicationCatalog(
  bracketedSource, facetedRestored, frontier);
assert.equal(olderSealedAgainstNewerRestore.applicationScopeVerdict,
  'MATCH_APPLICATION_CATALOG_ONLY');
assert.equal(olderSealedAgainstNewerRestore.componentHashEvidence.tableStructure, false);
assert.equal(olderSealedAgainstNewerRestore
  .observedCanonicalAclCatalog.observedApplicationCatalogParity, false);

// The new ACL witness narrows which DB role's grants differ without
// exposing permission tuples or admitting the application for DR.
const roleRestored = structuredClone(facetedRestored);
roleRestored.tables[1].structural_sha256 = 'b'.repeat(64);
roleRestored.tables[1].structural_component_sha256.acl = 'b'.repeat(64);
roleRestored.tables[1].acl_by_grantee_privilege_sha256.anon = 'b'.repeat(64);
roleRestored.tables[1].acl_by_grantee_grantor_privilege_sha256.anon = 'b'.repeat(64);
roleRestored.schemas[1].acl_sha256 = 'b'.repeat(64);
roleRestored.schemas[1].acl_grant_entries_without_grantor_sha256 = 'b'.repeat(64);
roleRestored.schemas[1].acl_by_grantee_privilege_sha256.service_role = 'b'.repeat(64);
roleRestored.schemas[1].acl_by_grantee_grantor_privilege_sha256.service_role = 'b'.repeat(64);
roleRestored.functions[1].acl_sha256 = 'b'.repeat(64);
roleRestored.functions[1].acl_grant_entries_without_grantor_sha256 = 'b'.repeat(64);
roleRestored.functions[1].acl_by_grantee_privilege_sha256.anon = 'b'.repeat(64);
roleRestored.functions[1].acl_by_grantee_grantor_privilege_sha256.anon = 'b'.repeat(64);
const roleMismatch = compareApplicationCatalog(facetedSource, roleRestored, frontier);
assert.deepEqual(roleMismatch.types.tables.changed[0].structuralComponentDifferences,
  ['acl']);
assert.deepEqual(roleMismatch.types.tables.changed[0].aclAffectedGrantees, ['anon']);
assert.deepEqual(roleMismatch.types.schemas.changed[0].aclAffectedGrantees,
  ['service_role']);
assert.deepEqual(roleMismatch.types.functions.changed[0].aclAffectedGrantees,
  ['anon']);
for (const kind of ['schemas', 'tables', 'functions']) {
  assert.equal(roleMismatch.types[kind].changed[0].aclGranteePrivilegeVerdict,
    'DIFFERENT_DIRECT_GRANTEE_PRIVILEGES');
}
// An aggregate hash can differ when role OIDs and grant-entry aggregation
// order differ across clusters even with identical direct grant entries.
const sameRoleGrants = structuredClone(facetedRestored);
sameRoleGrants.schemas[0].acl_sha256 = 'b'.repeat(64);
sameRoleGrants.schemas[0].acl_grant_entries_without_grantor_sha256 = 'b'.repeat(64);
sameRoleGrants.tables[0].structural_sha256 = 'b'.repeat(64);
sameRoleGrants.tables[0].structural_component_sha256.acl = 'b'.repeat(64);
sameRoleGrants.functions[0].acl_sha256 = 'b'.repeat(64);
sameRoleGrants.functions[0].acl_grant_entries_without_grantor_sha256 =
  'b'.repeat(64);
const orderAmbiguity = compareApplicationCatalog(facetedSource, sameRoleGrants, frontier);
for (const kind of ['schemas', 'tables', 'functions']) {
  assert.deepEqual(orderAmbiguity.types[kind].changed[0].aclAffectedGrantees, []);
  assert.equal(orderAmbiguity.types[kind].changed[0].aclGranteePrivilegeVerdict,
    'MATCH_DIRECT_GRANTEE_PRIVILEGES_ACL_HASH_DIFFERS');
  assert.deepEqual(orderAmbiguity.types[kind].changed[0]
    .aclCanonicalGrantorChangedGrantees, []);
  assert.equal(orderAmbiguity.types[kind].changed[0].aclCanonicalGrantorVerdict,
    'MATCH_CANONICAL_GRANTOR_ENTRIES_LEGACY_ACL_HASH_DIFFERS');
}
assert.equal(orderAmbiguity.applicationScopeVerdict,
  'HOLD_APPLICATION_SCHEMA_PARITY_MISMATCH');
assert.deepEqual(orderAmbiguity.observedCanonicalAclCatalog, {
  witnessComplete: true, observedApplicationCatalogParity: true,
  legacyHashOnlyByKind: { schemas: 1, tables: 1, functions: 1 },
  unresolvedByKind: { schemas: 0, tables: 0, functions: 0 },
});
assert.equal(orderAmbiguity.restoreMismatchRootCauseProven, false);
assert.equal(orderAmbiguity.drReady, false);

// Same direct privileges but different canonical grantor attribution: this
// evidence is not an OID-ordering-only match and must remain fail-closed.
const alteredGrantor = structuredClone(sameRoleGrants);
alteredGrantor.schemas[0].acl_by_grantee_grantor_privilege_sha256.anon =
  'b'.repeat(64);
alteredGrantor.tables[0].acl_by_grantee_grantor_privilege_sha256.anon =
  'b'.repeat(64);
alteredGrantor.functions[0].acl_by_grantee_grantor_privilege_sha256.anon =
  'b'.repeat(64);
const changedGrantor = compareApplicationCatalog(facetedSource, alteredGrantor, frontier);
for (const kind of ['schemas', 'tables', 'functions']) {
  assert.equal(changedGrantor.types[kind].changed[0].aclCanonicalGrantorVerdict,
    'DIFFERENT_CANONICAL_GRANTOR_ENTRIES');
  assert.deepEqual(changedGrantor.types[kind].changed[0]
    .aclCanonicalGrantorChangedGrantees, ['anon']);
}
assert.equal(changedGrantor.drReady, false);
assert.deepEqual(changedGrantor.observedCanonicalAclCatalog, {
  witnessComplete: true, observedApplicationCatalogParity: false,
  legacyHashOnlyByKind: { schemas: 0, tables: 0, functions: 0 },
  unresolvedByKind: { schemas: 1, tables: 1, functions: 1 },
});
const malformedGrantor = structuredClone(alteredGrantor);
malformedGrantor.functions[0].acl_by_grantee_grantor_privilege_sha256.anon =
  'invalid';
assert.throws(() => compareApplicationCatalog(facetedSource, malformedGrantor, frontier));
const incompleteGrantor = structuredClone(facetedSource);
delete incompleteGrantor.tables[0].acl_by_grantee_grantor_privilege_sha256;
assert.throws(() => compareApplicationCatalog(incompleteGrantor, alteredGrantor, frontier));
const forgedGrantor = structuredClone(facetedRestored);
forgedGrantor.functions[0].acl_by_grantee_grantor_privilege_sha256.anon =
  'b'.repeat(64);
assert.throws(() => compareApplicationCatalog(facetedSource, forgedGrantor, frontier));

assert.equal(roleMismatch.restoreMismatchRootCauseProven, false);

for (const kind of ['schemas', 'tables', 'functions']) {
  assert.equal(roleMismatch.types[kind].changed[0].aclCanonicalGrantorVerdict,
    'DIFFERENT_CANONICAL_GRANTOR_ENTRIES');
}
assert.equal(roleMismatch.restoreMismatchRootCauseProven, false);
assert.equal(roleMismatch.drReady, false);
assert.equal(roleMismatch.observedCanonicalAclCatalog
  .observedApplicationCatalogParity, false);
const missingRoleMap = structuredClone(roleRestored);
delete missingRoleMap.tables[0].acl_by_grantee_privilege_sha256;
assert.throws(() => compareApplicationCatalog(facetedSource, missingRoleMap, frontier));
const corruptRoleHash = structuredClone(roleRestored);
corruptRoleHash.tables[0].acl_by_grantee_privilege_sha256.anon = 'bad';
assert.throws(() => compareApplicationCatalog(facetedSource, corruptRoleHash, frontier));
const falseRoleDrift = structuredClone(facetedRestored);
falseRoleDrift.functions[0].acl_by_grantee_privilege_sha256.anon = 'b'.repeat(64);
assert.throws(() => compareApplicationCatalog(facetedSource, falseRoleDrift, frontier));
const incompleteSourceRoleMap = structuredClone(facetedSource);
delete incompleteSourceRoleMap.functions[0].acl_by_grantee_privilege_sha256;
assert.throws(() => compareApplicationCatalog(incompleteSourceRoleMap,
  facetedRestored, frontier));

facetedRestored.tables[0].structural_sha256 = 'b'.repeat(64);
facetedRestored.tables[0].structural_component_sha256.columns = 'b'.repeat(64);
facetedRestored.schemas[0].acl_sha256 = 'b'.repeat(64);
facetedRestored.schemas[0].acl_grant_entries_without_grantor_sha256 = 'b'.repeat(64);
facetedRestored.functions[0].acl_sha256 = 'b'.repeat(64);
const facetMismatch = compareApplicationCatalog(facetedSource, facetedRestored, frontier);
assert.equal(facetMismatch.applicationScopeVerdict, 'HOLD_APPLICATION_SCHEMA_PARITY_MISMATCH');
assert.deepEqual(facetMismatch.types.tables.changed[0].structuralComponentDifferences,
  ['columns']);
assert.equal(facetMismatch.types.schemas.changed[0].aclDifferenceScope,
  'GRANT_ENTRIES_DIFFER');
assert.equal(facetMismatch.types.functions.changed[0].aclDifferenceScope,
  'GRANTOR_ATTRIBUTION_ONLY');
assert.equal(facetMismatch.restoreMismatchRootCauseProven, false);
assert.equal(facetMismatch.drReady, false);
assert.equal(facetMismatch.observedCanonicalAclCatalog
  .observedApplicationCatalogParity, false);
assert.deepEqual(facetMismatch.observedCanonicalAclCatalog.unresolvedByKind,
  { schemas: 0, tables: 1, functions: 0 });

const tampered = structuredClone(facetedRestored);
delete tampered.tables[0].structural_component_sha256;
assert.throws(() => compareApplicationCatalog(facetedSource, tampered, frontier));
const inconsistent = structuredClone(facetedRestored);
inconsistent.tables[0].structural_sha256 =
  facetedSource.tables[0].structural_sha256;
assert.throws(() => compareApplicationCatalog(facetedSource, inconsistent, frontier));
const incomplete = structuredClone(facetedSource);
delete incomplete.tables[0].structural_component_sha256;
assert.throws(() => compareApplicationCatalog(incomplete, facetedRestored, frontier));

const unprovenLegacy = {...structuredClone(source), sourceCatalogBracketStable: true};
assert.throws(() => compareApplicationCatalog(unprovenLegacy, restored, frontier));
assert.equal(matched.drReady, false);
assert.equal(matched.serviceResumptionAllowed, false);
assert.equal(matched.types.schemas.matchingCount, 3);
assert.equal(matched.types.tables.matchingCount, 94);
assert.equal(matched.types.functions.matchingCount, 315);

const drift = structuredClone(restored);
drift.functions[0].acl_sha256 = '0'.repeat(64);
drift.tables[0].rls_enabled = !drift.tables[0].rls_enabled;
drift.schemas[0].owner_name = 'different_role';
drift.functions.pop();
const rejected = compareApplicationCatalog(source, drift, frontier);
assert.equal(rejected.applicationScopeVerdict, 'HOLD_APPLICATION_SCHEMA_PARITY_MISMATCH');
assert.equal(rejected.verifiedApplicationScopeEquivalence, false);
assert.ok(rejected.types.functions.missing.length === 1);
assert.ok(rejected.types.tables.changed.length === 1);
assert.ok(rejected.types.schemas.changed.length === 1);
assert.equal(rejected.drReady, false);
assert.equal(rejected.sourceCatalogBoundToBackupSnapshot, false);
assert.equal(rejected.restoreMismatchRootCauseProven, false);
assert.equal(compareApplicationCatalog(source, restored, '20261105075228')
  .applicationScopeVerdict, 'HOLD_SOURCE_BACKUP_FRONTIER_MISMATCH');
console.log('Phase 8-A application/restore parity comparison verification PASS; no live DR claim.');
