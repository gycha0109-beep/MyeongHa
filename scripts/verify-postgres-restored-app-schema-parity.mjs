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
assert.ok(restoredQuery.includes('acl_sha256'));

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
assert.equal(matched.sourceCatalogProvenanceHold,
  'SOURCE_OBSERVATION_DATE_ONLY_NO_BACKUP_SNAPSHOT_WITNESS');
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
