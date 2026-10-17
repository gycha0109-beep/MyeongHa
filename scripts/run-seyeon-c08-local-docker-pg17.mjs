#!/usr/bin/env node
// Local-only, disposable PostgreSQL 17 census acceptance bootstrap.
// NO ports, production URLs, credentials, live models, Docker volumes or deployments.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = 'myeongha-c08-local-' + randomBytes(5).toString('hex');
const database = 'myeongha_c08_local_case_1';
const image = 'postgres:17.6';

function run(args, opts = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8', timeout: opts.timeout ?? 900_000,
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--disposable-only') {
    throw Error('HOLD_C08_DOCKER: pass --disposable-only explicitly. Never use a production database.');
  }
  // This container has NO TCP network and NO persistent writable volume.
  // Only the repository's source tree is mounted, READ ONLY.
  const password = randomBytes(24).toString('hex');
  let started = false;
  try {
    run(['run', '-d', '--rm', '--network', 'none', '--name', name,
      '--mount', 'type=bind,source=' + root + ',target=/repo,readonly',
      '--workdir', '/repo', '--env', 'POSTGRES_PASSWORD=' + password,
      image]);
    started = true;
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      try {
        run(['exec', '--user', 'postgres', name, 'pg_isready', '-U', 'postgres']);
        ready = true;
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (!ready) throw Error('HOLD_C08_DOCKER: PostgreSQL did not become ready.');
    run(['exec', '--user', 'postgres', name, 'createdb', '-U', 'postgres', database]);
    const version = run(['exec', '--user', 'postgres', '--env', 'PGDATABASE=' + database,
      name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', 'show server_version_num;']).trim();
    if (!/^17\d{4}$/.test(version)) {
      throw Error('HOLD_C08_DOCKER: PostgreSQL 17 is required, found ' + version);
    }
    process.stdout.write('C08_DOCKER_ISOLATED_PG17 ' + version + '\n');
    // Applies ONLY reviewed migrations to a newly created scratch database.
    // This never forwards anything to the user's localhost/host network.
    // Windows Git (core.autocrlf=true) can materialize CRLF even when
    // committed scripts use LF. Bash inside Linux reads the trailing CR as
    // part of "pipefail", causing an immediate syntax failure.
    // Do NOT edit the caller's checkout or the read-only /repo bind mount:
    // copy just the fixture scripts into disposable container storage,
    // normalize ALL nested *.sh dependencies, then run from there.
    const scratch = '/tmp/myeongha-c08-case';
    const prepareAndRun = [
      'set -euo pipefail',
      'mkdir -p ' + scratch + '/test',
      'cp -R /repo/test/db ' + scratch + '/test/db',
      'ln -s /repo/supabase ' + scratch + '/supabase',
      'find ' + scratch + '/test/db -type f -name "*.sh" -exec sed -i "s/\\r$//" {} +',
      'cd ' + scratch,
      'printf "C08_DOCKER_SHELL_LINE_ENDINGS_NORMALIZED\\n"',
      'bash test/db/run_ci_case.sh seyeon-c08-first-turn-local-pg17',
    ].join('\n');
    run(['exec', '--user', 'postgres', '--workdir', '/repo',
      '--env', 'PGUSER=postgres',
      '--env', 'PGDATABASE=' + database,
      name, 'bash', '-c', prepareAndRun],
    { stdio: 'inherit', timeout: 1_800_000 });
    process.stdout.write('PASS_C08_DOCKER_LOCAL_PG17_READONLY_CENSUS_SMOKE\n');
  } finally {
    if (started) {
      try { run(['rm', '-f', name]); }
      catch (error) { process.stderr.write('HOLD_C08_DOCKER_CLEANUP_FAILED: ' + name + '\n'); throw error; }
    }
  }
}
await main().catch(error => {
  process.stderr.write('HOLD_C08_DOCKER_LOCAL_PG17: ' + error.message + '\n');
  process.exitCode = 1;
});
