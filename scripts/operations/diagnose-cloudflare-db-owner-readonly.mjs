// Read-only diagnostic for dedicated Cloudflare DB credential restoration.
// No secret material, server error text, SQL result identities or user data is logged.
// Watchtower-Track: ops
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PROJECT = 'cnsfpcdiyofqvhpcegfc';
const CONFIRM = 'VERIFY_MYEONGHA_CF_DB_OWNER_CONNECTIVITY_20261026';

function result(stage, code) {
  console.log('CLOUDFLARE_DB_READONLY_DIAGNOSTIC_V1 ' + stage + ' ' + code);
}
function classify(stderr) {
  const e = String(stderr).toLowerCase();
  if (/password authentication failed|invalid password|sasl.*authentication/.test(e)) return 'DB_OWNER_PASSWORD_AUTH_FAILED';
  if (/could not translate host name|name or service not known|no such host/.test(e)) return 'DB_OWNER_DNS_FAILED';
  if (/certificate verify failed|certificate.*mismatch|self-signed|root certificate|no certificate/.test(e)) return 'DB_OWNER_TLS_PEER_FAILED';
  if (/connection refused|timeout expired|connection timed out|network is unreachable/.test(e)) return 'DB_OWNER_NETWORK_FAILED';
  if (/permission denied|must be member|insufficient privilege/.test(e)) return 'DB_OWNER_PERMISSION_FAILED';
  if (/role .* does not exist/.test(e)) return 'DB_OWNER_ROLE_MISSING';
  return 'DB_OWNER_PSQL_FAILURE_OTHER';
}

async function run(sql, env) {
  return new Promise(resolve => {
    const child = spawn('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql],
      { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 25_000 });
    let stdout = '', stderr = '', failed = false;
    child.stdout.on('data', chunk => {
      if (stdout.length < 512) stdout += String(chunk).slice(0, 512);
    });
    child.stderr.on('data', chunk => {
      // Private in-memory error classification only; never serialize.
      if (stderr.length < 4096) stderr += String(chunk).slice(0, 4096);
    });
    child.on('error', () => { failed = true; });
    child.on('close', code => resolve({
      ok: !failed && code === 0, value: stdout.trim(),
      category: classify(stderr),
    }));
  });
}

async function main() {
  if (process.env.DIAG_CONFIRM !== CONFIRM ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      process.env.GITHUB_RUN_ATTEMPT !== '1') {
    result('gate', 'REJECTED');
    process.exitCode = 1;
    return;
  }
  const password = process.env.SUPABASE_DB_PASSWORD;
  const hostname = process.env.SUPABASE_PRODUCTION_SESSION_POOLER_HOST;
  const certificate = process.env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM;
  if (typeof password !== 'string' || password.length < 8) {
    result('inputs', 'DB_OWNER_PASSWORD_MISSING'); process.exitCode = 1; return;
  }
  if (typeof hostname !== 'string' ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$/.test(hostname)) {
    result('inputs', 'DB_POOLER_HOST_INVALID'); process.exitCode = 1; return;
  }
  if (typeof certificate !== 'string' ||
      !certificate.includes('-----BEGIN CERTIFICATE-----')) {
    result('inputs', 'DB_TLS_ROOT_MISSING'); process.exitCode = 1; return;
  }
  const directory = await mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'myeongha-db-diagnostic-'));
  try {
    const caPath = path.join(directory, 'root.pem');
    await writeFile(caPath, certificate, { flag: 'wx', mode: 0o600 });
    const env = {
      ...process.env,
      PGHOST: hostname, PGPORT: '5432', PGDATABASE: 'postgres',
      PGUSER: 'postgres.' + PROJECT, PGPASSWORD: password,
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: caPath,
      PGCONNECT_TIMEOUT: '12',
    };
    const probe = await run('select 1;', env);
    if (!probe.ok || probe.value !== '1') {
      result('owner_connect', probe.ok ? 'DB_OWNER_UNEXPECTED_PROBE' : probe.category);
      process.exitCode = 1;
      return;
    }
    result('owner_connect', 'PASS');
    const role = await run(`select case when
      exists(select 1 from pg_roles where rolname='myeongha_cf_api_login'
        and rolcanlogin and not rolbypassrls and not rolsuper
        and not rolcreaterole and not rolcreatedb)
      and pg_has_role('myeongha_cf_api_login','myeongha_api_executor','MEMBER')
      and exists(select 1 from pg_roles where rolname='myeongha_api_executor'
        and not rolcanlogin and not rolbypassrls)
      then 'PASS' else 'FAIL' end;`, env);
    if (!role.ok || role.value !== 'PASS') {
      result('authority', role.ok ? 'DB_DEDICATED_ROLE_POLICY_FAILED' : role.category);
      process.exitCode = 1;
      return;
    }
    result('authority', 'PASS');
    result('final', 'READ_ONLY_PASS_NO_CREDENTIAL_ROTATION');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch(() => {
  result('runtime', 'FAILED_CLOSED');
  process.exitCode = 1;
});
