#!/usr/bin/env node
// Dedicated disposable Compose binding runner. It never accepts an external URL.
// GoTrue, Subject, Nonce and Saju are separate internal-only test peers.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd();
const saju = resolve(process.argv[2] ?? '/no-saju');
const proofServer = join(saju, 'dist', 'source-reading-proof-server.js');
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const ROUTE = '/api/internal/preview/source-readings';
const expected = Object.freeze({
  SAJU_BRIDGE_LOCAL_AUTH_URL: 'http://gotrue:9999',
  SAJU_BRIDGE_LOCAL_SUBJECT_HOST: 'subject-db',
  SAJU_BRIDGE_LOCAL_SUBJECT_DB: 'myeongha_saju_subject_local_verify',
  SAJU_BRIDGE_LOCAL_NONCE_HOST: 'nonce-db',
  SAJU_BRIDGE_LOCAL_NONCE_DB: 'myeongha_saju_nonce_local_verify',
});

function guard() {
  if (process.argv.length !== 3 || saju !== '/saju'
    || process.env.MYEONGHA_DOCKER_SAJU_BINDING !== '1'
    || !existsSync(proofServer) || !existsSync(vitest)
    || Number(process.versions.node.split('.')[0]) !== 24
    || JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name !== 'myeongha'
    || JSON.parse(readFileSync(join(saju, 'package.json'), 'utf8')).name !== 'myeonghwa-saju-engine') {
    throw new Error('Refusing to run outside the disposable Docker Saju binding harness.');
  }
  for (const [key, value] of Object.entries(expected)) {
    if (process.env[key] !== value) throw new Error('Invalid internal Docker peer: ' + key);
  }
  if (process.env.MYEONGHA_DOCKER_SAJU_TLS === '1') {
    for (const name of ['subject', 'nonce', 'admission']) {
      if (!existsSync('/certs/' + name + '/ca.crt')) {
        throw new Error('Independent TLS CA not available: ' + name);
      }
    }
    if (!process.env.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD
      || process.env.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD.length < 40) {
      throw new Error('Admission TLS-only disposable credential missing.');
    }
  }
  if (process.env.MYEONGHA_DOCKER_SAJU_PERMIT === '1') {
    if (process.env.MYEONGHA_DOCKER_SAJU_TLS !== '1'
      || !process.env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD
      || process.env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD.length < 40) {
      throw new Error('Permit suite requires isolated TLS and disposable Admission admin input.');
    }
  }
  for (const key of ['SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD',
    'SAJU_BRIDGE_LOCAL_SUBJECT_LOGIN_PASSWORD', 'SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD']) {
    if (!process.env[key] || process.env[key].length < 40) {
      throw new Error('Disposable DB credentials missing.');
    }
  }
}
async function freePort() {
  const s = createServer();
  await new Promise((ok, fail) => { s.once('error', fail); s.listen(0, '127.0.0.1', ok); });
  const addr = s.address();
  if (!addr || typeof addr === 'string') throw new Error('Loopback port not available.');
  await new Promise(ok => s.close(ok));
  return addr.port;
}
async function run() {
  guard();
  const port = await freePort();
  const bearer = randomBytes(32).toString('base64url');
  const hmacKey = randomBytes(48).toString('base64');
  const identity = {
    SAJU_BRIDGE_DOCKER_SAJU_PORT: String(port),
    SAJU_BRIDGE_DOCKER_SAJU_BEARER: bearer,
    SAJU_BRIDGE_DOCKER_SAJU_HMAC_KEY: hmacKey,
    SAJU_BRIDGE_DOCKER_SAJU_ISSUER: 'saju-docker-local-only',
    SAJU_BRIDGE_DOCKER_SAJU_AUDIENCE: 'myeongha-docker-local-only',
    SAJU_BRIDGE_DOCKER_SAJU_KEY_ID: 'disposable-docker-v1',
  };
  const portable = Object.fromEntries(
    ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
      .filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]),
  );
  const child = spawn(process.execPath, [proofServer], {
    cwd: saju, stdio: 'ignore',
    env: {
      ...portable, NODE_ENV: 'test',
      SAJU_SOURCE_PROOF_STAGING_HOST: '127.0.0.1',
      SAJU_SOURCE_PROOF_STAGING_PORT: String(port),
      SAJU_SOURCE_PROOF_STAGING_SERVICE_BEARER: bearer,
      SAJU_SOURCE_PROOF_STAGING_HMAC_KEY: hmacKey,
      SAJU_SOURCE_PROOF_STAGING_ISSUER: identity.SAJU_BRIDGE_DOCKER_SAJU_ISSUER,
      SAJU_SOURCE_PROOF_STAGING_AUDIENCE: identity.SAJU_BRIDGE_DOCKER_SAJU_AUDIENCE,
      SAJU_SOURCE_PROOF_STAGING_KEY_ID: identity.SAJU_BRIDGE_DOCKER_SAJU_KEY_ID,
      SAJU_SOURCE_PROOF_STAGING_TTL_MS: '60000',
    },
  });
  let exited = false;
  child.once('exit', () => { exited = true; });
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (exited) break;
      try {
        const r = await fetch('http://127.0.0.1:' + port + ROUTE,
          { redirect: 'manual', signal: AbortSignal.timeout(1000) });
        if (r.status === 405) { ready = true; await r.body?.cancel(); break; }
        await r.body?.cancel();
      } catch { /* Listener still starting. */ }
      await sleep(150);
    }
    if (!ready) throw new Error('Actual pinned Saju proof listener not ready.');
    const allow = Object.fromEntries(Object.keys(expected).map(k => [k, process.env[k]]));
    const permitMode = process.env.MYEONGHA_DOCKER_SAJU_PERMIT === '1';
    const testEnv = {
      ...portable, NODE_ENV: 'test', MYEONGHA_DOCKER_SAJU_BINDING: '1',
      ...allow, ...identity,
      ...(process.env.MYEONGHA_DOCKER_SAJU_TLS === '1'
        ? {
          MYEONGHA_DOCKER_SAJU_TLS: '1',
          SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD:
            process.env.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD,
        } : {}),
      SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD: process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD,
      SAJU_BRIDGE_LOCAL_SUBJECT_LOGIN_PASSWORD: process.env.SAJU_BRIDGE_LOCAL_SUBJECT_LOGIN_PASSWORD,
      SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD: process.env.SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD,
      ...(permitMode ? {
        MYEONGHA_DOCKER_SAJU_PERMIT: '1',
        SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD: process.env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD,
      } : {}),
    };
    const test = spawn(process.execPath, [vitest, 'run',
      'test/saju-held-docker-member-birth-nonce.test.ts',
      ...(permitMode ? ['test/saju-held-docker-permit-v2.test.ts'] : [])],
    { cwd: root, env: testEnv, stdio: 'inherit' });
    const result = await new Promise((done, reject) => {
      test.once('error', reject);
      test.once('exit', (code) => done(code ?? 1));
    });
    if (result !== 0) throw new Error('Docker GoTrue → Subject/Birth → Saju HTTP → Nonce binding failed.');
    console.log('[saju-bridge] Real GoTrue→Subject/Birth→Saju HMAC→separate Nonce PG: PASS ('
      + (process.env.MYEONGHA_DOCKER_SAJU_TLS === '1' ? 'synthetic TLS verify-full' : 'synthetic plaintext')
      + ').');
  } finally {
    if (!exited) child.kill('SIGTERM');
    await Promise.race([
      new Promise(ok => { if (exited) ok(); else child.once('exit', ok); }),
      sleep(4000).then(() => { if (!exited) child.kill('SIGKILL'); }),
    ]);
  }
}
run().catch(error => {
  console.error('[saju-bridge] Docker binding BLOCKED:',
    error instanceof Error ? error.message : 'unknown failure');
  process.exitCode = 1;
});
