// Disposable PostgreSQL17 role-edge proof. Synthetic-only; no Production data.
// Use --docker to execute the actual isolated container test.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { prepareIsolatedExternalRoleReplay } from
  './operations/prepare-isolated-postgres-external-role-replay.mjs';

const roles = Array.from({ length: 43 },
  (_, i) => 'myeongha_synthetic_role_' + String(i).padStart(3, '0'));
const edges = roles.map(role => ({
  granted_role: role,
  member_role: 'postgres',
  grantor_name: 'supabase_admin',
  admin_option: true,
  inherit_option: false,
  set_option: false,
}));
for (let i = 0; i < 5; i++) {
  edges.push({
    granted_role: roles[i],
    member_role: 'postgres',
    grantor_name: 'postgres',
    admin_option: false,
    inherit_option: i < 3,
    set_option: i < 2,
  });
}
const fixture = {
  sourceCatalogProvenance: 'encrypted_backup_bracketed_readonly_v1',
  sourceCatalogBracketStable: true,
  sourceCatalogBoundToBackupSnapshot: false,
  postgresqlVersion: '17.11',
  applicationExternalRoleBoundary: {
    scope: 'myeongha_to_non_myeongha_direct_membership_only_v1',
    providerOwnedOnlyProven: false,
    inheritedEffectiveAccessIncluded: false,
    directMemberships: edges,
  },
};
const { sql, report } = prepareIsolatedExternalRoleReplay(fixture);
assert.equal(report.sourceDirectMembershipCount, 48);
assert.equal(report.distinctSourceApplicationRoles, 43);
assert.equal(report.sourceGrantorCategories.managedAdmin, 43);
assert.equal(report.sourceGrantorCategories.applicationAdminRecipient, 5);
assert.equal(report.sourceAdminTrue, 43);
assert.equal(report.sourceInheritTrue, 3);
assert.equal(report.sourceSetTrue, 2);
assert.equal(report.drReady, false);
assert.equal(report.targetOptionAndGrantorParityProven, false);
assert.equal(sql.match(/^GRANT /gmu)?.length, 48);
assert.ok(sql.indexOf('GRANTED BY "supabase_admin"') <
  sql.indexOf('GRANTED BY "postgres"'));

function rejects(change) {
  const changed = structuredClone(fixture);
  change(changed);
  assert.throws(() => prepareIsolatedExternalRoleReplay(changed));
}
rejects(x => { x.sourceCatalogBracketStable = false; });
rejects(x => { x.sourceCatalogProvenance = 'untrusted'; });
rejects(x => { x.sourceCatalogBoundToBackupSnapshot = true; });
rejects(x => { x.applicationExternalRoleBoundary.directMemberships[0]
  .member_role = 'authenticated'; });
rejects(x => { x.applicationExternalRoleBoundary.directMemberships[0]
  .granted_role = 'supabase_admin'; });
rejects(x => { x.applicationExternalRoleBoundary.directMemberships[0]
  .grantor_name = 'another_grantor'; });
rejects(x => { x.applicationExternalRoleBoundary.directMemberships[0]
  .set_option = 'false'; });
rejects(x => { x.applicationExternalRoleBoundary.directMemberships.push(
  structuredClone(x.applicationExternalRoleBoundary.directMemberships[0])); });
console.log('ISOLATED_ROLE_REPLAY_UNIT_PASS count=48 rawRoleData=false');

if (process.argv.includes('--docker')) {
  // No published ports, no volumes, no host credentials, no local network.
  const name = 'myeongha-role-replay-' + process.pid;
  const run = (args, input) => {
    const proc = spawnSync('docker', args, {
      input, encoding: 'utf8', timeout: 30000,
      windowsHide: true, maxBuffer: 1024 * 1024,
    });
    assert.equal(proc.status, 0, 'Synthetic Docker subprocess failed: ' +
      String(proc.stderr ?? '').slice(0, 400));
    return (proc.stdout ?? '').trim();
  };
  run(['run', '--rm', '-d', '--name', name,
    '--network', 'none', '-e', 'POSTGRES_PASSWORD=disposable-only',
    'public.ecr.aws/supabase/postgres@sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb']);
  try {
    let ready = false;
    for (let i = 0; i < 35; i++) {
      const x = spawnSync('docker',
        ['exec', '-u', 'postgres', name, 'pg_isready', '-U', 'postgres'],
        { encoding: 'utf8', timeout: 9000, windowsHide: true });
      if (x.status === 0) { ready = true; break; }
      await setTimeout(450);
    }
    assert.ok(ready, 'Disposable PostgreSQL never became ready');
    // The Supabase image starts a temporary bootstrap server, then restarts it.
    await setTimeout(2800);
    const psql = (input, user='postgres') =>
      run(['exec', '-i', '-u', 'postgres', name,
        'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], input);
    assert.equal(psql("select rolsuper from pg_roles where rolname='supabase_admin'"), 't');
    psql(roles.map(role => 'CREATE ROLE "' + role +
      '" NOLOGIN NOINHERIT;').join('\n'), 'supabase_admin');
    // An incomplete target must fail atomically, not leave partial grants.
    psql('DROP ROLE "' + roles.at(-1) + '";', 'supabase_admin');
    const rejected = spawnSync('docker', ['exec', '-i', '-u', 'postgres',
      name, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v',
      'ON_ERROR_STOP=1', '-qAt'], {
      input: sql, encoding: 'utf8', windowsHide: true, timeout: 30000,
    });
    assert.notEqual(rejected.status, 0,
      'Incomplete target unexpectedly accepted the role replay');
    const query = `select count(*)::text||'|'||
      count(*) filter(where m.admin_option)::text||'|'||
      count(*) filter(where m.inherit_option)::text||'|'||
      count(*) filter(where m.set_option)::text||'|'||
      count(*) filter(where grantor.rolname='supabase_admin')::text||'|'||
      count(*) filter(where grantor.rolname='postgres')::text
      from pg_auth_members m
      join pg_roles member on member.oid=m.member
      join pg_roles granted on granted.oid=m.roleid
      join pg_roles grantor on grantor.oid=m.grantor
      where member.rolname='postgres'
        and granted.rolname like 'myeongha_synthetic_role_%';`;
    assert.equal(psql(query), '0|0|0|0|0|0',
      'Failed replay partially changed role membership');
    psql('CREATE ROLE "' + roles.at(-1) + '" NOLOGIN NOINHERIT;',
      'supabase_admin');
    psql(sql, 'supabase_admin');
    assert.equal(psql(query), '48|43|3|2|43|5',
      'Restored role grantor/options differ from witness');
    psql(sql, 'supabase_admin');
    assert.equal(psql(query), '48|43|3|2|43|5',
      'Repeat replay duplicated or altered source grants');
    console.log('DOCKER_PG17_ROLE_REPLAY_PASS count=48 options=48 ' +
      'grantors=48 atomic=true idempotent=true ' +
      'providerFullRestoreProven=false drReady=false');
  } finally {
    spawnSync('docker', ['rm', '-f', name],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  }
}
