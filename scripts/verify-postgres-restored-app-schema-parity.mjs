// Verify Phase 8-A schema parity comparison without another Production query.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRestoredReadOnlyQuery, compareApplicationCatalog } from
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
assert.ok(!restoredQuery.includes('FROM supabase_migrations.schema_migrations'));

const restored = {
  ...structuredClone(source),
  postgresVersion: source.postgresqlVersion,
  migrationCatalog: { totalVersions: null, latestVersion: null },
};
const frontier = source.migrationCatalog.latestVersion;
const matched = compareApplicationCatalog(source, restored, frontier);
assert.equal(matched.applicationScopeVerdict, 'MATCH_APPLICATION_CATALOG_ONLY');
assert.equal(matched.verifiedApplicationScopeEquivalence, true);
assert.equal(matched.verifiedFullSchemaCatalogEquivalence, false);
assert.equal(matched.sourceCatalogBoundToBackupSnapshot, false);
assert.equal(matched.restoreMismatchRootCauseProven, false);
assert.deepEqual(matched.componentHashEvidence, {
  tableStructure: false, schemaAclGrantEntries: false,
  routineAclGrantEntries: false,
});
assert.equal(matched.sourceCatalogProvenance, 'legacy_date_only_observation');
assert.equal(matched.sourceCatalogProvenanceHold,
  'SOURCE_OBSERVATION_DATE_ONLY_NO_BACKUP_SNAPSHOT_WITNESS');

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
const facetedRestored = {
  ...structuredClone(facetedSource),
  postgresVersion: source.postgresqlVersion,
  migrationCatalog: { totalVersions: null, latestVersion: null },
};
const facetedMatch = compareApplicationCatalog(facetedSource, facetedRestored, frontier);
assert.deepEqual(facetedMatch.componentHashEvidence, {
  tableStructure: true, schemaAclGrantEntries: true,
  routineAclGrantEntries: true,
});
assert.equal(facetedMatch.applicationScopeVerdict, 'MATCH_APPLICATION_CATALOG_ONLY');

// Old sealed catalogs have no facet hashes while the newer restored SQL does;
// do not misclassify all objects merely because newer read-only output grew.
const olderSealedAgainstNewerRestore = compareApplicationCatalog(
  bracketedSource, facetedRestored, frontier);
assert.equal(olderSealedAgainstNewerRestore.applicationScopeVerdict,
  'MATCH_APPLICATION_CATALOG_ONLY');
assert.equal(olderSealedAgainstNewerRestore.componentHashEvidence.tableStructure, false);

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
