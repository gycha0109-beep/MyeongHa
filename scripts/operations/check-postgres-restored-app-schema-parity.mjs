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

const tableComponentNames = [
  'columns', 'constraints', 'indexes', 'triggers', 'policies', 'acl',
  'reloptions', 'persistence', 'rowSecurityEnabled', 'rowSecurityForced',
];
const digestPattern = /^[0-9a-f]{64}$/;

function assertDigest(value, label) {
  assert.match(value, digestPattern, label + ' requires SHA-256');
}

function componentDifferences(source, restored) {
  const before = source.structural_component_sha256;
  if (before === undefined) return null; // Existing encrypted archives predate facets.
  const after = restored.structural_component_sha256;
  for (const [side, value] of [['source', before], ['restored', after]]) {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value),
      side + ' table component hashes must be a JSON object');
    assert.deepEqual(Object.keys(value).sort(), [...tableComponentNames].sort(),
      side + ' table component hash fields changed');
    for (const key of tableComponentNames) assertDigest(value[key], side + ':' + key);
  }
  const differences = tableComponentNames.filter(key => before[key] !== after[key]);
  assert.equal(differences.length === 0,
    source.structural_sha256 === restored.structural_sha256,
    'Component and aggregate structural digests contradict one another');
  return differences;
}

function aclDifferenceScope(source, restored) {
  const before = source.acl_grant_entries_without_grantor_sha256;
  if (before === undefined) return null; // Older encrypted evidence remains valid.
  const after = restored.acl_grant_entries_without_grantor_sha256;
  assertDigest(before, 'source grant-entry digest');
  assertDigest(after, 'restored grant-entry digest');
  if (source.acl_sha256 === restored.acl_sha256) {
    assert.equal(before, after, 'Same full ACL but different grant-entry digest');
    return 'MATCH';
  }
  return before === after
    ? 'GRANTOR_ATTRIBUTION_ONLY'
    : 'GRANT_ENTRIES_DIFFER';
}

function aclByGranteeDifferences(source, restored) {
  const before = source.acl_by_grantee_privilege_sha256;
  if (before === undefined) return null; // Older sealed archives.
  const after = restored.acl_by_grantee_privilege_sha256;
  for (const [side, map] of [['source', before], ['restored', after]]) {
    assert.ok(map && typeof map === 'object' && !Array.isArray(map),
      side + ' grantee privilege digests must be a JSON object');
    for (const [role, digest] of Object.entries(map)) {
      assert.ok(role.length > 0 && role.length <= 160 &&
        !/[\r\n\t]/u.test(role), side + ' malformed grantee role');
      assertDigest(digest, side + ':' + role);
    }
  }
  const affected = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(role => before[role] !== after[role]).sort();
  if (source.acl_sha256 !== undefined && restored.acl_sha256 !== undefined &&
      source.acl_sha256 === restored.acl_sha256) {
    assert.equal(affected.length, 0,
      'Unchanged full ACL digest contradicts grantee privilege digests');
  }
  if (source.acl_grant_entries_without_grantor_sha256 !== undefined &&
      source.acl_grant_entries_without_grantor_sha256 ===
        restored.acl_grant_entries_without_grantor_sha256) {
    assert.equal(affected.length, 0,
      'Unchanged grant entries contradict grantee privilege digests');
  }
  return affected;
}

function assertUniformFacetCoverage(rows, kind, field) {
  const present = rows.filter(row => row[field] !== undefined).length;
  assert.ok(present === 0 || present === rows.length,
    'Source ' + kind + ' facet digest coverage must be all or none');
  return present === rows.length;
}

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

function sourceCatalogWitness(source) {
  // A backup-run bracket is stronger evidence than a separate date-only
  // observation, but it is NOT a shared PostgreSQL MVCC snapshot.
  if (source.sourceCatalogProvenance === undefined) {
    for (const key of ['sourceCatalogBracketStable', 'sourceCatalogBracketStartUtc',
      'sourceCatalogBracketEndUtc', 'sourceCatalogBoundToBackupSnapshot']) {
      assert.ok(!(key in source), 'Legacy observation has unexpected witness field: ' + key);
    }
    return {
      provenance: 'legacy_date_only_observation',
      hold: 'SOURCE_OBSERVATION_DATE_ONLY_NO_BACKUP_SNAPSHOT_WITNESS',
    };
  }
  assert.equal(source.sourceCatalogProvenance, 'encrypted_backup_bracketed_readonly_v1');
  assert.equal(source.sourceCatalogBracketStable, true);
  assert.equal(source.sourceCatalogBoundToBackupSnapshot, false);
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  assert.match(source.sourceCatalogBracketStartUtc, utc);
  assert.match(source.sourceCatalogBracketEndUtc, utc);
  assert.ok(source.sourceCatalogBracketStartUtc <= source.sourceCatalogBracketEndUtc,
    'Backup witness observation bracket must be ordered');
  return {
    provenance: source.sourceCatalogProvenance,
    hold: 'SOURCE_BACKUP_EXECUTION_BRACKETED_NO_SHARED_MVCC_SNAPSHOT',
  };
}

export function compareApplicationCatalog(source, restored, backupFrontier) {
  const sourceWitness = sourceCatalogWitness(source);
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
  const componentHashEvidence = {
    tableStructure: assertUniformFacetCoverage(source.tables, 'tables',
      'structural_component_sha256'),
    schemaAclGrantEntries: assertUniformFacetCoverage(source.schemas, 'schemas',
      'acl_grant_entries_without_grantor_sha256'),
    routineAclGrantEntries: assertUniformFacetCoverage(source.functions, 'functions',
      'acl_grant_entries_without_grantor_sha256'),
    tableAclByGrantee: assertUniformFacetCoverage(source.tables, 'tables',
      'acl_by_grantee_privilege_sha256'),
    schemaAclByGrantee: assertUniformFacetCoverage(source.schemas, 'schemas',
      'acl_by_grantee_privilege_sha256'),
    routineAclByGrantee: assertUniformFacetCoverage(source.functions, 'functions',
      'acl_by_grantee_privilege_sha256'),
  };
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
      // Validate facet / aggregate consistency even when the aggregate matches.
      const parts = kind === 'tables' ? componentDifferences(value, matched) : null;
      const scope = kind === 'schemas' || kind === 'functions'
        ? aclDifferenceScope(value, matched) : null;
      const roles = aclByGranteeDifferences(value, matched);
      if (roles?.length && kind === 'tables') {
        assert.ok(parts?.includes('acl') && differingFields.includes('structural_sha256'),
          'Changed table grantee privileges lack a table ACL digest difference');
      }
      if (roles?.length && kind !== 'tables') {
        assert.ok(differingFields.includes('acl_sha256'),
          'Changed grantee privileges lack a schema/function ACL difference');
      }
      if (differingFields.length) {
        const detail = { object: identity, differingFields };
        if (parts !== null && differingFields.includes('structural_sha256')) {
          detail.structuralComponentDifferences = parts;
        }
        if (scope !== null && differingFields.includes('acl_sha256')) {
          detail.aclDifferenceScope = scope;
        }
        if (roles !== null && (kind === 'tables' ? parts?.includes('acl') :
          differingFields.includes('acl_sha256'))) {
          // Role identifiers only, never source grant tuples or raw DDL.
          detail.aclAffectedGrantees = roles;
        }
        changed.push(detail);
      }
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
    // A sealed before/after source witness is tied to the backup execution,
    // unlike the legacy date-only reference. Neither shares the pg_dump MVCC
    // snapshot, so later DDL, portable restore losses, or ACL grantor drift
    // cannot be causally attributed from this report alone.
    sourceCatalogBoundToBackupSnapshot: false,
    restoreMismatchRootCauseProven: false,
    sourceCatalogProvenance: sourceWitness.provenance,
    sourceCatalogProvenanceHold: sourceWitness.hold,
    sourcePostgresVersion: source.postgresqlVersion,
    restoredPostgresVersion: restored.postgresVersion,
    comparedScope: source.coverage,
    // New sealed catalogs can locate each structural/ACL facet without
    // disclosing raw definitions, grantors, row payloads or credentials.
    // Old sealed/legacy catalogs have no such evidence: never infer a cause.
    componentHashEvidence,
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
