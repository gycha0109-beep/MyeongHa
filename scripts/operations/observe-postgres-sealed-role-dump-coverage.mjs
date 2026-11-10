// Gate 1 / Phase 8-A: encrypted-source direct role edges vs filtered
// roles.sql. Only sanitized counts are emitted; never raw names or SQL.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const internalRole = /^myeongha_[a-z0-9_]+$/u;
const sourceScope = 'myeongha_to_non_myeongha_direct_membership_only_v1';
const reservedDefinition =
  "reserved_roles='anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin'";

function reservedRecipientMatcher(dumpRunner) {
  assert.equal(dumpRunner.split(reservedDefinition).length, 2,
    'Reviewed roles-only exclusion list changed');
  assert.ok(dumpRunner.includes('s/GRANT \\".*\\" TO \\"($reserved_roles)\\"/-- &/'),
    'Reviewed roles-only grant filter changed');
  return /^(?:anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)$/u;
}

function rolePairsInFilteredSql(sql) {
  const pairs = new Set();
  let observedGrantStatementCount = 0;
  let unparsedGrantStatementCount = 0;
  for (const line of sql.split(/\r?\n/u)) {
    if (!/^\s*GRANT\s/u.test(line)) continue;
    observedGrantStatementCount++;
    // --quote-all-identifiers is mandatory in the governed roles-only dump.
    // Pair presence only: this is NOT grantor/option/effective privilege parity.
    const parsed = line.match(/^\s*GRANT\s+"((?:[^"]|"")*)"\s+TO\s+"((?:[^"]|"")*)"(?:\s+[^;]*)?;\s*$/u);
    if (!parsed) {
      unparsedGrantStatementCount++;
      continue;
    }
    const granted = parsed[1].replaceAll('""', '"');
    const member = parsed[2].replaceAll('""', '"');
    pairs.add(JSON.stringify([granted, member]));
  }
  return { pairs, observedGrantStatementCount, unparsedGrantStatementCount };
}

export function observeSealedRoleDumpCoverage(source, filteredRolesSql, dumpRunner) {
  const reserved = reservedRecipientMatcher(dumpRunner);
  assert.equal(typeof filteredRolesSql, 'string');
  assert.ok(source && typeof source === 'object');
  assert.equal(source.schemaVersion, 'ops-postgres-application-schema-fingerprint-v1');
  assert.equal(source.sourceCatalogProvenance,
    'encrypted_backup_bracketed_readonly_v1');
  assert.equal(source.sourceCatalogBoundToBackupSnapshot, false);
  assert.equal(source.transactionReadOnly, 'on');
  const inventory = source.applicationExternalRoleBoundary;
  const extracted = rolePairsInFilteredSql(filteredRolesSql);
  const base = {
    schemaVersion: 'ops-filtered-role-dump-cross-boundary-coverage-v1',
    sourceWitnessAvailable: inventory !== undefined,
    scope: sourceScope,
    filteredRolesSqlOnly: true,
    sameMvccSnapshotProven: false,
    perGrantorAndOptionsRestoreParityProven: false,
    providerOwnershipProven: false,
    inheritedEffectiveAccessProven: false,
    fullProviderCompatibleRestoreProven: false,
    sourceDirectMembershipCount: null,
    filteredRolesSqlGrantStatementCount: extracted.observedGrantStatementCount,
    filteredRolesSqlUnparsedGrantStatementCount: extracted.unparsedGrantStatementCount,
    sourceRowsWithPairInFilteredSqlCount: null,
    sourceRowsWithoutPairInFilteredSqlCount: null,
    missingPairReservedRecipientCandidateCount: null,
    missingPairOtherRecipientCount: null,
    verdict: 'HOLD_SOURCE_WITNESS_MISSING',
    drReady: false,
    serviceResumptionAllowed: false,
  };
  if (inventory === undefined) return base;
  assert.equal(inventory.scope, sourceScope);
  assert.equal(inventory.providerOwnedOnlyProven, false);
  assert.equal(inventory.inheritedEffectiveAccessIncluded, false);
  assert.ok(Array.isArray(inventory.directMemberships));
  let withPair = 0;
  let withoutPair = 0;
  let reservedMissing = 0;
  let otherMissing = 0;
  const exactRows = new Set();
  for (const edge of inventory.directMemberships) {
    for (const role of [edge.granted_role, edge.member_role, edge.grantor_name]) {
      assert.ok(typeof role === 'string' && role.length > 0 &&
        role.length <= 160 && !/[\r\n\t]/u.test(role),
      'Malformed sealed source role name');
    }
    assert.notEqual(internalRole.test(edge.granted_role),
      internalRole.test(edge.member_role),
    'Sealed role edge does not cross exactly one application boundary');
    for (const flag of ['admin_option', 'inherit_option', 'set_option']) {
      assert.equal(typeof edge[flag], 'boolean', 'Malformed role option');
    }
    const rowKey = JSON.stringify([
      edge.granted_role, edge.member_role, edge.grantor_name,
    ]);
    assert.ok(!exactRows.has(rowKey), 'Duplicate source membership');
    exactRows.add(rowKey);
    const pair = JSON.stringify([edge.granted_role, edge.member_role]);
    if (extracted.pairs.has(pair)) {
      withPair++;
    } else {
      withoutPair++;
      if (reserved.test(edge.member_role)) reservedMissing++;
      else otherMissing++;
    }
  }
  return {
    ...base,
    sourceDirectMembershipCount: inventory.directMemberships.length,
    sourceRowsWithPairInFilteredSqlCount: withPair,
    sourceRowsWithoutPairInFilteredSqlCount: withoutPair,
    missingPairReservedRecipientCandidateCount: reservedMissing,
    missingPairOtherRecipientCount: otherMissing,
    verdict: extracted.unparsedGrantStatementCount
      ? 'HOLD_FILTERED_DUMP_GRANT_GRAMMAR_UNRECOGNIZED'
      : withoutPair
        ? 'HOLD_SOURCE_EXTERNAL_ROLE_GRANT_PAIRS_MISSING_FROM_FILTERED_DUMP'
        : 'OBSERVED_PAIR_PRESENCE_ONLY_NOT_ROLE_PARITY',
  };
}

async function main(args) {
  assert.equal(args.length, 8, 'Expected exactly four named input paths');
  const opts = new Map();
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(['--source', '--roles', '--dump-runner', '--output'].includes(args[i]),
      'Unsupported argument');
    assert.ok(!opts.has(args[i]) && args[i + 1], 'Duplicate or empty argument');
    opts.set(args[i], args[i + 1]);
  }
  assert.equal(opts.size, 4, 'Missing argument');
  const [source, rolesSql, runner] = await Promise.all([
    readFile(opts.get('--source'), 'utf8').then(JSON.parse),
    readFile(opts.get('--roles'), 'utf8'),
    readFile(opts.get('--dump-runner'), 'utf8'),
  ]);
  const report = observeSealedRoleDumpCoverage(source, rolesSql, runner);
  const output = resolve(opts.get('--output'));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log('Gate 1 sealed roles-only dump comparison: ' +
    report.verdict + ' (counts only; DR BLOCKED)');
}

if (process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    // Errors are fixed descriptions, never print raw source membership values.
    console.error('Sealed role-dump coverage failed: ' + error.message);
    process.exitCode = 1;
  });
}
