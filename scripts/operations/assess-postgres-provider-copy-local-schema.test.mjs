import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessProviderCopyLocalSchema } from './assess-postgres-provider-copy-local-schema.mjs';

const source = JSON.parse(await readFile(
  new URL('../../docs/operations/POSTGRES_PROVIDER_COPY_SOURCE_GAP_20261111.json', import.meta.url), 'utf8'));
const fakeLocal = () => ({
  schemaVersion: 'ops-disposable-provider-catalog-v1',
  postgresMajor: 17,
  relationRowsRead: false,
  tables: [
    ...source.skippedTables.map(x => ({ schema:x.schema, table:x.table, columns:[] })),
    ...source.projectedTables.map(x => ({
      schema:x.schema, table:x.table, columns:[...x.previouslyDroppedSourceColumns],
    })),
  ],
});
test('full table and previous-column presence stays schema-only and fails DR admission', () => {
  const result = assessProviderCopyLocalSchema(source, fakeLocal());
  assert.equal(result.previouslySkippedRelationsPresentInLocal, 29);
  assert.equal(result.previouslySkippedRelationsStillAbsentInLocal, 0);
  assert.equal(result.previouslyProjectedSourceColumnsMissingInLocal.length, 0);
  assert.equal(result.recoveredProductionProviderRows, 0);
  assert.equal(result.schemaVersionEquivalenceProven, false);
  assert.equal(result.drReady, false);
  assert.equal(result.serviceResumptionAllowed, false);
});
test('missing relation and source column are retained as explicit gaps', () => {
  const local = fakeLocal();
  local.tables.shift();
  const projected = local.tables.find(x => x.table === source.projectedTables[1].table);
  projected.columns.shift();
  const result = assessProviderCopyLocalSchema(source, local);
  assert.equal(result.previouslySkippedRelationsStillAbsentInLocal, 1);
  assert.equal(result.previouslyProjectedSourceColumnsMissingInLocal.length, 1);
  assert.equal(result.verdict, 'LOCAL_PROVIDER_SCHEMA_STILL_INCOMPATIBLE__REQUIRES_VERSION_OR_MIGRATION_REVIEW');
});
test('rejects a modified backup-count witness', () => {
  const forged = structuredClone(source);
  forged.skippedTables[0].sourceRowCount += 1;
  assert.throws(() => assessProviderCopyLocalSchema(forged, fakeLocal()));
});
test('rejects any source that claims row payload exposure or recovery readiness', () => {
  const forged = structuredClone(source);
  forged.containsIdentifiers = true;
  assert.throws(() => assessProviderCopyLocalSchema(forged, fakeLocal()));
});
