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

// Collect SQL statements instead of individual lines. Role dumps may contain
// line continuations, multiple grant recipients, or semicolons inside quoted
// identifiers/settings. Unrecognized statements stay HOLD, never silently pass.
function sqlStatements(sql) {
  const statements = [];
  let segment = '';
  let quotedIdentifier = false;
  let singleQuoted = false;
  let lineComment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      if (c === '\n') { lineComment = false; segment += '\n'; }
      continue;
    }
    if (!quotedIdentifier && !singleQuoted && c === '-' && next === '-') {
      lineComment = true; i++; continue;
    }
    if (quotedIdentifier && c === '"' && next === '"') {
      segment += '""'; i++; continue;
    }
    if (singleQuoted && c === "'" && next === "'") {
      segment += "''"; i++; continue;
    }
    if (!singleQuoted && c === '"') quotedIdentifier = !quotedIdentifier;
    else if (!quotedIdentifier && c === "'") singleQuoted = !singleQuoted;
    if (!quotedIdentifier && !singleQuoted && c === ';') {
      if (segment.trim()) statements.push({ sql: segment.trim(), complete: true });
      segment = ''; continue;
    }
    segment += c;
  }
  if (segment.trim()) statements.push({ sql: segment.trim(), complete: false });
  return statements;
}

function parseQuotedRoleList(value) {
  const quotedRole = '"(?:[^"]|"")*"';
  if (!new RegExp('^' + quotedRole + '(?:\\s*,\\s*' + quotedRole + ')*$', 'u')
    .test(value)) return null;
  return [...value.matchAll(/"((?:[^"]|"")*)"/gu)]
    .map(match => match[1].replaceAll('""', '"'));
}

function parseGrantPairStatement(statement) {
  // Only role-membership grants with fully quoted identifiers are supported;
  // object/privilege GRANT, unquoted identifiers, and unknown tails stay HOLD.
  const list = '"(?:[^"]|"")*"(?:\\s*,\\s*"(?:[^"]|"")*")*';
  const match = statement.match(new RegExp(
    '^GRANT\\s+(' + list + ')\\s+TO\\s+(' + list + ')(?:\\s+([\\s\\S]*))?$',
    'iu'));
  if (!match) return null;
  const granted = parseQuotedRoleList(match[1]);
  const members = parseQuotedRoleList(match[2]);
  if (!granted || !members) return null;
  const suffix = (match[3] ?? '').trim();
  if (suffix) {
    const roleOptions = '(?:ADMIN|INHERIT|SET)\\s+(?:TRUE|FALSE)';
    const withOptions = '(?:WITH\\s+(?:' + roleOptions +
      ')(?:\\s*,\\s*' + roleOptions + ')*)';
    const adminOption = 'WITH\\s+ADMIN\\s+OPTION';
    const grantor = 'GRANTED\\s+BY\\s+"(?:[^"]|"")*"';
    const supportedTail = new RegExp('^(?:(?:' + withOptions + '|' +
      adminOption + ')(?:\\s+' + grantor + ')?|' + grantor + ')$', 'iu');
    if (!supportedTail.test(suffix)) return null;
  }
  return granted.flatMap(grant => members.map(member =>
    JSON.stringify([grant, member])));
}

// Only known PostgreSQL object-privilege grammar is excluded from direct
// role-membership matching. Anchor the unquoted privilege list and object
// class: a quoted role named "ON" must never become a false object-grant PASS.
const objectPrivilege = '(?:ALL(?:\\s+PRIVILEGES)?|SELECT|INSERT|UPDATE|' +
  'DELETE|TRUNCATE|REFERENCES|TRIGGER|MAINTAIN|USAGE|CREATE|CONNECT|' +
  'TEMP(?:ORARY)?|EXECUTE)';
const objectClasses = '(?:TABLE|SEQUENCE|SCHEMA|DATABASE|FUNCTION|' +
  'PROCEDURE|ROUTINE|LANGUAGE|TYPE|DOMAIN|TABLESPACE|PARAMETER|' +
  'FOREIGN\\s+(?:DATA\\s+WRAPPER|SERVER)|LARGE\\s+OBJECT|' +
  'ALL\\s+(?:TABLES|SEQUENCES|FUNCTIONS|PROCEDURES|ROUTINES)\\s+IN\\s+SCHEMA)';
const knownObjectPrivilegeGrant = new RegExp(
  '^GRANT\\s+' + objectPrivilege + '(?:\\s*,\\s*' +
  objectPrivilege + ')*\\s+ON\\s+' + objectClasses + '\\b', 'iu');

// Only a fixed category is exported; neither SQL fragments nor role names
// are permitted in this diagnostic. Unknown SQL always retains the HOLD.
function classifyUnparsedGrantShape(sql, complete) {
  if (!complete) return 'unterminated_statement';
  if (knownObjectPrivilegeGrant.test(sql)) return 'object_privilege_grant';
  if (!/\bTO\b/iu.test(sql)) return 'missing_to_clause';
  if (!/^GRANT\s+"/iu.test(sql)) return 'unquoted_or_unexpected_granted_roles';
  if (!/\bTO\s+"/iu.test(sql)) return 'unquoted_or_unexpected_recipient_roles';
  return 'unsupported_role_options_or_other_syntax';
}

function rolePairsInFilteredSql(sql) {
  const pairs = new Set();
  let observedGrantStatementCount = 0;
  let recognizedObjectPrivilegeGrantCount = 0;
  let unparsedGrantStatementCount = 0;
  const unparsedGrantShapeCounts = {};
  for (const candidate of sqlStatements(sql)) {
    if (!/^GRANT\s/iu.test(candidate.sql)) continue;
    observedGrantStatementCount++;
    if (candidate.complete && knownObjectPrivilegeGrant.test(candidate.sql)) {
      recognizedObjectPrivilegeGrantCount++;
      continue;
    }
    const parsed = candidate.complete
      ? parseGrantPairStatement(candidate.sql) : null;
    if (!parsed) {
      unparsedGrantStatementCount++;
      const category = classifyUnparsedGrantShape(
        candidate.sql, candidate.complete);
      unparsedGrantShapeCounts[category] =
        (unparsedGrantShapeCounts[category] ?? 0) + 1;
      continue;
    }
    for (const pair of parsed) pairs.add(pair);
  }
  return { pairs, observedGrantStatementCount,
    recognizedObjectPrivilegeGrantCount, unparsedGrantStatementCount,
    unparsedGrantShapeCounts };
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
    filteredRolesSqlRecognizedObjectPrivilegeGrantCount:
      extracted.recognizedObjectPrivilegeGrantCount,
    filteredRolesSqlUnparsedGrantStatementCount: extracted.unparsedGrantStatementCount,
    filteredRolesSqlUnparsedGrantShapeCounts: extracted.unparsedGrantShapeCounts,
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
