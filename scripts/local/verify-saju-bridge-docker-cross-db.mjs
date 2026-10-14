#!/usr/bin/env node
// Phase 4C-3 HOST-ONLY disposable multi-DB observer. No distributed writer,
// automatic replay, compensation, real operator permit or Docker socket mount.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assessSajuBridgeCrossDbSnapshotRaceV1 } from './saju-bridge-cross-db-observation-v1.mjs';

const files = [
  'saju-bridge-full.compose.yml', 'saju-bridge-http.compose.yml',
  'saju-bridge-tls.compose.yml', 'saju-bridge-permit.compose.yml',
  'saju-bridge-recovery.compose.yml',
].map(name => fileURLToPath(new URL('./' + name, import.meta.url)));
const env = { ...process.env };
const project = env.COMPOSE_PROJECT_NAME;
const base = ['compose', '--project-name', project ?? '', ...files.flatMap(f => ['-f', f])];
if (!/^myeongha-saju-full-[a-f0-9]{12}$/u.test(project ?? '')
  || env.SAJU_BRIDGE_LOCAL_CROSS_DB_FAULT !== '1'
  || !env.SAJU_BRIDGE_LOCAL_MYEONGHA_DIR || !env.SAJU_BRIDGE_LOCAL_SAJU_DIR
  || !env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ID
  || !env.SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD
  || !env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD
  || !env.SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD) {
  throw new Error('Refusing non-disposable Phase 4C-3 multi-DB verifier.');
}
function docker(args, timeout = 30000) {
  const r = spawnSync('docker', [...base, ...args], {
    env, encoding: 'utf8', timeout, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error || r.status !== 0) {
    throw new Error('Phase 4C-3 disposable Docker command blocked: '
      + (r.error?.code || r.stderr?.trim().slice(-600) || r.status));
  }
  return r.stdout?.trim() ?? '';
}
function assertDb(service, database, table) {
  const sql = "select case when current_database() = '" + database
    + "' and exists (select 1 from pg_class where oid='public." + table
    + "'::regclass and relforcerowsecurity) then 'DISPOSABLE' else 'BLOCKED' end";
  const result = docker(['exec', '-T', service, 'psql', '-X', '-q', '-A', '-t',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-c', sql], 15000);
  if (result !== 'DISPOSABLE') throw new Error('Cross-DB fixture identity/RLS mismatch: ' + service);
}
const peers = {
  subject: 'subject-db', nonce: 'nonce-db', admission: 'admission-db',
};
function stageArgs(stage) {
  const values = [
    ['SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_NONCE', env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_NONCE],
    ['SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_ADMISSION', env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_ADMISSION],
    ['SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_REVOKED', env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_REVOKED],
    ['SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_NONCE', env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_NONCE],
    ['SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_ADMISSION', env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_ADMISSION],
    ['SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_REVOKED', env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_REVOKED],
    ['SAJU_BRIDGE_LOCAL_CROSS_DB_ISSUED_MS', env.SAJU_BRIDGE_LOCAL_CROSS_DB_ISSUED_MS],
    ['SAJU_BRIDGE_LOCAL_CROSS_DB_EXPIRES_MS', env.SAJU_BRIDGE_LOCAL_CROSS_DB_EXPIRES_MS],
  ];
  return ['run', '--rm', '--no-deps', '--entrypoint', 'node',
    '-e', 'MYEONGHA_DOCKER_SAJU_CROSS_DB=1',
    ...(stage === 'cross-provenance' ? ['-e', 'MYEONGHA_DOCKER_SAJU_PROVENANCE=1'] : []),
    '-e', 'SAJU_BRIDGE_LOCAL_RECOVERY_STAGE=' + stage,
    ...values.flatMap(([key,value]) => ['-e', key + '=' + value]),
    'saju-recovery-verifier', 'node_modules/vitest/vitest.mjs', 'run',
    stage === 'cross-provenance' ? 'test/saju-held-docker-provenance-phase4e.test.ts'
      : 'test/saju-held-docker-cross-db-phase4c3.test.ts'];
}
function runStage(stage, match) {
  const out = docker(stageArgs(stage), 110000);
  if (match && !out.includes(match)) {
    throw new Error('Required Phase 4C-3/4D evidence missing at ' + stage);
  }
  return out;
}
function snapshot(stage) {
  const out = runStage(stage, '[saju-bridge] Phase 4D snapshot ' + stage + ': ');
  const line = out.split(/\r?\n/u).find(l => l.includes('[saju-bridge] Phase 4D snapshot ' + stage + ': '));
  const raw = line?.split('Phase 4D snapshot ' + stage + ': ')[1]?.trim();
  if (!raw || raw.length > 700) throw new Error('Missing bounded semantic snapshot for ' + stage);
  try { return JSON.parse(raw); }
  catch { throw new Error('Malformed semantic snapshot for ' + stage); }
}
async function run() {
  const now = Date.now();
  env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_NONCE = randomUUID();
  env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_ADMISSION = randomUUID();
  env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_REVOKED = randomUUID();
  env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_NONCE = randomBytes(32).toString('base64url');
  env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_ADMISSION = randomBytes(32).toString('base64url');
  env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_REVOKED = randomBytes(32).toString('base64url');
  env.SAJU_BRIDGE_LOCAL_CROSS_DB_ISSUED_MS = String(now - 2000);
  env.SAJU_BRIDGE_LOCAL_CROSS_DB_EXPIRES_MS = String(now + 300000);
  const started = Date.now();
  let stopped;
  let primaryError;
  try {
    assertDb('nonce-db','myeongha_saju_nonce_local_verify','saju_source_proof_nonce_claims');
    assertDb('admission-db','myeongha_saju_admission_local_verify',
      'saju_staging_operator_admission_permits_v2');
    console.log('[saju-bridge] Phase 4C-3: seed independent durable Nonce-only, Permit-only and REVOKED+Nonce pairs.');
    runStage('cross-seed', 'Phase 4C-3 cross-seed evidence: three independent partial states HOLD.');
    docker(['restart','subject-db','nonce-db','admission-db'], 150000);
    docker(['up','--detach','--wait','--wait-timeout','120',
      'subject-db','nonce-db','admission-db'], 150000);
    runStage('cross-verify', 'Phase 4C-3 durable cross-DB evidence:');
    for (const peer of ['nonce', 'admission', 'subject']) {
      const service = peers[peer];
      docker(['stop',service], 30000);
      stopped = service;
      if (docker(['ps','-q',service]) !== '') {
        throw new Error('Physical stopped-peer observation not established: ' + peer);
      }
      runStage('cross-outage-' + peer,
        'Phase 4C-3 cross-outage-' + peer + ': physical peer unreachable -> UNKNOWN_HOLD; no stale fallback.');
      docker(['up','--detach','--wait','--wait-timeout','120',service], 150000);
      stopped = undefined;
    }
    runStage('cross-final', 'Phase 4C-3 durable cross-DB evidence:');
    console.log('[saju-bridge] Phase 4C-3: three durable partial states, real peer outages, restart reconciliation and read-only fail-closed HOLD PASS.');
    if (env.SAJU_BRIDGE_LOCAL_STABILITY_FAULT === '1') {
      // Separate verifier containers prevent sharing any connection or
      // in-process snapshot between the evidence readers and fixture writer.
      const before = snapshot('cross-stability-before');
      runStage('cross-stability-mutate',
        'Phase 4D controlled independent signed Permit/Nonce changes COMMITTED; no compensation.');
      const after = snapshot('cross-stability-after');
      const changed = assessSajuBridgeCrossDbSnapshotRaceV1(before, after);
      if (changed.classification !== 'EVIDENCE_CHANGED_HOLD'
        || changed.decision !== 'HOLD_MANUAL_REVIEW'
        || changed.canExecute !== false || changed.automaticRetry !== false
        || changed.automaticCompensation !== false) {
        throw new Error('Phase 4D stale first snapshot was not invalidated.');
      }
      // Read again from newly restarted physical DB processes, same data
      // volumes. Even an unchanged second observation grants no permission.
      docker(['restart','nonce-db','admission-db'], 150000);
      docker(['up','--detach','--wait','--wait-timeout','120','nonce-db','admission-db'], 150000);
      const confirmed = snapshot('cross-stability-confirm');
      const unchanged = assessSajuBridgeCrossDbSnapshotRaceV1(after, confirmed);
      if (unchanged.classification !== 'UNCHANGED_UNVERIFIED_HOLD'
        || unchanged.decision !== 'HOLD_MANUAL_REVIEW'
        || unchanged.canExecute !== false || unchanged.canPublish !== false
        || unchanged.canSell !== false || unchanged.automaticRetry !== false
        || unchanged.automaticCompensation !== false) {
        throw new Error('Phase 4D steady-state evidence incorrectly authorizes recovery.');
      }
      console.log('[saju-bridge] Phase 4D: changed original cross-DB snapshot rejected; later unchanged snapshot remains HOLD; no automatic retry, compensation or permission.');
    }
    if (env.SAJU_BRIDGE_LOCAL_PROVENANCE_FAULT === '1') {
      if (env.SAJU_BRIDGE_LOCAL_STABILITY_FAULT !== '1') {
        throw new Error('Phase 4E requires Phase 4D actual changed and unchanged snapshots.');
      }
      runStage('cross-provenance', 'Phase 4E real DB: independent TLS and READ ONLY; replay digest != Permit UUID; shared attempt authority NOT_PROVEN; manual review NOT_ADMISSIBLE; HOLD.');
      console.log('[saju-bridge] Phase 4E: real 3-DB scoped provenance and hostile approval claims rejected; no causal attempt attestation or operator approval.');
    }
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      if (stopped) docker(['up','--detach','--wait','--wait-timeout','120',stopped], 150000);
      // Parent owns final 'down --volumes' and zero-residue assertion.
    } catch (error) {
      primaryError ??= new Error('Phase 4C-3 peer recovery cleanup blocked: ' + String(error));
    }
  }
  if (Date.now() - started > 300000) {
    primaryError ??= new Error('Phase 4C-3 exceeded disposable signed Permit budget.');
  }
  if (primaryError) throw primaryError;
}
run().catch(error => {
  console.error('[saju-bridge] Phase 4C-3 BLOCKED: '
    + (error instanceof Error ? error.message : 'unknown'));
  process.exitCode = 1;
});
