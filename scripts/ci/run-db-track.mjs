import { execFileSync } from 'node:child_process';
import { getDbSuite } from './db-pr-router.mjs';

const suite = getDbSuite(process.argv[2]);
if (process.env.PGHOST !== 'localhost' || process.env.PGDATABASE !== 'myeongha_test') {
  throw new Error('DB CI runner requires the local myeongha_test service');
}
const version = Number(execFileSync('psql', ['-Atqc', 'show server_version_num'], { encoding: 'utf8' }));
if (Math.floor(version / 10000) !== suite.postgres) throw new Error('DB CI suite PostgreSQL version mismatch');
const readRoles = () => JSON.parse(execFileSync('psql', ['-Atqc', 'select json_agg(rolname) from pg_roles'], { encoding: 'utf8' }));
const serviceRoles = new Set(readRoles());
const failures = [];
for (const [index, caseName] of suite.cases.entries()) {
  // Fresh service-local database per case preserves the previous matrix isolation.
  const database = `myeongha_ci_case_${index}`;
  console.log(`::group::${caseName}`);
  execFileSync('createdb', [database], { stdio: 'inherit' });
  try {
    execFileSync('bash', ['test/db/run_ci_case.sh', caseName], {
      stdio: 'inherit', env: { ...process.env, PGDATABASE: database },
    });
  } catch {
    failures.push(caseName);
  } finally {
    execFileSync('dropdb', ['--if-exists', database], { stdio: 'inherit' });
    // Roles and memberships belong to the cluster, not the database. Remove
    // every case-created role after dropping its DB to preserve matrix parity.
    for (const role of readRoles()) {
      if (serviceRoles.has(role)) continue;
      const identifier = `"${role.replaceAll('"', '""')}"`;
      execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-c', `DROP ROLE ${identifier}`], { stdio: 'inherit' });
    }
    console.log('::endgroup::');
  }
}
if (failures.length) throw new Error(`DB CI cases failed: ${failures.join(', ')}`);
