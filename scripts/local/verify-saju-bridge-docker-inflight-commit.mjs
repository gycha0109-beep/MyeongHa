#!/usr/bin/env node
// Parent-local Docker CLI controller. NEVER mount Docker socket into the
// disposable verifier. Requires the parent to have checked local Docker.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const parent = fileURLToPath(new URL('./', import.meta.url));
const compose = fileURLToPath(new URL('./saju-bridge-full.compose.yml', import.meta.url));
const http = fileURLToPath(new URL('./saju-bridge-http.compose.yml', import.meta.url));
const tls = fileURLToPath(new URL('./saju-bridge-tls.compose.yml', import.meta.url));
const permit = fileURLToPath(new URL('./saju-bridge-permit.compose.yml', import.meta.url));
const recovery = fileURLToPath(new URL('./saju-bridge-recovery.compose.yml', import.meta.url));
const env = { ...process.env };
const project = env.COMPOSE_PROJECT_NAME;
const db = 'myeongha_saju_nonce_local_verify';
const base = ['compose', '--project-name', project ?? '', '-f', compose, '-f', http,
  '-f', tls, '-f', permit, '-f', recovery];
if (!parent || !/^myeongha-saju-full-[a-f0-9]{12}$/u.test(project ?? '')
  || env.SAJU_BRIDGE_LOCAL_COMMIT_FAULT !== '1'
  || !env.SAJU_BRIDGE_LOCAL_SAJU_DIR || !env.SAJU_BRIDGE_LOCAL_MYEONGHA_DIR
  || !env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ID
  || !env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD
  || !env.SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD) {
  throw new Error('Refusing non-disposable in-flight COMMIT crash controller.');
}
function docker(args, { input, timeout = 30_000 } = {}) {
  const r = spawnSync('docker', [...base, ...args], {
    env, encoding: 'utf8', input, timeout, windowsHide: true,
    stdio: ['pipe','pipe','pipe'],
  });
  if (r.error || r.status !== 0) {
    throw new Error('Local disposable Docker COMMIT fault step failed: '
      + (r.error?.code || r.stderr?.trim().slice(-350) || r.status));
  }
  return r.stdout?.trim() ?? '';
}
function sql(statement, { input } = {}) {
  return docker(['exec', '-T', 'nonce-db', 'psql', '-X', '-q', '-A', '-t',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db,
    ...(input ? [] : ['-c', statement])], { input, timeout: 15_000 });
}
const install = `
DO $guard$ BEGIN
 IF current_database() <> 'myeongha_saju_nonce_local_verify'
    OR current_user <> 'postgres'
    OR NOT EXISTS (SELECT 1 FROM pg_class
      WHERE oid='public.saju_source_proof_nonce_claims'::regclass AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'Non-disposable Nonce in-flight crash fixture'; END IF;
END $guard$;
CREATE FUNCTION public.saju_docker_commit_fault_sleep() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
 PERFORM pg_sleep(65);
 RETURN NEW;
END $fn$;
CREATE CONSTRAINT TRIGGER saju_docker_inflight_commit_fault
AFTER INSERT ON public.saju_source_proof_nonce_claims
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.saju_docker_commit_fault_sleep();
`;
const cleanupSql = `
DROP TRIGGER IF EXISTS saju_docker_inflight_commit_fault
 ON public.saju_source_proof_nonce_claims;
DROP FUNCTION IF EXISTS public.saju_docker_commit_fault_sleep();
`;
function runnerArgs(stage) {
  return ['run', '--rm', '--no-deps', '--entrypoint', 'node',
    '-e', 'MYEONGHA_DOCKER_SAJU_INFLIGHT_COMMIT=1',
    '-e', 'SAJU_BRIDGE_LOCAL_RECOVERY_STAGE=' + stage,
    'saju-recovery-verifier',
    'node_modules/vitest/vitest.mjs', 'run',
    'test/saju-held-docker-inflight-commit-phase4b.test.ts'];
}
async function run() {
  // A fresh replay key never overlaps Phase 4A's already-consumed nonce.
  env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_KEY = randomBytes(32).toString('base64url');
  env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_EXPIRES_MS = String(Date.now() + 125000);
  const started = Date.now();
  let installed = false;
  let child;
  try {
    sql('', { input: install });
    installed = true;
    let output = '';
    let ended = false;
    let exitCode = null;
    child = spawn('docker', [...base, ...runnerArgs('inflight-fire')], {
      env, stdio: ['ignore','pipe','pipe'], windowsHide: true,
    });
    child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-5000); });
    child.stderr.on('data', chunk => { output = (output + chunk.toString()).slice(-5000); });
    const completed = new Promise(resolve => {
      child.once('error', error => { ended = true; resolve({code: -1, error}); });
      child.once('exit', code => { ended = true; exitCode = code; resolve({code}); });
    });
    let observed = false;
    for (let tries = 0; tries < 70; tries++) {
      if (ended) break;
      const active = sql("select case when exists (select 1 from pg_stat_activity "
        + "where datname='myeongha_saju_nonce_local_verify' "
        + "and state='active' and btrim(query)='COMMIT' "
        + "and wait_event='PgSleep') then 'IN_COMMIT' else 'WAIT' end");
      if (active === 'IN_COMMIT') { observed = true; break; }
      await sleep(200);
    }
    if (!observed) throw new Error('Could not observe real PostgreSQL deferred trigger inside COMMIT; refusing simulated success.');
    console.log('[saju-bridge] Phase 4B: confirmed backend inside COMMIT, inject actual PostgreSQL SIGKILL.');
    docker(['kill', '-s', 'SIGKILL', 'nonce-db'], {timeout: 20_000});
    const outcome = await Promise.race([
      completed,
      sleep(20_000).then(() => ({code: -2})),
    ]);
    if (outcome.code !== 0) {
      throw new Error('Nonce adapter did not deny interrupted physical COMMIT: '
        + (outcome.code === -2 ? 'timeout' : output.replace(/[^\x20-\x7e\n]/gu,'').slice(-700)));
    }
    docker(['up', '--detach', '--wait', '--wait-timeout', '120', 'nonce-db'], {timeout: 150_000});
    console.log('[saju-bridge] Phase 4B: physical PostgreSQL crash recovered; verify no durable claim and no replay.');
    docker(runnerArgs('inflight-verify'), {timeout: 90_000});
    console.log('[saju-bridge] Phase 4B: in-flight COMMIT physical SIGKILL, rollback and fail-closed PASS.');
  } finally {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    // Always recover the disposable DB so the parent can perform full
    // down --volumes, even when a crash check fails.
    try {
      docker(['up', '--detach', '--wait', '--wait-timeout', '120','nonce-db'], {timeout: 150_000});
      if (installed) sql('', {input: cleanupSql});
    } catch {
      // Parent cleanup is authoritative; do not promote test success on
      // a failed cleanup operation.
      throw new Error('Disposable COMMIT fault cleanup blocked; parent must remove owned resources.');
    }
    if (Date.now() - started > 120_000) throw new Error('COMMIT crash exceeded evidence TTL.');
  }
}
run().catch(error => {
  console.error('[saju-bridge] Phase 4B BLOCKED: '
    + (error instanceof Error ? error.message : 'unknown'));
  process.exitCode = 1;
});
