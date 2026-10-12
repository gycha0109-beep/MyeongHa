#!/usr/bin/env node
// Disposable Windows Docker Desktop / Linux local Phase 1. No operational authority.
// Keep the existing verify-saju-bridge-full.mjs GitHub workflow launcher unchanged.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const compose = fileURLToPath(new URL('./saju-bridge-full.compose.yml', import.meta.url));
const packagePath = fileURLToPath(new URL('../../package.json', import.meta.url));
const project = 'myeongha-saju-full-' + randomBytes(6).toString('hex');
const services = Object.freeze([
  ['auth-db', 'myeongha_saju_gotrue_verify'],
  ['subject-db', 'myeongha_saju_subject_local_verify'],
  ['nonce-db', 'myeongha_saju_nonce_local_verify'],
  ['admission-db', 'myeongha_saju_admission_local_verify'],
]);
const portableKeys = [
  'PATH', 'PATHEXT', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA',
  'HOMEDRIVE', 'HOMEPATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP',
  'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'DOCKER_CONFIG',
  'DOCKER_CONTEXT', 'DOCKER_HOST',
];
const sandboxEnv = Object.fromEntries(portableKeys.filter(k => process.env[k] !== undefined)
  .map(k => [k, process.env[k]]));
for (const key of ['AUTH_DB_PASSWORD', 'SUBJECT_DB_PASSWORD', 'NONCE_DB_PASSWORD',
  'ADMISSION_DB_PASSWORD']) {
  sandboxEnv['SAJU_BRIDGE_LOCAL_' + key] = randomBytes(28).toString('hex');
}
sandboxEnv.SAJU_BRIDGE_LOCAL_JWT_SECRET = randomBytes(48).toString('hex');
sandboxEnv.SAJU_BRIDGE_LOCAL_AUTH_DB_URL = 'postgres://postgres:'
  + sandboxEnv.SAJU_BRIDGE_LOCAL_AUTH_DB_PASSWORD
  + '@auth-db:5432/myeongha_saju_gotrue_verify?sslmode=disable';
sandboxEnv.COMPOSE_IGNORE_ORPHANS = 'false';
sandboxEnv.COMPOSE_PROJECT_NAME = project;

function docker(args, { capture = false, timeout = 240_000 } = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    shell: false,
    env: sandboxEnv,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.code || result.stderr?.trim().slice(0, 320)
      || result.signal || 'exit ' + result.status;
    throw new Error('Docker command failed: ' + detail);
  }
  return result.stdout?.trim() ?? '';
}

function assertLocalEngine() {
  const host = process.env.DOCKER_HOST;
  if (host && !host.startsWith('unix://') && !host.startsWith('npipe://')) {
    throw new Error('A remote Docker daemon is forbidden.');
  }
  const contextHost = docker(['context', 'inspect', '--format',
    '{{.Endpoints.docker.Host}}'], { capture: true, timeout: 15_000 });
  if (!contextHost.startsWith('unix://') && !contextHost.startsWith('npipe://')) {
    throw new Error('Docker context is not a local Unix socket or Windows named pipe.');
  }
  docker(['compose', 'version'], { capture: true, timeout: 15_000 });
  // Context inspection and Compose version work even with a stopped daemon.
  // Validate the actual Engine BEFORE entering the Compose/cleanup lifecycle.
  let engineType;
  try {
    engineType = docker(['info', '--format', '{{.OSType}}'],
      { capture: true, timeout: 15_000 });
  } catch {
    throw new Error(
      'Docker Engine is unreachable. Start Docker Desktop in Linux containers mode '
      + 'and check "docker info". No test resources were created; cleanup is not required.',
    );
  }
  if (engineType !== 'linux') {
    throw new Error(
      'A local Linux Docker Engine is required. Switch Docker Desktop to Linux containers mode. '
      + 'No test resources were created.',
    );
  }
}

const base = ['compose', '--project-name', project, '-f', compose];
function composed(...args) { return docker([...base, ...args]); }

function remaining(kind) {
  const args = kind === 'container' ? ['ps', '--all', '--quiet']
    : kind === 'volume' ? ['volume', 'ls', '--quiet']
      : ['network', 'ls', '--quiet'];
  return docker([...args, '--filter', 'label=com.docker.compose.project=' + project],
    { capture: true, timeout: 20_000 });
}

function main() {
  if (process.argv.length !== 2) throw new Error('No URL, user data, or CLI arguments are accepted.');
  if (JSON.parse(readFileSync(packagePath, 'utf8')).name !== 'myeongha') {
    throw new Error('Expected MyeongHa repository checkout.');
  }
  assertLocalEngine();
  console.log('[saju-bridge] Disposable Docker project: ' + project);
  console.log('[saju-bridge] Local Auth + four PostgreSQL clusters; no exposed host ports.');
  let failure = null;
  try {
    composed('config', '--quiet');
    composed('up', '--detach', '--wait', '--wait-timeout', '150',
      ...services.map(([service]) => service));
    for (const [service, database] of services) {
      const output = docker([...base, 'exec', '-T', service,
        'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
        '-U', 'postgres', '-d', database,
        '-c', 'select current_database() || chr(58) || 1::text'], { capture: true });
      if (output !== database + ':1') throw new Error('DB identity mismatch: ' + service);
      console.log('[saju-bridge] ' + service + ' independent SQL connection: PASS');
    }
    composed('up', '--detach', 'gotrue');
    composed('run', '--rm', '--no-deps', 'auth-verifier');
  } catch (error) {
    failure = error;
    console.error('[saju-bridge] Verification BLOCKED: '
      + (error instanceof Error ? error.message : 'unknown failure'));
    try { composed('ps', '--all'); } catch { /* Cleanup still required. */ }
  } finally {
    try {
      composed('down', '--volumes', '--remove-orphans');
      for (const kind of ['container', 'volume', 'network']) {
        if (remaining(kind) !== '') {
          throw new Error('Disposable ' + kind + ' resource remains for project ' + project);
        }
      }
      console.log('[saju-bridge] Project containers, network and volumes: fully removed.');
    } catch (cleanupError) {
      failure ??= cleanupError;
      console.error('[saju-bridge] CLEANUP BLOCKED for ' + project + ': '
        + (cleanupError instanceof Error ? cleanupError.message : 'unknown'));
      console.error('[saju-bridge] Inspect ONLY this project; do not prune other Docker projects.');
    }
  }
  if (failure) process.exitCode = 1;
  else {
    console.log('[saju-bridge] Phase 1 PASS: disposable GoTrue and 4 DBs only.');
    console.log('[saju-bridge] Saju HTTP/TLS/Permit/recovery and operational approval remain HOLD.');
  }
}

try { main(); } catch (error) {
  console.error('[saju-bridge] Local Docker BLOCKED:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
}
