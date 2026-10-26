// One-time encrypted handoff for the independent Cloudflare PostgreSQL LOGIN.
// Uses only the approved production Postgres password + session pooler + pinned CA.
// Secrets never appear in source, output, GitHub logs, SQL text, or the artifact.
// Watchtower-Track: ops
import {
  randomBytes, createPublicKey, publicEncrypt, constants,
  pbkdf2Sync, createHmac, createHash,
} from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PROJECT = 'cnsfpcdiyofqvhpcegfc';
const ROLE = 'myeongha_cf_api_login';
const PUB_DER_B64 = 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAxjfAtf/z/OaD32OLoNfv23JsUDEHCtyXIXXyljXpT5gF2j0k0LuMamcs5y+rS03LFk+QDCvlIAAC+UQZOu5kMt0H36G+3Ok5vnKVC3F/RK5sqNTGnJObNQtxeS9OWq757CSQV9lUxXR5Cm6I0PXUq3w1LkHtf4xYhWKUOdaU1q9CJaym1AC32G53hfhIldkEvQI1BTPEmpdV38LZpMqLMzHHYoMASRVcYnvYlVNp4gBGimhB4Ub/oQvhWJgB9stdriJPOkt8SNCVdJBqv48W8wvNAaNT7s5OUGbpFCyV4/k5cFRlED9u2/85zoiSAoiX2gWI2bmes4KQeYEfIihreHsQGueCUEOyTtimylpYtImBsq6wpa218Yh0YKWdRMS0hTfjy1Mulp9QeyY2TEfu95Pin5dAu3tzsvxK7+tlKd6jMBBwT6IuLvrlabkrBioazcXYZrXP0ZBtFvpcab1j4IfGJFXmQ/FOR0E/vbND4XBdCkMaTGbtqrkiUm5Lxk1XAgMBAAE=';
const REQUIRED_CONFIRM = 'ROTATE_MYEONGHA_CF_DB_LOGIN_20261026';
let stage = 'START';

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function scramVerifier(password) {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
  const stored = createHash('sha256')
    .update(createHmac('sha256', salted).update('Client Key').digest()).digest();
  const server = createHmac('sha256', salted).update('Server Key').digest();
  return 'SCRAM-SHA-256$4096:' + salt.toString('base64') + '$' +
    stored.toString('base64') + ':' + server.toString('base64');
}

async function query(sql, env, { read = false } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt'], {
      env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let failed = false;
    proc.on('error', () => { failed = true; });
    proc.stdout.on('data', chunk => {
      if (read && output.length < 256) output += String(chunk).slice(0, 256);
    });
    // Never log stderr: the database transport may mention hosts or credentials.
    proc.stderr.on('data', () => {});
    proc.stdin.on('error', () => {});
    proc.stdin.end(sql + '\n');
    proc.on('close', code => {
      if (failed || code !== 0) reject(new Error('PostgreSQL protected command failed'));
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

  const recipient = createPublicKey({
    key: Buffer.from(PUB_DER_B64, 'base64'), format: 'der', type: 'spki',
  });
  ensure(recipient.asymmetricKeyType === 'rsa' &&
    recipient.asymmetricKeyDetails?.modulusLength >= 3072, 'Recipient key rejected');

  const tempRoot = await mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'cf-db-ca-'));
  const certPath = path.join(tempRoot, 'root.pem');
  try {
    await writeFile(certPath, process.env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM,
      { flag: 'wx', mode: 0o600 });
    const baseEnv = {
      ...process.env, PGHOST: host, PGPORT: '5432', PGDATABASE: 'postgres',
      PGUSER: 'postgres.' + PROJECT, PGPASSWORD: process.env.SUPABASE_DB_PASSWORD,
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: certPath,
    };

    stage = 'OWNER_CONNECTION_AND_ROLE_PREFLIGHT';
    const preflight = await query(`select case when
      exists(select 1 from pg_roles where rolname='myeongha_cf_api_login'
        and rolcanlogin and not rolbypassrls and not rolsuper
        and not rolcreaterole and not rolcreatedb)
      and pg_has_role('myeongha_cf_api_login','myeongha_api_executor','MEMBER')
      and exists(select 1 from pg_roles where rolname='myeongha_api_executor'
        and not rolcanlogin and not rolbypassrls)
      then 'PASS' else 'FAIL' end;`, baseEnv, { read: true });
    ensure(preflight === 'PASS', 'Dedicated role authority preflight failed');

    const password = randomBytes(48).toString('hex');
    ensure(/^[a-f0-9]{96}$/.test(password), 'Generated password format failure');
    const ciphertext = publicEncrypt({
      key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    }, Buffer.from(password, 'utf8'));
    ensure(ciphertext.length >= 384, 'Ciphertext too short');

    // Never send plaintext password through PostgreSQL protocol logs.
    const verifier = scramVerifier(password);
    ensure(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(verifier),
      'Password verifier format invalid');
    // Preserve only the recipient-encrypted credential before any mutation.
    // This ensures an operator can reconcile an uncertain DB write or pooler check.
    stage = 'STAGE_ENCRYPTED_HANDOFF';
    await writeFile(process.env.HANDOFF_OUTPUT, ciphertext,
      { flag: 'wx', mode: 0o600 });

    stage = 'ALTER_DEDICATED_ROLE_PASSWORD';
    await query("ALTER ROLE " + ROLE + " WITH PASSWORD '" + verifier + "';", baseEnv);

    // Verify the new isolated login over full peer-verified TLS and target
    // transaction port before sending any credential to an encrypted artifact.
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
  ];
  // Fixed stage marker contains no SQL text or runtime data.
  const knownStages = new Set([
    'START', 'OWNER_CONNECTION_AND_ROLE_PREFLIGHT',
    'STAGE_ENCRYPTED_HANDOFF', 'ALTER_DEDICATED_ROLE_PASSWORD',
    'VERIFY_DEDICATED_LOGIN', 'COMPLETE',
  ]);
  console.error('cloudflare_db_rotation=FAILED_STAGE_' +
    (knownStages.has(stage) ? stage : 'UNKNOWN') + ': ' +
    (known.includes(message) ? message : 'Encrypted rotation operation failed'));
  process.exitCode = 1;
}
