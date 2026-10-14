#!/usr/bin/env node
// Phase 4C-2: host-only controller kills the disposable Admission PostgreSQL
// while an actual signed Permit V2 consumption is INSIDE deferred COMMIT.
// No Docker socket is mounted in test containers; no Runner is executed.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const composeFiles = [
  'saju-bridge-full.compose.yml', 'saju-bridge-http.compose.yml',
  'saju-bridge-tls.compose.yml', 'saju-bridge-permit.compose.yml',
  'saju-bridge-recovery.compose.yml',
].map(name => fileURLToPath(new URL('./' + name, import.meta.url)));
const env = { ...process.env };
const project = env.COMPOSE_PROJECT_NAME;
const database = 'myeongha_saju_admission_local_verify';
const base = ['compose', '--project-name', project ?? '', ...composeFiles.flatMap(p => ['-f', p])];
if (!/^myeongha-saju-full-[a-f0-9]{12}$/u.test(project ?? '')
  || env.SAJU_BRIDGE_LOCAL_ADMISSION_COMMIT_FAULT !== '1'
  || !env.SAJU_BRIDGE_LOCAL_MYEONGHA_DIR || !env.SAJU_BRIDGE_LOCAL_SAJU_DIR
  || !env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ID
  || !env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD
  || !env.SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD
  || !env.SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD) {
  throw new Error('Refusing non-disposable Phase 4C-2 Admission in-flight crash controller.');
}
function docker(args, { input, timeout = 30000 } = {}) {
  const r = spawnSync('docker', [...base, ...args], {
    env, encoding: 'utf8', input, timeout, windowsHide: true, stdio: ['pipe','pipe','pipe'],
  });
  if (r.error || r.status !== 0) {
    throw new Error('Phase 4C-2 disposable Docker command failed: '
      + (r.error?.code || r.stderr?.trim().slice(-350) || r.status));
  }
  return r.stdout?.trim() ?? '';
}
function sql(statement, { input } = {}) {
  return docker(['exec', '-T', 'admission-db', 'psql', '-X', '-q', '-A', '-t',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database,
    ...(input === undefined ? ['-c', statement] : [])], { input, timeout: 15000 });
}
const install = `
DO $guard$ BEGIN
 IF current_database() <> 'myeongha_saju_admission_local_verify'
    OR current_user <> 'postgres'
    OR NOT EXISTS (SELECT 1 FROM pg_class
      WHERE oid='public.saju_staging_operator_admission_permits_v2'::regclass
      AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'Refusing non-disposable Admission in-flight fixture'; END IF;
END $guard$;
CREATE FUNCTION public.saju_docker_admission_commit_sleep() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
 PERFORM pg_sleep(65);
 RETURN NEW;
END $fn$;
CREATE CONSTRAINT TRIGGER saju_docker_admission_commit_fault
AFTER UPDATE ON public.saju_staging_operator_admission_permits_v2
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (OLD.status = 'ISSUED' AND NEW.status = 'CONSUMED')
EXECUTE FUNCTION public.saju_docker_admission_commit_sleep();
`;
const cleanup = `
DROP TRIGGER IF EXISTS saju_docker_admission_commit_fault
 ON public.saju_staging_operator_admission_permits_v2;
DROP FUNCTION IF EXISTS public.saju_docker_admission_commit_sleep();
`;
function runnerArgs(stage) {
  return ['run', '--rm', '--no-deps', '--entrypoint', 'node',
    '-e', 'MYEONGHA_DOCKER_SAJU_ADMISSION_COMMIT=1',
    '-e', 'SAJU_BRIDGE_LOCAL_RECOVERY_STAGE=' + stage,
    '-e', 'SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_PERMIT_ID='
      + env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_PERMIT_ID,
    '-e', 'SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_REVOKED_ID='
      + env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_REVOKED_ID,
    '-e', 'SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_ISSUED_MS='
      + env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_ISSUED_MS,
    '-e', 'SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_EXPIRES_MS='
      + env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_EXPIRES_MS,
    'saju-recovery-verifier', 'node_modules/vitest/vitest.mjs', 'run',
    'test/saju-held-docker-admission-inflight-phase4c2.test.ts'];
}
async function run() {
  const now = Date.now();
  env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_PERMIT_ID = randomUUID();
  env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_REVOKED_ID = randomUUID();
  env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_ISSUED_MS = String(now - 2000);
  env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_EXPIRES_MS = String(now + 140000);
  const started = Date.now();
  let installed = false, child, primaryError;
  try {
    // Ensure all SQL executes ONLY against the disposable Admission DB.
    sql('', { input: install });
    installed = true;
    let output = '', ended = false;
    child = spawn('docker', [...base, ...runnerArgs('admission-fire')], {
      env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-5000); });
    child.stderr.on('data', chunk => { output = (output + chunk.toString()).slice(-5000); });
    const completed = new Promise(resolve => {
      child.once('error', error => { ended = true; resolve({ code: -1, error }); });
      child.once('exit', code => { ended = true; resolve({ code }); });
    });
    let observed = false;
    for (let attempt = 0; attempt < 75 && !ended; attempt++) {
      const active = sql("select case when exists (select 1 from pg_stat_activity "
        + "where datname='myeongha_saju_admission_local_verify' "
        + "and state='active' and btrim(query)='COMMIT' "
        + "and wait_event='PgSleep') then 'IN_COMMIT' else 'WAIT' end");
      if (active === 'IN_COMMIT') { observed = true; break; }
      await sleep(200);
    }
    if (!observed) {
      throw new Error('Admission PostgreSQL COMMIT/PgSleep never observed; no crash injected.');
    }
    console.log('[saju-bridge] Phase 4C-2: observed actual Admission COMMIT; SIGKILL only owned Admission DB.');
    docker(['kill', '-s', 'SIGKILL', 'admission-db'], { timeout: 20000 });
    const outcome = await Promise.race([
      completed, sleep(20000).then(() => ({ code: -2 })),
    ]);
    if (outcome.code !== 0) {
      throw new Error('Signed Permit adapter did not deny physical Admission COMMIT interruption: '
        + (outcome.code === -2 ? 'timeout' : output.replace(/[^\\x20-\\x7e\\n]/gu, '').slice(-750)));
    }
    docker(['up', '--detach', '--wait', '--wait-timeout', '120', 'admission-db'],
      { timeout: 150000 });
    const verification = docker(runnerArgs('admission-verify'), { timeout: 100000 });
    const marker = '[saju-bridge] Phase 4C-2 durable states: interrupted=ISSUED, revoked=REVOKED, preexisting=CONSUMED; nonce=1, subject=1, no replay.';
    if (!verification.includes(marker)) throw new Error('Durable Admission rollback or cross-DB state proof missing.');
    console.log(marker);
    console.log('[saju-bridge] Phase 4C-2: physical Admission SIGKILL during COMMIT, rollback and no privilege promotion PASS.');
  } catch (error) {
    primaryError = error;
  } finally {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    try {
      docker(['up','--detach','--wait','--wait-timeout','120','admission-db'],
        { timeout: 150000 });
      if (installed) sql('', { input: cleanup });
    } catch (error) {
      primaryError ??= new Error('Phase 4C-2 Admission fault cleanup blocked: ' + String(error));
    }
  }
  if (Date.now() - started > 140000) {
    primaryError ??= new Error('Phase 4C-2 exceeded isolated Permit proof deadline.');
  }
  if (primaryError) throw primaryError;
}
run().catch(error => {
  console.error('[saju-bridge] Phase 4C-2 BLOCKED: '
    + (error instanceof Error ? error.message : 'unknown'));
  process.exitCode = 1;
});
