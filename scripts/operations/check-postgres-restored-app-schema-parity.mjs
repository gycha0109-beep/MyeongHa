// Phase 8-A: current Production app catalog vs isolated restored PG17 catalog.
// Metadata digests only; no Production writes, raw SQL bodies, or personal data.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const schemaVersion = 'ops-postgres-application-schema-fingerprint-v1';
const migrationFragment = [
  "'migrationCatalog',pg_catalog.jsonb_build_object(",
  "   'totalVersions',(SELECT count(*) FROM supabase_migrations.schema_migrations),",
  "   'latestVersion',(SELECT max(version) FROM supabase_migrations.schema_migrations)",
  " )",
].join('\n');

export function buildRestoredReadOnlyQuery(sourceQuery) {
  assert.match(sourceQuery, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(sourceQuery, /ROLLBACK;\s*$/);
  assert.equal(sourceQuery.split(migrationFragment).length, 2,
    'Reviewed source SQL migration clause changed; do not infer parity');
  // The portable backup excludes the Supabase-managed migration ledger.
  // Only remove the direct provider ledger dependency, never fabricate rows.
  return sourceQuery.replace(migrationFragment, [
    "'migrationCatalog',pg_catalog.jsonb_build_object(",
    "   'totalVersions',null,",
    "   'latestVersion',null",
    " )",
  ].join('\n'));
}

const kinds = {
  schemas: {
    identity: row => row.schema_name,
    fields: ['owner_name', 'acl_sha256'],
  },
  tables: {
    identity: row => row.schema_name + '.' + row.table_name,
    fields: [
      'owner_name', 'rls_enabled', 'rls_forced', 'column_count', 'index_count',
      'user_trigger_count', 'constraint_count', 'policy_count', 'structural_sha256',
    ],
  },
  functions: {
    identity: row => row.schema_name + '.' + row.function_name +
      '(' + row.identity_arguments + ')',
    fields: [
      'owner_name', 'security_definer', 'volatility', 'function_config',
      'full_definition_sha256', 'acl_sha256',
    ],
  },
};

function indexed(rows, kind, definition) {
  assert.ok(Array.isArray(rows), kind + ' must be an array');
  const map = new Map();
  for (const item of rows) {
    const key = definition.identity(item);
    assert.ok(typeof key === 'string' && key.length > 0);
    assert.ok(!map.has(key), 'Duplicate ' + kind + ' identity: ' + key);
    map.set(key, item);
  }
  return map;
}

export function compareApplicationCatalog(source, restored, backupFrontier) {
  assert.equal(source.schemaVersion, schemaVersion);
  assert.equal(restored.schemaVersion, schemaVersion);
  assert.equal(source.transactionReadOnly, 'on');
  assert.equal(restored.transactionReadOnly, 'on');
  assert.match(source.postgresqlVersion, /^17\./);
  assert.match(restored.postgresVersion, /^17\./);
  assert.ok(source.migrationCatalog?.latestVersion);
  assert.ok(Number.isInteger(source.migrationCatalog?.totalVersions));
  assert.equal(restored.migrationCatalog?.latestVersion, null,
    'Do not claim a restored Supabase migration ledger');
  assert.equal(restored.migrationCatalog?.totalVersions, null);
  const migrationFrontierAligned =
    String(source.migrationCatalog.latestVersion) === String(backupFrontier);
  const byType = {};
  for (const [kind, definition] of Object.entries(kinds)) {
    const before = indexed(source[kind], kind, definition);
    const after = indexed(restored[kind], kind, definition);
    const missing = [], additional = [], changed = [];
    for (const [identity, value] of before) {
      const matched = after.get(identity);
      if (!matched) {
        missing.push(identity);
        continue;
      }
      const differingFields = definition.fields.filter(field =>
        JSON.stringify(value[field]) !== JSON.stringify(matched[field]));
      if (differingFields.length) changed.push({ object: identity, differingFields });
    }
    for (const identity of after.keys()) {
      if (!before.has(identity)) additional.push(identity);
    }
    byType[kind] = {
      baselineCount: before.size,
      restoredCount: after.size,
      missing: missing.sort(),
      additional: additional.sort(),
      changed: changed.sort((a, b) => a.object.localeCompare(b.object)),
      matchingCount: before.size - missing.length - changed.length,
    };
  }
  const versionEqual = source.postgresqlVersion === restored.postgresVersion;
  const scopeMatched = Object.values(byType).every(t =>
    !t.missing.length && !t.additional.length && !t.changed.length);
  const verifiedApplicationScopeEquivalence =
    migrationFrontierAligned && versionEqual && scopeMatched;
  return {
    schemaVersion: 'ops-postgres-restored-app-catalog-comparison-v1',
    sourceObservationDateKst: source.observedKstDate,
    sourceMigrationFrontier: String(source.migrationCatalog.latestVersion),
    isolatedBackupMigrationFrontier: String(backupFrontier),
    sourceMigrationCatalogVersionCount: source.migrationCatalog.totalVersions,
    migrationFrontierAligned,
    postgresVersionEqual: versionEqual,
    // The 2026-11-07 reference is a calendar-day-only catalog observation,
    // not an immutable catalog captured inside the 2026-11-06T23:09:47Z
    // encrypted archive transaction. Same migration frontier is insufficient:
    // later out-of-band DDL, restore projection, and replay grantor differences
    // cannot be attributed from this report alone. Require a new source-bound
    // catalog witness before making any causal restore-fidelity claim.
    sourceCatalogBoundToBackupSnapshot: false,
    restoreMismatchRootCauseProven: false,
    sourceCatalogProvenanceHold:
      'SOURCE_OBSERVATION_DATE_ONLY_NO_BACKUP_SNAPSHOT_WITNESS',
    sourcePostgresVersion: source.postgresqlVersion,
    restoredPostgresVersion: restored.postgresVersion,
    comparedScope: source.coverage,
    types: byType,
    applicationScopeVerdict: !migrationFrontierAligned
      ? 'HOLD_SOURCE_BACKUP_FRONTIER_MISMATCH'
      : (!versionEqual || !scopeMatched)
        ? 'HOLD_APPLICATION_SCHEMA_PARITY_MISMATCH'
        : 'MATCH_APPLICATION_CATALOG_ONLY',
    verifiedApplicationScopeEquivalence,
    // Source snapshot and portable archive do NOT cover all managed schemas,
    // role memberships, provider migration ledger, or Hosted Auth/Storage.
    verifiedFullSchemaCatalogEquivalence: false,
    fullSupabaseMigrationLedgerRestored: false,
    providerManagedDataFullRestore: false,
    hostedAuthStorageEquivalent: false,
    roleMembershipParityProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    assert.ok(argv[i]?.startsWith('--') && argv[i + 1], 'Invalid CLI arguments');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  for (const key of ['source', 'query', 'restore-evidence', 'output']) {
    assert.ok(result[key], 'Missing --' + key);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = JSON.parse(await readFile(args.source, 'utf8'));
  const restoreEvidence = JSON.parse(await readFile(args['restore-evidence'], 'utf8'));
  assert.ok(restoreEvidence.backup_migration_frontier,
    'Restore evidence missing backup migration frontier');
  const query = buildRestoredReadOnlyQuery(await readFile(args.query, 'utf8'));
  const proc = spawnSync('psql',
    ['-X', '-q', '-A', '-t', '--set', 'ON_ERROR_STOP=1', '--file', '-'], {
      input: query,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
  if (proc.error || proc.status !== 0) {
    throw new Error('Isolated read-only catalog query failed: ' +
      (proc.error?.message || proc.stderr?.slice(0, 1000) || proc.status));
  }
  const restored = JSON.parse(proc.stdout.trim());
  const report = compareApplicationCatalog(
    source, restored, restoreEvidence.backup_migration_frontier);
  await writeFile(args.output, JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 });
  const totals = Object.entries(report.types).map(([kind, value]) =>
    kind + '=' + value.matchingCount + '/' + value.baselineCount).join(', ');
  console.log('Phase 8-A catalog: ' + report.applicationScopeVerdict +
    ' (' + totals + '); DR serving BLOCKED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error('Phase 8-A restored catalog comparison error: ' + error.message);
    process.exitCode = 1;
  });
}
