// Phase 8-A: private, disposable PG17 replay of encrypted source app/external
// direct role memberships. SQL must NEVER be logged or attached as an artifact.
// This is a rehearsal, not Provider/Hosted recovery or same-MVCC parity.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const scope = 'myeongha_to_non_myeongha_direct_membership_only_v1';
const appRole = /^myeongha_[a-z0-9_]+$/u;
const identifier = /^[a-z][a-z0-9_]{0,159}$/u;
const allowedGrantors = new Set(['supabase_admin', 'postgres']);
const expectedMember = 'postgres';

function sqlIdentifier(name) {
  assert.match(name, identifier, 'Unexpected source role name');
  return '"' + name + '"';
}

export function prepareIsolatedExternalRoleReplay(catalog) {
  assert.equal(catalog.sourceCatalogProvenance,
    'encrypted_backup_bracketed_readonly_v1',
    'Require the sealed, integrity-checked backup-run source catalog');
  assert.equal(catalog.sourceCatalogBracketStable, true,
    'Require stable pre/post source witness');
  assert.equal(catalog.sourceCatalogBoundToBackupSnapshot, false,
    'Do not claim a single MVCC snapshot');
  assert.equal(catalog.postgresqlVersion?.startsWith('17.'), true);
  const boundary = catalog.applicationExternalRoleBoundary;
  assert.equal(boundary?.scope, scope);
  assert.equal(boundary.providerOwnedOnlyProven, false);
  assert.equal(boundary.inheritedEffectiveAccessIncluded, false);
  assert.ok(Array.isArray(boundary.directMemberships));
  assert.ok(boundary.directMemberships.length > 0,
    'Empty source role witness is not a replay proof');
  const seen = new Set();
  const edges = boundary.directMemberships.map(edge => {
    assert.match(edge.granted_role, appRole,
      'Do not replay an unreviewed non-application granted role');
    assert.equal(edge.member_role, expectedMember,
      'Only the measured source recipient postgres is supported');
    assert.ok(allowedGrantors.has(edge.grantor_name),
      'Unsupported role membership grantor; fail closed');
    for (const flag of ['admin_option', 'inherit_option', 'set_option']) {
      assert.equal(typeof edge[flag], 'boolean', 'Invalid role option');
    }
    const key = JSON.stringify([edge.granted_role,
      edge.member_role, edge.grantor_name]);
    assert.ok(!seen.has(key), 'Duplicate grantor edge');
    seen.add(key);
    return { ...edge };
  });
  edges.sort((a, b) => {
    const priority = name => name === 'supabase_admin' ? 0 : 1;
    return priority(a.grantor_name) - priority(b.grantor_name) ||
      a.granted_role.localeCompare(b.granted_role) ||
      a.grantor_name.localeCompare(b.grantor_name);
  });
  // A real missing role, invalid grantor, or insufficient ADMIN OPTION will
  // abort the transaction: no fallback role fabrication or privilege widening.
  const sql = [
    'BEGIN;',
    'DO $isolated_pg17$ BEGIN',
    " IF current_setting('server_version_num')::integer < 170000",
    " OR current_setting('server_version_num')::integer >= 180000",
    " OR current_user <> 'supabase_admin'",
    " OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)",
    " THEN RAISE EXCEPTION 'Disposable PG17 superuser requirement not met';",
    ' END IF;',
    'END $isolated_pg17$;',
    ...edges.map(edge =>
      'GRANT ' + sqlIdentifier(edge.granted_role) +
      ' TO ' + sqlIdentifier(edge.member_role) +
      ' WITH ADMIN ' + String(edge.admin_option).toUpperCase() +
      ', INHERIT ' + String(edge.inherit_option).toUpperCase() +
      ', SET ' + String(edge.set_option).toUpperCase() +
      ' GRANTED BY ' + sqlIdentifier(edge.grantor_name) + ';'),
    'COMMIT;',
    '',
  ].join('\n');
  const report = {
    schemaVersion: 'ops-isolated-source-external-role-replay-v1',
    scope,
    target: 'disposable-postgres17-only',
    sourceCatalogBracketStable: true,
    sameMvccSnapshotProven: false,
    sourceDirectMembershipCount: edges.length,
    distinctSourceApplicationRoles: new Set(edges.map(e =>
      e.granted_role)).size,
    sourceGrantorCategories: {
      managedAdmin: edges.filter(e =>
        e.grantor_name === 'supabase_admin').length,
      applicationAdminRecipient: edges.filter(e =>
        e.grantor_name === 'postgres').length,
    },
    sourceAdminTrue: edges.filter(e => e.admin_option).length,
    sourceInheritTrue: edges.filter(e => e.inherit_option).length,
    sourceSetTrue: edges.filter(e => e.set_option).length,
    sourceExternalRecipientCount: 1,
    sqlExportedToArtifact: false,
    targetRoleCreationAllowed: false,
    providerRoleFabricationAllowed: false,
    originalFilteredDumpStillMissingEdges: true,
    actualTargetReplayExecuted: false,
    targetOptionAndGrantorParityProven: false,
    providerFullRestoreProven: false,
    hostedAuthStorageProven: false,
    independentPrivacyContinuityProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
    verdict: 'REHEARSAL_SQL_PREPARED__NOT_HOSTED_ACCEPTANCE',
  };
  return { sql, report };
}

async function main() {
  assert.equal(process.env.MH_OPS_DISPOSABLE_PG17_ONLY, 'true',
    'Disposable-only replay must be explicitly enabled');
  const args = process.argv.slice(2);
  function get(flag) {
    const i = args.indexOf(flag);
    assert.ok(i >= 0 && args[i + 1] && !args[i + 1].startsWith('--'),
      'Missing argument: ' + flag);
    return resolve(args[i + 1]);
  }
  const source = get('--source');
  const output = get('--output');
  const reportPath = get('--report');
  assert.notEqual(output, source);
  assert.notEqual(output, reportPath);
  const privateRoot = resolve(process.env.RUNNER_TEMP ?? '');
  assert.ok(privateRoot && privateRoot !== resolve('.'),
    'RUNNER_TEMP must be an isolated, private directory');
  for (const path of [source, output, reportPath]) {
    assert.ok(path.startsWith(privateRoot + '\\') ||
      path.startsWith(privateRoot + '/'),
    'Source, temporary SQL and report must stay in private runner temp');
  }
  const catalog = JSON.parse(await readFile(source, 'utf8'));
  const { sql, report } = prepareIsolatedExternalRoleReplay(catalog);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, sql, { mode: 0o600, flag: 'wx' });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600, flag: 'wx' });
  console.log('ISOLATED_EXTERNAL_ROLE_REPLAY_PREPARED count=' +
    report.sourceDirectMembershipCount + ' SQL_PRIVATE=true ' +
    'providerFullRestoreProven=false drReady=false');
}

if (process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Deliberately do not echo source, SQL or role names on failure.
    console.error('HOLD_ISOLATED_ROLE_REPLAY_PREPARATION_FAILED');
    process.exitCode = 1;
  });
}
