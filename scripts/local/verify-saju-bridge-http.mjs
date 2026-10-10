#!/usr/bin/env node
// Local-only, two-repository loopback HTTP test. Never accepts a remote origin.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd();
const saju = resolve(process.argv[2] ?? '../Saju');
const expectedScript = join(saju, 'dist', 'source-reading-proof-server.js');
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const FIXED_ROUTE = '/api/internal/preview/source-readings';

function validWorkspace() {
  if (process.argv.length > 3) throw new Error('Only an adjacent local Saju directory is accepted.');
  if (!Number(process.versions.node.split('.')[0]) || Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('Node 24 is required.');
  }
  const own = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const remote = JSON.parse(readFileSync(join(saju, 'package.json'), 'utf8'));
  if (own.name !== 'myeongha' || remote.name !== 'myeonghwa-saju-engine'
      || !existsSync(expectedScript) || !existsSync(vitest)) {
    throw new Error('Build the Saju project and install both repositories before the local test.');
  }
  if (saju === root) throw new Error('A separate Saju checkout is required.');
}

async function freeLoopbackPort() {
  const listener = createServer();
  await new Promise((ok, bad) => {
    listener.once('error', bad);
    listener.listen(0, '127.0.0.1', ok);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Local port unavailable.');
  await new Promise(ok => listener.close(ok));
  return address.port;
}

async function run() {
  validWorkspace();
  const nonceDbEnabled = process.env.MYEONGHA_LOCAL_NONCE_PG_ENABLED === '1';
  // The extra PostgreSQL integration suite is an explicit opt-in and never
  // accepts a remote DB, arbitrary port, or Production runtime configuration.
  if (nonceDbEnabled && (process.env.PGHOST !== '127.0.0.1'
    || process.env.PGPORT !== '5432'
    || process.env.PGDATABASE !== 'myeongha_saju_local_verify'
    || process.env.PGUSER !== 'postgres'
    || !process.env.PGPASSWORD)) {
    throw new Error('Refusing a nonlocal or uninitialized ephemeral PostgreSQL target.');
  }
  const port = await freeLoopbackPort();
  const bearer = randomBytes(32).toString('base64url');
  const hmacKey = randomBytes(48).toString('base64');
  const issuer = 'saju-loopback-check';
  const audience = 'myeongha-loopback-check';
  const keyId = 'loopback-v1';
  // Minimal environment. Do not pass live Supabase, cloud, Saju Production or API secrets.
  const minimal = Object.fromEntries(
    ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP']
      .filter(key => process.env[key] !== undefined)
      .map(key => [key, process.env[key]]),
  );
  const serverEnv = {
    ...minimal, NODE_ENV: 'test',
    SAJU_SOURCE_PROOF_STAGING_HOST: '127.0.0.1',
    SAJU_SOURCE_PROOF_STAGING_PORT: String(port),
    SAJU_SOURCE_PROOF_STAGING_SERVICE_BEARER: bearer,
    SAJU_SOURCE_PROOF_STAGING_HMAC_KEY: hmacKey,
    SAJU_SOURCE_PROOF_STAGING_ISSUER: issuer,
    SAJU_SOURCE_PROOF_STAGING_AUDIENCE: audience,
    SAJU_SOURCE_PROOF_STAGING_KEY_ID: keyId,
    SAJU_SOURCE_PROOF_STAGING_TTL_MS: '60000',
  };
  const child = spawn(process.execPath, [expectedScript], {
    cwd: saju, env: serverEnv, stdio: 'ignore',
  });
  let childExit = false;
  child.once('exit', () => { childExit = true; });
  try {
    const endpoint = 'http://127.0.0.1:' + port + FIXED_ROUTE;
    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      if (childExit) break;
      try {
        const response = await fetch(endpoint, { redirect: 'manual', signal: AbortSignal.timeout(1000) });
        if (response.status === 405) {
          await response.body?.cancel();
          ready = true;
          break;
        }
      } catch {
        // Loopback listener has not started yet.
      }
      await sleep(150);
    }
    if (!ready) throw new Error('Saju localhost source-proof process was not ready.');
    console.log('[saju-bridge] Started real Saju loopback process; testing MyeongHa HTTP and signature paths.');
    const testEnv = {
      ...minimal, NODE_ENV: 'test',
      MYEONGHA_LOCAL_SAJU_PORT: String(port),
      MYEONGHA_LOCAL_SAJU_BEARER: bearer,
      MYEONGHA_LOCAL_SAJU_HMAC_KEY: hmacKey,
      MYEONGHA_LOCAL_SAJU_ISSUER: issuer,
      MYEONGHA_LOCAL_SAJU_AUDIENCE: audience,
      MYEONGHA_LOCAL_SAJU_KEY_ID: keyId,
      ...(nonceDbEnabled ? {
        MYEONGHA_LOCAL_SAJU_NONCE_DB: '1',
        MYEONGHA_LOCAL_SAJU_BIRTH_DB: '1',
        PGHOST: '127.0.0.1',
        PGPORT: '5432',
        PGDATABASE: 'myeongha_saju_local_verify',
        PGUSER: 'postgres',
        PGPASSWORD: process.env.PGPASSWORD,
      } : {}),
    };
    const tests = ['test/saju-held-cross-repo-local-http.test.ts'];
    if (nonceDbEnabled) tests.push('test/saju-held-cross-repo-local-postgres-nonce.test.ts');
    if (nonceDbEnabled) tests.push('test/saju-held-cross-repo-local-postgres-current-birth.test.ts');
    const test = spawn(process.execPath, [vitest, 'run', ...tests], {
      cwd: root, env: testEnv, stdio: 'inherit',
    });
    const code = await new Promise((ok, bad) => {
      test.once('error', bad);
      test.once('exit', (exitCode, signal) => ok(exitCode ?? (signal ? 1 : 1)));
    });
    if (code !== 0) throw new Error('Cross-repository loopback HTTP verification failed.');
    console.log(nonceDbEnabled
      ? '[saju-bridge] Live local HTTP + PostgreSQL nonce claim PASS (NOT staging admission).'
      : '[saju-bridge] Local-only cross-repository HTTP check PASS (not staging admission).');
  } finally {
    if (!childExit) child.kill('SIGTERM');
    await Promise.race([
      new Promise(ok => child.once('exit', ok)),
      sleep(4000).then(() => {
        if (!childExit) child.kill('SIGKILL');
      }),
    ]);
  }
}

run().catch(error => {
  console.error('[saju-bridge] BLOCKED:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
