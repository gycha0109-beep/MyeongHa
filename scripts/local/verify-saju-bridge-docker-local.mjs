#!/usr/bin/env node
// Disposable Windows Docker Desktop / Linux local Phase 1 and opt-in Phase 2.
// Phase 2 runs the real pinned Saju HTTP/HMAC loopback verifier inside Docker.
// Keep the existing verify-saju-bridge-full.mjs GitHub workflow launcher unchanged.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const compose = fileURLToPath(new URL('./saju-bridge-full.compose.yml', import.meta.url));
const httpCompose = fileURLToPath(new URL('./saju-bridge-http.compose.yml', import.meta.url));
const tlsCompose = fileURLToPath(new URL('./saju-bridge-tls.compose.yml', import.meta.url));
const permitCompose = fileURLToPath(new URL('./saju-bridge-permit.compose.yml', import.meta.url));
const recoveryCompose = fileURLToPath(new URL('./saju-bridge-recovery.compose.yml', import.meta.url));
const commitFaultRunner = fileURLToPath(new URL('./verify-saju-bridge-docker-inflight-commit.mjs', import.meta.url));
const networkFaultRunner = fileURLToPath(new URL('./verify-saju-bridge-docker-network-partition.mjs', import.meta.url));
const admissionFaultRunner = fileURLToPath(new URL('./verify-saju-bridge-docker-admission-inflight.mjs', import.meta.url));
const crossDbRunner = fileURLToPath(new URL('./verify-saju-bridge-docker-cross-db.mjs', import.meta.url));
const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const pinnedSajuSha = 'cd0acf9abd447826ccaefba56112d046e560ee04';
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
sandboxEnv.SAJU_BRIDGE_LOCAL_SUBJECT_LOGIN_PASSWORD = randomBytes(28).toString('hex');
sandboxEnv.SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD = randomBytes(28).toString('hex');
sandboxEnv.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD = randomBytes(28).toString('hex');
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

function localSajuCheckout() {
  if (process.argv.length === 2) return null;
  if (process.argv.length !== 4 || !['--http', '--binding', '--tls', '--permit', '--recovery', '--crash-commit', '--partition-commit', '--admission-crash', '--cross-db', '--snapshot-race'].includes(process.argv[2]) || !process.argv[3]) {
    throw new Error('Usage: node scripts/local/verify-saju-bridge-docker-local.mjs [--http ../Saju | --binding ../Saju | --tls ../Saju | --permit ../Saju | --recovery ../Saju | --crash-commit ../Saju | --partition-commit ../Saju | --admission-crash ../Saju | --cross-db ../Saju | --snapshot-race ../Saju]');
  }
  const saju = realpathSync(resolve(process.argv[3]));
  if (saju === root) throw new Error('A separate pinned Saju checkout is required.');
  const remote = JSON.parse(readFileSync(resolve(saju, 'package.json'), 'utf8'));
  if (remote.name !== 'myeonghwa-saju-engine') {
    throw new Error('Expected a local Saju engine checkout.');
  }
  const rev = spawnSync('git', ['-C', saju, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', shell: false, windowsHide: true, timeout: 15_000,
  });
  if (rev.error || rev.status !== 0 || rev.stdout.trim() !== pinnedSajuSha) {
    throw new Error('Saju checkout is not the pinned source revision ' + pinnedSajuSha);
  }
  const dirty = spawnSync('git', ['-C', saju, 'status', '--porcelain', '--untracked-files=normal'], {
    encoding: 'utf8', shell: false, windowsHide: true, timeout: 15_000,
  });
  if (dirty.error || dirty.status !== 0 || dirty.stdout.trim()) {
    throw new Error('Saju pinned checkout has local changes or untracked files; refusing ambiguous proof.');
  }
  for (const directory of [root, saju]) {
    for (const filename of ['.env', '.env.local', '.env.production', '.env.development']) {
      if (existsSync(resolve(directory, filename))) {
        throw new Error('Refusing to mount a repository containing local environment secrets.');
      }
    }
  }
  sandboxEnv.SAJU_BRIDGE_LOCAL_MYEONGHA_DIR = root;
  sandboxEnv.SAJU_BRIDGE_LOCAL_SAJU_DIR = saju;
  return saju;
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
}

let base = ['compose', '--project-name', project, '-f', compose];
function composed(...args) { return docker([...base, ...args]); }

function remaining(kind) {
  const args = kind === 'container' ? ['ps', '--all', '--quiet']
    : kind === 'volume' ? ['volume', 'ls', '--quiet']
      : ['network', 'ls', '--quiet'];
  return docker([...args, '--filter', 'label=com.docker.compose.project=' + project],
    { capture: true, timeout: 20_000 });
}

function main() {
  const stability = process.argv[2] === '--snapshot-race';
  const crossDb = process.argv[2] === '--cross-db' || stability;
  const admissionCrash = process.argv[2] === '--admission-crash' || crossDb;
  const networkCommit = process.argv[2] === '--partition-commit' || admissionCrash;
  const crashCommit = process.argv[2] === '--crash-commit' || networkCommit;
  const recovery = process.argv[2] === '--recovery' || crashCommit;
  const permit = process.argv[2] === '--permit' || recovery;
  const tls = process.argv[2] === '--tls' || permit;
  const binding = process.argv[2] === '--binding' || tls;
  const saju = localSajuCheckout();
  if (saju) base = [...base, '-f', httpCompose];
  if (tls) base = [...base, '-f', tlsCompose];
  if (permit) base = [...base, '-f', permitCompose];
  if (recovery) {
    base = [...base, '-f', recoveryCompose];
    sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE = 'seed';
    sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ID = randomUUID();
    sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_KEY = randomBytes(32).toString('base64url');
    // Compose config preflight demands strings; fresh timestamps are set only
    // after the slow dependency/build/bootstrap portion of the Docker run.
    sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ISSUED_MS = '1';
    sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_EXPIRES_MS = '2';
    sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_EXPIRES_MS = '2';
  }
  if (JSON.parse(readFileSync(packagePath, 'utf8')).name !== 'myeongha') {
    throw new Error('Expected MyeongHa repository checkout.');
  }
  assertLocalEngine();
  console.log('[saju-bridge] Disposable Docker project: ' + project);
  console.log('[saju-bridge] Local Auth + four PostgreSQL clusters; no exposed host ports.');
  let failure = null;
  try {
    composed('config', '--quiet');
    if (tls) {
      console.log('[saju-bridge] Preparing three independent synthetic CA/SAN sets in disposable volumes.');
      composed('run', '--rm', '--no-deps', 'saju-tls-prep');
    }
    composed('up', '--detach', '--wait', '--wait-timeout', '150',
      ...services.map(([service]) => service));
    for (const [service, database] of services) {
      // pg_isready can momentarily report ready during entrypoint's bootstrap
      // shutdown/restart. Retry ONLY known SQL startup transients; wrong DB
      // identity, credentials and all other SQL errors still fail closed.
      let verified = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const output = docker([...base, 'exec', '-T', service,
            'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
            '-U', 'postgres', '-d', database,
            '-c', 'select current_database() || chr(58) || 1::text'],
          { capture: true, timeout: 12000 });
          if (output !== database + ':1') throw new Error('DB identity mismatch: ' + service);
          verified = true;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!/database system is (?:shutting down|starting up|in recovery mode)|Connection refused|No such file or directory/iu.test(message)
            || attempt === 19) throw error;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
        }
      }
      if (!verified) throw new Error('DB SQL readiness not confirmed: ' + service);
      console.log('[saju-bridge] ' + service + ' independent SQL connection: PASS');
    }
    composed('up', '--detach', 'gotrue');
    composed('run', '--rm', '--no-deps', 'auth-verifier');
    if (saju) {
      console.log('[saju-bridge] Installing isolated Node 24 dependencies (temporary volumes).');
      composed('run', '--rm', '--no-deps', 'saju-deps-myeongha');
      composed('run', '--rm', '--no-deps', 'saju-deps-engine');
      console.log('[saju-bridge] Running pinned Saju HTTP/HMAC in isolated Docker network.');
      composed('run', '--rm', '--no-deps', 'saju-http-verifier');
      console.log('[saju-bridge] Phase 2 actual Saju HTTP/HMAC: PASS.');
      if (binding) {
        console.log('[saju-bridge] Bootstrapping disposable Subject/Birth and independent Nonce permissions.');
        composed('run', '--rm', '--no-deps', 'saju-bootstrap-subject');
        composed('run', '--rm', '--no-deps', 'saju-bootstrap-nonce');
        if (tls) composed('run', '--rm', '--no-deps', 'saju-bootstrap-admission');
        if (permit) {
          console.log('[saju-bridge] Bootstrapping synthetic Permit V2 and consumer-only Admission role.');
          composed('run', '--rm', '--no-deps', 'saju-bootstrap-permit');
        }
        console.log('[saju-bridge] Verifying GoTrue JWT → Subject/Birth → Saju HMAC → isolated Nonce.');
        composed('run', '--rm', '--no-deps', 'saju-binding-verifier');
        if (recovery) {
          // Fault probes keep the SAME DB data volumes and CA volumes. Do not
          // call 'down --volumes' until all restart/outage assertions finish.
          const now = Date.now();
          sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ISSUED_MS = String(now - 2000);
          sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_EXPIRES_MS = String(now + 8 * 60_000);
          sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_EXPIRES_MS = String(now + 125_000);
          sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE = 'seed';
          console.log('[saju-bridge] Phase 4A: inject synthetic COMMIT acknowledgement loss against real TLS databases.');
          composed('run', '--rm', '--no-deps', 'saju-recovery-verifier');
          console.log('[saju-bridge] Phase 4A: restart three actual DB containers, preserving their named data volumes.');
          composed('restart', 'subject-db', 'nonce-db', 'admission-db');
          composed('up', '--detach', '--wait', '--wait-timeout', '120', 'subject-db', 'nonce-db', 'admission-db');
          for (const service of ['nonce-db', 'subject-db', 'admission-db']) {
            composed('stop', service);
            try {
              sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE = 'outage-' + service.slice(0, -3);
              console.log('[saju-bridge] Phase 4A: verify refusal with ' + service + ' actually stopped.');
              composed('run', '--rm', '--no-deps', 'saju-recovery-verifier');
            } finally {
              composed('up', '--detach', '--wait', '--wait-timeout', '120', service);
            }
          }
          sandboxEnv.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE = 'verify';
          console.log('[saju-bridge] Phase 4A: verify durable Nonce/Permit consumption and Subject fixture after recovery.');
          composed('run', '--rm', '--no-deps', 'saju-recovery-verifier');
          if (crashCommit) {
            sandboxEnv.SAJU_BRIDGE_LOCAL_COMMIT_FAULT = '1';
            console.log('[saju-bridge] Phase 4B: start real in-flight PostgreSQL COMMIT interruption test (synthetic Nonce only).');
            const fault = spawnSync(process.execPath, [commitFaultRunner], {
              cwd: root, shell: false, env: sandboxEnv,
              stdio: 'inherit', timeout: 150_000, windowsHide: true,
            });
            if (fault.error || fault.status !== 0) {
              throw new Error('Phase 4B real COMMIT interruption failed: '
                + (fault.error?.code || fault.signal || 'exit ' + fault.status));
            }
          }
          if (networkCommit) {
            sandboxEnv.SAJU_BRIDGE_LOCAL_NETWORK_FAULT = '1';
            console.log('[saju-bridge] Phase 4C-1: physical network-only partition of in-flight client during Nonce COMMIT.');
            const fault = spawnSync(process.execPath, [networkFaultRunner], {
              cwd: root, shell: false, env: sandboxEnv,
              stdio: 'inherit', timeout: 175_000, windowsHide: true,
            });
            if (fault.error || fault.status !== 0) {
              throw new Error('Phase 4C-1 physical network-only partition failed: '
                + (fault.error?.code || fault.signal || 'exit ' + fault.status));
            }
          }
          if (admissionCrash) {
            sandboxEnv.SAJU_BRIDGE_LOCAL_ADMISSION_COMMIT_FAULT = '1';
            console.log('[saju-bridge] Phase 4C-2: physical Admission PostgreSQL SIGKILL while consuming synthetic Permit V2 inside COMMIT.');
            const fault = spawnSync(process.execPath, [admissionFaultRunner], {
              cwd: root, shell: false, env: sandboxEnv,
              stdio: 'inherit', timeout: 175_000, windowsHide: true,
            });
            if (fault.error || fault.status !== 0) {
              throw new Error('Phase 4C-2 physical Admission COMMIT interruption failed: '
                + (fault.error?.code || fault.signal || 'exit ' + fault.status));
            }
          }
          if (crossDb) {
            sandboxEnv.SAJU_BRIDGE_LOCAL_CROSS_DB_FAULT = '1';
            if (stability) sandboxEnv.SAJU_BRIDGE_LOCAL_STABILITY_FAULT = '1';
            console.log('[saju-bridge] Phase 4C-3: observe independently durable cross-DB partial states, physical peer outages and fail-closed HOLD.');
            const probe = spawnSync(process.execPath, [crossDbRunner], {
              cwd: root, shell: false, env: sandboxEnv,
              stdio: 'inherit', timeout: 340_000, windowsHide: true,
            });
            if (probe.error || probe.status !== 0) {
              throw new Error('Phase 4C-3 cross-DB durable state verification failed: '
                + (probe.error?.code || probe.signal || 'exit ' + probe.status));
            }
          }
        }
      }
    }
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
    console.log('[saju-bridge] Phase 1 PASS: disposable GoTrue and 4 DBs.');
    if (saju) {
      console.log('[saju-bridge] Phase 2 PASS: real pinned Saju HTTP/HMAC loopback.');
      if (binding) {
        console.log('[saju-bridge] Phase 2B PASS: real Auth/Birth/Nonce Docker binding with isolated DBs.');
        if (tls) {
          console.log('[saju-bridge] Phase 3A PASS: independent verify-full Subject/Nonce/Admission TLS (Permit not exercised).');
          if (permit) {
            console.log('[saju-bridge] Phase 3B PASS: signed synthetic Permit V2 consumed once in isolated Admission TLS DB (no Runner).');
            if (recovery) {
              console.log('[saju-bridge] Phase 4A PASS: real DB stop/restart durability and synthetic COMMIT-ACK uncertainty (not physical mid-COMMIT loss).');
              if (crashCommit) {
                console.log('[saju-bridge] Phase 4B PASS: physical Nonce DB SIGKILL observed during deferred COMMIT, fail-closed and durable rollback.');
                if (networkCommit) {
                  console.log('[saju-bridge] Phase 4C-1 PASS: client-only Docker network disconnect during actual Nonce COMMIT; server-side outcome independently reconciled, no automatic replay.');
                  if (admissionCrash) {
                    console.log('[saju-bridge] Phase 4C-2 PASS: physical Admission DB SIGKILL inside Permit V2 COMMIT, durable rollback, no duplicate consume and no status promotion.');
                    if (crossDb) {
                      console.log('[saju-bridge] Phase 4C-3 PASS: three independently durable cross-DB divergence cases, actual peer outages and read-only fail-closed HOLD; no retry or compensation.');
                      if (stability) console.log('[saju-bridge] Phase 4D PASS: cross-session stale snapshot invalidated by real independent DB commits; unchanged later evidence still HOLD.');
                      console.log('[saju-bridge] Distributed automatic recovery, Runner and operational approvals remain HOLD.');
                    } else {
                      console.log('[saju-bridge] Cross-DB partial-commit reconciliation and distributed recovery remain HOLD.');
                    }
                  } else {
                    console.log('[saju-bridge] Admission in-flight COMMIT and cross-DB distributed recovery remain HOLD.');
                  }
                } else {
                  console.log('[saju-bridge] Actual network-only partition, Admission in-flight COMMIT and distributed recovery remain HOLD.');
                }
              } else {
                console.log('[saju-bridge] Physical mid-COMMIT partition, distributed recovery, Runner and operational approval remain HOLD.');
              }
            } else {
              console.log('[saju-bridge] Recovery and all operational approvals remain HOLD.');
            }
          } else {
            console.log('[saju-bridge] Permit V2/recovery and operational approval remain HOLD.');
          }
        } else {
          console.log('[saju-bridge] Separate TLS, Permit/recovery and operational approval remain HOLD.');
        }
      } else {
        console.log('[saju-bridge] Docker Auth/Birth/Nonce binding, TLS/Permit/recovery and operational approval remain HOLD.');
      }
    } else {
      console.log('[saju-bridge] Saju HTTP/TLS/Permit/recovery and operational approval remain HOLD.');
    }
  }
}

try { main(); } catch (error) {
  console.error('[saju-bridge] Local Docker BLOCKED:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
}
