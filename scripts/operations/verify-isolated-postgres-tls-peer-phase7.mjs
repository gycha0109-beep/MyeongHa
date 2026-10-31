import { execFile as execFileCb } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';

const execFile = promisify(execFileCb);
const pgBin = process.env.PG_BIN_DIR;
const openssl = process.env.OPENSSL_BIN;
if (!pgBin || !openssl) {
  throw Error('PG_BIN_DIR and OPENSSL_BIN are required for isolated TLS verification.');
}
const exe = process.platform === 'win32' ? '.exe' : '';
const login = 'myeongha_phase7_tls_synthetic';
const admin = 'myeongha_phase7_tls_admin';
const directory = await mkdtemp(join(tmpdir(), 'myeongha-phase7-tls-'));
const dbDir = join(directory, 'cluster');
const keyFile = join(directory, 'server.key');
const certFile = join(directory, 'server.crt');
const rogueKey = join(directory, 'untrusted.key');
const rogueCa = join(directory, 'untrusted.crt');
const logFile = join(directory, 'server.log');
let started = false;
let currentPool;
let finished = false;

function assert(condition, message) {
  if (!condition) throw Error(message);
}
async function cmd(binary, args, env = {}) {
  return execFile(binary, args, {
    timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024,
    env: { ...process.env, ...env },
  });
}
async function pg(name, args) {
  return cmd(join(pgBin, name + exe), args, {
    PATH: pgBin + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH ?? ''),
  });
}
async function portOnLoopback() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    listener.once('listening', resolve);
    listener.once('error', reject);
  });
  const a = listener.address();
  if (!a || typeof a === 'string') throw Error('Could not reserve a TCP loopback port');
  await new Promise((resolve, reject) =>
    listener.close(err => err ? reject(err) : resolve()));
  return a.port;
}
async function expectRejected(options, reason, predicate) {
  const pool = new Pool(options);
  currentPool = pool;
  try {
    const err = await pool.query('SELECT 1 AS test').then(() => null, x => x);
    assert(err, reason + ': connection unexpectedly succeeded');
    assert(predicate(err), reason + ': unexpected rejection category ' + String(err.code ?? err.name));
    return err.code ?? err.name;
  } finally {
    await pool.end();
    currentPool = undefined;
  }
}

try {
  await pg('initdb', [
    '-D',dbDir,'-U',admin,'--auth-host=trust','--auth-local=trust',
    '--encoding=UTF8','--no-sync','--no-instructions',
  ]);
  await cmd(openssl, [
    'req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',keyFile,'-out',certFile,'-days','1',
    '-subj','/CN=localhost',
    '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1',
  ]);
  await cmd(openssl, [
    'req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',rogueKey,'-out',rogueCa,'-days','1',
    '-subj','/CN=untrusted.synthetic.test',
  ]);
  const hbaFile = join(dbDir,'pg_hba.conf');
  const existing = await readFile(hbaFile,'utf8');
  const enforced = [
    'hostssl all ' + login + ' 127.0.0.1/32 trust',
    'hostnossl all ' + login + ' 127.0.0.1/32 reject',
  ].join('\n') + '\n';
  await writeFile(hbaFile,enforced + existing,'utf8');

  const port = await portOnLoopback();
  const argumentsForServer = [
    '-h 127.0.0.1', '-p ' + port, '-c ssl=on',
    "-c ssl_cert_file=" + certFile.replaceAll('\\','/'),
    "-c ssl_key_file=" + keyFile.replaceAll('\\','/'),
    '-c listen_addresses=127.0.0.1',
  ].join(' ');
  await pg('pg_ctl',['-D',dbDir,'-l',logFile,'-o',argumentsForServer,'-w','-t','20','start']);
  started = true;
  const adminPool = new Pool({
    host:'127.0.0.1',port,database:'postgres',user:admin,
    ssl:false,max:1,connectionTimeoutMillis:3000,
  });
  currentPool = adminPool;
  await adminPool.query('CREATE ROLE ' + login + ' LOGIN NOSUPERUSER NOBYPASSRLS');
  await adminPool.end();
  currentPool = undefined;

  const ca = await readFile(certFile,'utf8');
  const untrustedCa = await readFile(rogueCa,'utf8');
  const settings = {
    host:'127.0.0.1',port,database:'postgres',user:login,
    max:1,connectionTimeoutMillis:3000,allowExitOnIdle:true,
  };

  const trustedPool = new Pool({ ...settings, ssl:{ ca, rejectUnauthorized:true } });
  currentPool = trustedPool;
  const good = await trustedPool.query(
    'SELECT (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS verified_tls, current_user');
  assert(good.rows[0]?.verified_tls === true, 'Trusted connection was not actually TLS');
  assert(good.rows[0]?.current_user === login, 'Wrong unprivileged login');
  await trustedPool.end();
  currentPool = undefined;

  const wrongCaCode = await expectRejected(
    { ...settings, ssl:{ ca:untrustedCa, rejectUnauthorized:true } },
    'untrusted CA', e => /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/i.test(String(e.code ?? e.message)),
  );
  const wrongNameCode = await expectRejected(
    { ...settings, ssl:{ ca, rejectUnauthorized:true, servername:'incorrect.synthetic.test' } },
    'wrong host name', e => e.code === 'ERR_TLS_CERT_ALTNAME_INVALID',
  );
  const noTlsCode = await expectRejected(
    { ...settings, ssl:false },
    'plaintext downgrade', e => e.code === '28000',
  );

  console.log(JSON.stringify({
    result:'PASS',source:'isolated-postgresql18-127.0.0.1',
    trustedCaAndHostname:true,encryptedSqlConnection:true,
    loginIsNonSuperuser:true,untrustedCaDenied:true,
    hostnameMismatchDenied:true,plaintextDowngradeDenied:true,
    negativeCategories:{ wrongCa:wrongCaCode, wrongHost:wrongNameCode, plaintext:noTlsCode },
    productionTlsCertificateProven:false,
    productionPg17Verified:false,
  }));
  finished = true;
} finally {
  await currentPool?.end().catch(() => undefined);
  if (started) {
    await pg('pg_ctl',['-D',dbDir,'-m','immediate','-w','-t','20','stop'])
      .catch(() => undefined);
  }
  if (!finished) {
    const errorLog = await readFile(logFile,'utf8').catch(() => 'No isolated PostgreSQL startup log');
    console.error('Isolated TLS peer verification failed. Local startup log:',errorLog.slice(-1200));
  }
  await rm(directory,{recursive:true,force:true}).catch(() => undefined);
}
