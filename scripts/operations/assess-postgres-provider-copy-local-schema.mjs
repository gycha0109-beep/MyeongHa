// Compare aggregate backup COPY omissions against an independently provisioned
// disposable Supabase local catalog. Never read or export user rows, keys, or SQL.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ident = /^[a-z_][a-z0-9_]{0,159}$/u;
const permittedSchemas = new Set(['auth', 'storage']);

function key(schema, table) {
  assert.ok(permittedSchemas.has(schema), 'Unexpected provider schema');
  assert.match(table, ident, 'Unexpected relation name');
  return schema + '.' + table;
}
function assertColumns(columns) {
  assert.ok(Array.isArray(columns), 'Columns must be an array');
  const seen = new Set();
  for (const col of columns) {
    assert.equal(typeof col, 'string');
    assert.match(col, ident, 'Unexpected column');
    assert.ok(!seen.has(col), 'Duplicate column');
    seen.add(col);
  }
}

export function assessProviderCopyLocalSchema(source, local) {
  assert.equal(source?.schemaVersion, 'ops-postgres-provider-copy-source-gap-v1');
  assert.equal(source.sourceBackupRunId, 42752268638);
  assert.equal(source.sourceRestoreRunId, 42967203704);
  assert.equal(source.sourceProviderSkippedBlocks, 29);
  assert.equal(source.sourceProviderSkippedRows, 66);
  assert.equal(source.sourceProviderProjectedBlocks, 3);
  assert.equal(source.sourceProviderProjectedRows, 27);
  assert.equal(source.containsIdentifiers, false);
  assert.equal(source.containsRowPayloads, false);
  assert.equal(source.sourceProviderFullRestoreProven, false);
  assert.equal(local?.schemaVersion, 'ops-disposable-provider-catalog-v1');
  assert.ok(['2.122.0', '3.1.0'].includes(local.cliVersion),
    'Only pinned local Supabase CLI baselines are accepted');
  assert.equal(local.postgresMajor, 17);
  assert.equal(local.relationRowsRead, false);
  assert.ok(Array.isArray(local.tables));

  const sourceKeys = new Set();
  const skipped = source.skippedTables.map(entry => {
    const k = key(entry.schema, entry.table);
    assert.ok(!sourceKeys.has(k), 'Duplicate source relation');
    sourceKeys.add(k);
    assert.equal(entry.reason, 'target_relation_missing');
    assert.ok(Number.isSafeInteger(entry.sourceRowCount) && entry.sourceRowCount >= 0);
    return { ...entry, k };
  });
  const projected = source.projectedTables.map(entry => {
    const k = key(entry.schema, entry.table);
    assert.ok(!sourceKeys.has(k), 'Source relation appears in both cohorts');
    sourceKeys.add(k);
    assert.equal(entry.reason, 'source_columns_projected_to_target');
    assert.ok(Number.isSafeInteger(entry.sourceRowCount) && entry.sourceRowCount >= 0);
    assertColumns(entry.previouslyDroppedSourceColumns);
    assert.ok(entry.previouslyDroppedSourceColumns.length > 0);
    return { ...entry, k };
  });
  assert.equal(skipped.length, 29);
  assert.equal(projected.length, 3);
  assert.equal(skipped.reduce((a, x) => a + x.sourceRowCount, 0), 66);
  assert.equal(projected.reduce((a, x) => a + x.sourceRowCount, 0), 27);

  const target = new Map();
  for (const t of local.tables) {
    const k = key(t.schema, t.table);
    assert.ok(!target.has(k), 'Duplicate local relation');
    assertColumns(t.columns);
    target.set(k, new Set(t.columns));
  }

  const existing = skipped.filter(x => target.has(x.k));
  const missing = skipped.filter(x => !target.has(x.k));
  const cohorts = Object.fromEntries(['auth', 'storage'].map(schema => {
    const subset = skipped.filter(x => x.schema === schema);
    return [schema, {
      sourceMissingBlocks: subset.length,
      sourceMissingRows: subset.reduce((a, x) => a + x.sourceRowCount, 0),
      relationsPresentInLocal: subset.filter(x => target.has(x.k)).length,
      relationsStillMissingInLocal: subset.filter(x => !target.has(x.k)).length,
    }];
  }));
  const missingProjectedRelations = projected.filter(x => !target.has(x.k));
  const missingProjectedColumns = projected.flatMap(x => {
    const columns = target.get(x.k);
    return x.previouslyDroppedSourceColumns
      .filter(name => !columns?.has(name))
      .map(column => ({ schema: x.schema, table: x.table, column }));
  });
  const previousProjectedColumns = projected.reduce(
    (a, x) => a + x.previouslyDroppedSourceColumns.length, 0);
  const report = {
    schemaVersion: 'ops-postgres-provider-local-schema-compatibility-v1',
    target: 'fresh-disposable-supabase-cli-' + local.cliVersion + '-postgres17',
    cliVersion: local.cliVersion,
    sourceBackupRunId: source.sourceBackupRunId,
    sourceRestoreRunId: source.sourceRestoreRunId,
    sourceRestoreArtifactId: source.sourceRestoreArtifactId,
    sourceRestoreMainSha: source.sourceRestoreMainSha,
    postgresMajor: local.postgresMajor,
    sourceMissingCopyBlocks: skipped.length,
    sourceMissingCopyRows: 66,
    sourceProjectedCopyBlocks: projected.length,
    sourceProjectedCopyRows: 27,
    localTargetTableCount: target.size,
    previouslySkippedRelationsPresentInLocal: existing.length,
    previouslySkippedRelationsStillAbsentInLocal: missing.length,
    missingLocalRelationNames: missing.map(x => x.k),
    perProviderSchema: cohorts,
    previouslyProjectedSourceColumnCount: previousProjectedColumns,
    previouslyProjectedSourceColumnsPresentInLocal:
      previousProjectedColumns - missingProjectedColumns.length,
    previouslyProjectedSourceColumnsMissingInLocal: missingProjectedColumns,
    previouslyProjectedRelationsMissingInLocal: missingProjectedRelations.map(x => x.k),
    sourceRowPayloadsRead: false,
    targetRowPayloadsRead: false,
    productionConnectionUsed: false,
    recoveredProductionProviderRows: 0,
    actualFullProviderCopyReplayed: false,
    providerMigrationLedgerRestored: false,
    hostedAuthenticationSessionRecoveryProven: false,
    hostedStorageObjectBytesRecovered: false,
    sameMvccSnapshotProven: false,
    schemaVersionEquivalenceProven: false,
    providerManagedDataFullRestore: false,
    independentPrivacyContinuityProven: false,
    wholeServiceRpoRtoProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
    gate: 'BLOCKED',
    verdict: missing.length === 0 && missingProjectedColumns.length === 0
      ? 'LOCAL_PROVIDER_RELATION_AND_PREVIOUSLY_DROPPED_COLUMN_CANDIDATE_ONLY'
      : 'LOCAL_PROVIDER_SCHEMA_STILL_INCOMPATIBLE__REQUIRES_VERSION_OR_MIGRATION_REVIEW',
  };
  assert.equal(report.drReady, false);
  return report;
}

async function main() {
  assert.equal(process.env.MH_OPS_DISPOSABLE_PG17_ONLY, 'true');
  const args = process.argv.slice(2);
  const get = flag => {
    const pos = args.indexOf(flag);
    assert.ok(pos >= 0 && args[pos + 1] && !args[pos + 1].startsWith('--'));
    return resolve(args[pos + 1]);
  };
  const sourcePath = get('--source');
  const localPath = get('--local');
  const output = get('--output');
  assert.notEqual(sourcePath, output);
  assert.notEqual(localPath, output);
  const privateRoot = resolve(process.env.RUNNER_TEMP ?? '');
  assert.ok(privateRoot && privateRoot !== resolve('.'));
  assert.ok(localPath.startsWith(privateRoot + '/') ||
            localPath.startsWith(privateRoot + '\\'));
  assert.ok(output.startsWith(privateRoot + '/') ||
            output.startsWith(privateRoot + '\\'));
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
  const local = JSON.parse(await readFile(localPath, 'utf8'));
  const report = assessProviderCopyLocalSchema(source, local);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600, flag: 'wx' });
  console.log('PROVIDER_SCHEMA_INVENTORY_DONE existing=' +
    report.previouslySkippedRelationsPresentInLocal +
    ' missing=' + report.previouslySkippedRelationsStillAbsentInLocal +
    ' row_data_read=false drReady=false');
}
if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('HOLD_DISPOSABLE_PROVIDER_SCHEMA_INVENTORY_FAILED');
    process.exitCode = 1;
  });
}
