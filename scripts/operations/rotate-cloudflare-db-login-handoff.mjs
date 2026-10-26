// One-time encrypted handoff for the independent Cloudflare PostgreSQL LOGIN.
// Uses only the approved production Postgres password + session pooler + pinned CA.
// Plaintext passwords/DSNs never appear in source, output, logs or artifacts.
// Only the SCRAM verifier is sent in the password-changing SQL statement.
// Watchtower-Track: ops
import { validateRecipient, prepareRecovery, durableWriteExclusive, mutateAfterDurableHandoff } from './cloudflare-db-recovery-checkpoint.mjs';
import { pathToFileURL } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PROJECT = 'cnsfpcdiyofqvhpcegfc';
const ROLE = 'myeongha_cf_api_login';
const REQUIRED_CONFIRM = 'ROTATE_MYEONGHA_CF_DB_LOGIN_20261026';
let stage = 'START';

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

async function query(sql, env, { read = false } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt'], {
      env, stdio: ['pipe', 'pipe', 'pipe'], timeout: 25000, windowsHide: true,
    });
    let output = '';
    let failed = false;
    let stderr = '';
    proc.on('error', () => { failed = true; });
    proc.stdout.on('data', chunk => {
      if (read && output.length < 256) output += String(chunk).slice(0, 256);
    });
    // Never log stderr: the database transport may mention hosts or credentials.
    proc.stderr.on('data', chunk => { if (stderr.length < 4096) stderr += String(chunk).slice(0,4096); });
    proc.stdin.on('error', () => {});
    proc.stdin.end(sql + '\n');
    proc.on('close', code => {
      if (failed || code !== 0) reject(new Error(/password authentication failed|sasl.*authentication/i.test(stderr) ? 'DB_PASSWORD_AUTH_FAILED' : /certificate|root cert|ssl/i.test(stderr) ? 'DB_TLS_PEER_FAILED' : /permission denied/i.test(stderr) ? 'DB_PERMISSION_FAILED' : 'PostgreSQL protected command failed'));
      else resolve(read ? output.trim() : '');
    });
  });
}

async function main() {
  ensure(process.env.CONFIRM === REQUIRED_CONFIRM, 'Invalid operator confirmation');
  ensure(process.env.GITHUB_REF === 'refs/heads/main', 'Not a main-branch operation');
  ensure(process.env.GITHUB_RUN_ATTEMPT === '1', 'Do not retry an uncertain rotation');
  ensure(typeof process.env.SUPABASE_DB_PASSWORD === 'string' &&
    process.env.SUPABASE_DB_PASSWORD.length >= 8, 'Production DB owner password missing');
  ensure(typeof process.env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM === 'string' &&
    process.env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM.includes('BEGIN CERTIFICATE'),
    'Production pinned root CA missing');
  const host = process.env.SUPABASE_PRODUCTION_SESSION_POOLER_HOST;
  ensure(typeof host === 'string' &&
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$/.test(host),
    'Production session pooler host rejected');
  ensure(typeof process.env.HANDOFF_OUTPUT === 'string' &&
    process.env.HANDOFF_OUTPUT.endsWith('.bin'), 'Encrypted handoff path not configured');

  validateRecipient(process.env.HANDOFF_RECIPIENT_DER_B64, process.env.HANDOFF_RECIPIENT_PROOF);
  ensure(process.env.HANDOFF_ARTIFACT_MODULE, 'Durable artifact client required');
  const tempRoot = await mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'cf-db-ca-'));
  const certPath = path.join(tempRoot, 'root.pem');
  try {
    await writeFile(certPath, process.env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM,
      { flag: 'wx', mode: 0o600 });
    const baseEnv = {
      ...process.env, PGHOST: host, PGPORT: '5432', PGDATABASE: 'postgres',
      PGUSER: 'postgres.' + PROJECT, PGPASSWORD: process.env.SUPABASE_DB_PASSWORD,
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: certPath, PGCONNECT_TIMEOUT: '12',
    };

    stage = 'OWNER_CONNECTION_AND_ROLE_PREFLIGHT';
    const preflight = await query(`select case when
      exists(select 1 from pg_roles where rolname='myeongha_cf_api_login'
        and rolcanlogin and not rolbypassrls and not rolsuper
        and not rolcreaterole and not rolcreatedb and rolconnlimit=5
        and rolvaliduntil > now()
        and not exists(select 1 from pg_class where relowner=pg_roles.oid)
        and not exists(select 1 from pg_proc where proowner=pg_roles.oid)
        and not exists(select 1 from pg_namespace where nspowner=pg_roles.oid)
        and not exists(select 1 from pg_stat_activity where usename='myeongha_cf_api_login' and state='active'))
      and pg_has_role('myeongha_cf_api_login','myeongha_api_executor','MEMBER')
      and exists(select 1 from pg_roles where rolname='myeongha_api_executor'
        and not rolcanlogin and not rolbypassrls)
      then 'PASS' else 'FAIL' end;`, baseEnv, { read: true });
    ensure(preflight === 'PASS', 'Dedicated role authority preflight failed');

    stage = 'STAGE_ENCRYPTED_HANDOFF';
    const candidate = await prepareRecovery({
      key: process.env.HANDOFF_RECIPIENT_DER_B64,
      signature: process.env.HANDOFF_RECIPIENT_PROOF,
      filename: process.env.HANDOFF_OUTPUT,
    });
    const { password } = candidate;
    // The remote upload must finish BEFORE ALTER ROLE. An always() upload
    // after a failed mutation cannot protect against runner loss/cancellation.
    stage = 'UPLOAD_RECOVERY_BEFORE_MUTATION';
    const artifactModule = await import(pathToFileURL(process.env.HANDOFF_ARTIFACT_MODULE).href);
    const client = new artifactModule.DefaultArtifactClient();
    await mutateAfterDurableHandoff({ candidate,
      publish: () => client.uploadArtifact('cloudflare-db-encrypted-handoff-' + process.env.GITHUB_RUN_ID,
        [process.env.HANDOFF_OUTPUT], path.dirname(process.env.HANDOFF_OUTPUT), { retentionDays: 1 }),
      checkpoint: data => durableWriteExclusive(process.env.HANDOFF_OUTPUT + '.checkpoint.json', JSON.stringify(data)),
      mutate: async verifier => {
        console.log('cloudflare_db_rotation=RECOVERY_ARTIFACT_DURABLE_BEFORE_MUTATION');
        stage = 'ALTER_DEDICATED_ROLE_PASSWORD';
        return query("ALTER ROLE " + ROLE + " WITH PASSWORD '" + verifier + "';", baseEnv);
      },
    });

    // Verify the new isolated login over full peer-verified TLS and target
    // transaction port. The encrypted artifact already exists durably.
    stage = 'VERIFY_DEDICATED_LOGIN';
    // Supavisor Shared Pooler may briefly cache the old role verifier.
    // Do not rotate again; allow one bounded reconnect after cache settling.
    await new Promise(resolve => setTimeout(resolve, 15_000));
    let verified = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 10_000));
      }
      try {
        const check = await query('select current_user;', {
          ...baseEnv, PGPORT: '6543', PGUSER: ROLE + '.' + PROJECT,
          PGPASSWORD: password,
        }, { read: true });
        if (check === ROLE) {
          verified = true;
          break;
        }
      } catch {
        // The encrypted handoff is already stored; fail closed after two
        // bounded checks. Never print pooler responses or login credentials.
      }
    }
    ensure(verified, 'Dedicated login verification failed');

    stage = 'COMPLETE';
    console.log('cloudflare_db_rotation=ROTATED_AND_LOGIN_VERIFIED_ENCRYPTED_HANDOFF_READY');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  const known = [
    'Invalid operator confirmation', 'Not a main-branch operation',
    'Do not retry an uncertain rotation', 'Production DB owner password missing',
    'Production pinned root CA missing', 'Production session pooler host rejected',
    'Encrypted handoff path not configured', 'Recipient key rejected',
    'Dedicated role authority preflight failed', 'Generated password format failure',
    'Ciphertext too short', 'Password verifier format invalid',
    'Dedicated login verification failed', 'PostgreSQL protected command failed',
    'DB_PASSWORD_AUTH_FAILED', 'DB_TLS_PEER_FAILED', 'DB_PERMISSION_FAILED',
    'Durable artifact client required', 'Durable handoff upload failed',
    'RECIPIENT_PROOF_REJECTED', 'CHECKPOINT_READBACK_FAILED',
  ];
  // Fixed stage marker contains no SQL text or runtime data.
  const knownStages = new Set([
    'START', 'OWNER_CONNECTION_AND_ROLE_PREFLIGHT',
    'STAGE_ENCRYPTED_HANDOFF', 'UPLOAD_RECOVERY_BEFORE_MUTATION', 'ALTER_DEDICATED_ROLE_PASSWORD',
    'VERIFY_DEDICATED_LOGIN', 'COMPLETE',
  ]);
  console.error('cloudflare_db_rotation=FAILED_STAGE_' +
    (knownStages.has(stage) ? stage : 'UNKNOWN') + ': ' +
    (known.includes(message) ? message : 'Encrypted rotation operation failed'));
  process.exitCode = 1;
}
