#!/usr/bin/env node
// Phase 4C-1: physical Docker network-only isolation of an in-flight client.
// Operates only on a disposable Compose project's OWN verifier container.
// Database is never stopped, killed, restarted, or disconnected.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const composeFiles = [
  'saju-bridge-full.compose.yml', 'saju-bridge-http.compose.yml',
  'saju-bridge-tls.compose.yml', 'saju-bridge-permit.compose.yml',
  'saju-bridge-recovery.compose.yml',
].map(name => fileURLToPath(new URL('./' + name, import.meta.url)));
const env = { ...process.env };
const project = env.COMPOSE_PROJECT_NAME;
const db = 'myeongha_saju_nonce_local_verify';
const clientName = project + '-network-fire';
const base = ['compose', '--project-name', project, ...composeFiles.flatMap(p => ['-f', p])];

if (!/^myeongha-saju-full-[a-f0-9]{12}$/u.test(project ?? '')
  || env.SAJU_BRIDGE_LOCAL_NETWORK_FAULT !== '1'
  || !env.SAJU_BRIDGE_LOCAL_SAJU_DIR || !env.SAJU_BRIDGE_LOCAL_MYEONGHA_DIR
  || !env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ID
  || !env.SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD
  || !env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD) {
  throw new Error('Refusing non-disposable Phase 4C-1 network partition.');
}

function command(args, { compose = false, input, timeout = 30000 } = {}) {
  const result = spawnSync('docker', [...(compose ? base : []), ...args], {
    env, encoding: 'utf8', input, timeout, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw new Error('Disposable Docker network partition command failed: '
      + (result.error?.code || result.stderr?.trim().slice(-400) || result.status));
  }
  return result.stdout?.trim() ?? '';
}
function sql(statement, { input } = {}) {
  return command(['exec', '-T', 'nonce-db', 'psql', '-X', '-q', '-A', '-t',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db,
    ...(input === undefined ? ['-c', statement] : [])],
  { compose: true, input, timeout: 15000 });
}
const install = [
  "DO $guard$ BEGIN",
  " IF current_database() <> 'myeongha_saju_nonce_local_verify'",
  "    OR current_user <> 'postgres'",
  "    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE",
  "      oid='public.saju_source_proof_nonce_claims'::regclass AND relforcerowsecurity)",
  " THEN RAISE EXCEPTION 'Refusing non-disposable partition fixture'; END IF;",
  "END $guard$;",
  "CREATE FUNCTION public.saju_docker_network_commit_sleep() RETURNS trigger",
  "LANGUAGE plpgsql AS $fn$ BEGIN PERFORM pg_sleep(22); RETURN NEW; END $fn$;",
  "CREATE CONSTRAINT TRIGGER saju_docker_network_commit_fault",
  "AFTER INSERT ON public.saju_source_proof_nonce_claims",
  "DEFERRABLE INITIALLY DEFERRED FOR EACH ROW",
  "EXECUTE FUNCTION public.saju_docker_network_commit_sleep();",
].join('\n');
const cleanup = [
  'DROP TRIGGER IF EXISTS saju_docker_network_commit_fault ON public.saju_source_proof_nonce_claims;',
  'DROP FUNCTION IF EXISTS public.saju_docker_network_commit_sleep();',
].join('\n');

function clientArgs(stage, detached = false) {
  return ['run', ...(detached ? ['--name', clientName] : ['--rm']),
    '--no-deps', '--entrypoint', 'node',
    '-e', 'MYEONGHA_DOCKER_SAJU_NETWORK_COMMIT=1',
    '-e', 'SAJU_BRIDGE_LOCAL_RECOVERY_STAGE=' + stage,
    'saju-recovery-verifier', 'node_modules/vitest/vitest.mjs', 'run',
    'test/saju-held-docker-network-commit-phase4c1.test.ts'];
}
function inspectClient() {
  const identity = command(['inspect', '--format',
    '{{index .Config.Labels "com.docker.compose.project"}}/'
      + '{{index .Config.Labels "com.docker.compose.service"}}', clientName]);
  if (identity !== project + '/saju-recovery-verifier') {
    throw new Error('Phase 4C-1 verifier container identity mismatch.');
  }
  return JSON.parse(command(['inspect', '--format',
    '{{json .NetworkSettings.Networks}}', clientName])) ?? {};
}
function networkId() {
  const networks = command(['network', 'ls', '-q',
    '--filter', 'label=com.docker.compose.project=' + project,
    '--filter', 'label=com.docker.compose.network=disposable']).split(/\s+/u).filter(Boolean);
  if (networks.length !== 1) throw new Error('Expected exactly one owned disposable network.');
  const network = networks[0];
  const name = command(['network', 'inspect', '--format', '{{.Name}}', network]);
  if (name !== project + '_disposable') {
    throw new Error('Refusing unexpected Docker network identity.');
  }
  return { network, name };
}
function serverStart() {
  return sql('select pg_postmaster_start_time()::text');
}
async function run() {
  env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_KEY = randomBytes(32).toString('base64url');
  env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_EXPIRES_MS = String(Date.now() + 135000);
  const start = Date.now();
  let installed = false, child, tracked = false, primaryError;
  const originalServerStart = serverStart();
  try {
    const { network, name } = networkId();
    sql('', { input: install });
    installed = true;
    let output = '', ended = false;
    child = spawn('docker', [...base, ...clientArgs('partition-fire', true)], {
      env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    child.stdout.on('data', data => { output = (output + data.toString()).slice(-5000); });
    child.stderr.on('data', data => { output = (output + data.toString()).slice(-5000); });
    const completed = new Promise(resolve => {
      child.once('error', error => { ended = true; resolve({ code: -1, error }); });
      child.once('exit', code => { ended = true; resolve({ code }); });
    });
    let observed = false;
    for (let attempt = 0; attempt < 75 && !ended; attempt++) {
      const status = sql("select case when exists (select 1 from pg_stat_activity "
        + "where datname='myeongha_saju_nonce_local_verify' "
        + "and state='active' and btrim(query)='COMMIT' "
        + "and wait_event='PgSleep') then 'IN_COMMIT' else 'WAIT' end");
      if (status === 'IN_COMMIT') { observed = true; break; }
      await sleep(200);
    }
    if (!observed) throw new Error('Did not observe an actual PostgreSQL in-flight COMMIT.');
    const connections = inspectClient();
    if (Object.keys(connections).length !== 1 || !connections[name]) {
      throw new Error('Verifier not exclusively on owned disposable network.');
    }
    const nonceContainer = command(['ps', '-q', 'nonce-db'], { compose: true });
    if (!/^[a-f0-9]{12,64}$/u.test(nonceContainer)) {
      throw new Error('Expected running disposable Nonce PostgreSQL container.');
    }
    const nonceNetworks = JSON.parse(command(['inspect', '--format',
      '{{json .NetworkSettings.Networks}}', nonceContainer])) ?? {};
    if (!nonceNetworks[name]) throw new Error('Nonce DB is not on the expected network.');
    tracked = true;
    console.log('[saju-bridge] Phase 4C-1: PostgreSQL COMMIT observed; detach only disposable verifier network.');
    command(['network', 'disconnect', '--force', network, clientName], { timeout: 20000 });
    if (Object.keys(inspectClient()).length !== 0) {
      throw new Error('Actual verifier network isolation was not observed.');
    }
    if (serverStart() !== originalServerStart) {
      throw new Error('PostgreSQL restarted during network-only scenario.');
    }
    // The server remains on its network and processes the already-in-flight COMMIT.
    // We do NOT reconnect the verifier and do NOT reissue its transaction.
    const outcome = await Promise.race([completed,
      sleep(105000).then(() => ({ code: -2 }))]);
    if (outcome.code !== 0) {
      throw new Error('Partitioned nonce claim did not fail closed: '
        + (outcome.code === -2 ? 'timeout' : output.replace(/[^\x20-\x7e\n]/gu, '').slice(-750)));
    }
    if (serverStart() !== originalServerStart) {
      throw new Error('PostgreSQL restarted after network-only partition.');
    }
    command(clientArgs('partition-verify'), { compose: true, timeout: 90000 });
    console.log('[saju-bridge] Phase 4C-1: network-only disconnect, unknown COMMIT reconciliation and no automatic replay PASS.');
  } catch (error) {
    primaryError = error;
  } finally {
    // The only forcibly disposable resource here is the named test client.
    if (child && child.exitCode === null) child.kill('SIGTERM');
    try {
      if (tracked) {
        // Only a previously verified project/service-scoped test container may be removed.
        inspectClient();
        command(['rm', '--force', clientName], { timeout: 20000 });
      }
      if (installed) sql('', { input: cleanup });
    } catch (error) {
      primaryError ??= new Error('Phase 4C-1 fixture/client cleanup blocked: ' + String(error));
    }
  }
  if (Date.now() - start > 135000) {
    primaryError ??= new Error('Phase 4C-1 exceeded disposable evidence budget.');
  }
  if (primaryError) throw primaryError;
}
run().catch(error => {
  console.error('[saju-bridge] Phase 4C-1 BLOCKED: '
    + (error instanceof Error ? error.message : 'unknown'));
  process.exitCode = 1;
});
