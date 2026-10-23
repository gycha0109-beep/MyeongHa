#!/usr/bin/env node
// Owner-provisioned, long-running S4 Reader purge worker registration.
// Reuses the account-deletion Worker DB role, TLS config, and off-primary
// Privacy mount. This script installs NO service, CI, cron, HTTP route,
// production migration or paid-read capability.

import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = join(
  projectRoot, 'config/operations/production-official-reader-privacy-purge-worker-v1.json',
);
function unavailable() {
  throw new Error('Governed private Reader privacy Worker cannot start.');
}

if (process.argv.length !== 2) unavailable();
let config;
try { config = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { unavailable(); }

const launch = config?.launch;
if (config?.contractVersion !== 'myeongha-production-reader-privacy-purge-worker-v1'
    || config?.deploymentState !== 'registered-disabled'
    || config?.productionPaidReadEnabled !== false
    || config?.workerPrincipal !== 'myeongha_worker_runtime'
    || config?.executionRole !== 'myeongha_system_executor'
    || config?.databaseTlsPeerMode !== 'verify-full'
    || launch?.command !== 'node scripts/operations/run-official-reader-privacy-purge-worker.mjs'
    || launch?.confirmation !== 'RUN_PRIVATE_READER_REVOCATION_PURGE'
    || launch?.ownerActivationEnvironment !== 'MYEONGHA_READER_PRIVACY_PURGE_ACTIVATION'
    || launch?.ownerActivationValue !== 'PRIVATE_OWNER_MOUNT_READY'
    || !Number.isInteger(launch.batchLimit)
    || launch.batchLimit < 1 || launch.batchLimit > 50
    || !Number.isInteger(launch.pollIntervalSeconds)
    || launch.pollIntervalSeconds < 60 || launch.pollIntervalSeconds > 3600
    || launch.singleProcessSequentialBatches !== true
    || process.env[launch.ownerActivationEnvironment] !== launch.ownerActivationValue
    || config?.gates?.noTemporaryStorageFallback !== true
    || config?.gates?.noDeploymentWithoutMigrationRecovery !== true
    || config?.gates?.noEmissionOfSubjectOrKeyIdentifiers !== true
    || config?.gates?.noPaidReadActivation !== true) unavailable();

const existingWorkerDatabaseEnv = [
  'MYEONGHA_WORKER_DATABASE_URL',
  'MYEONGHA_WORKER_DATABASE_PRINCIPAL',
  'MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE',
  'MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM',
];
const expectedOffPrimaryEnv = [
  'MYEONGHA_READER_PRIVACY_LEDGER_ROOT',
  'MYEONGHA_READER_PRIVACY_KEY_ROOT',
  'MYEONGHA_READER_PRIVACY_LEDGER_SEAL_KEY_B64',
  'MYEONGHA_READER_PRIVACY_KEY_SEAL_KEY_B64',
];
if (!Array.isArray(config.sharedOffPrimaryEnvironment)
    || config.sharedOffPrimaryEnvironment.length !== expectedOffPrimaryEnv.length
    || !expectedOffPrimaryEnv.every(
      (name) => config.sharedOffPrimaryEnvironment.includes(name),
    )
    || ![...existingWorkerDatabaseEnv, ...expectedOffPrimaryEnv,
      'MYEONGHA_READER_PRIVACY_PURGE_WORKER_ID'].every(
      (name) => typeof process.env[name] === 'string'
        && process.env[name].length > 0,
    )) unavailable();

const entry = join(projectRoot, 'scripts/operations/run-official-reader-privacy-purge-worker.mjs');
const compiledRuntime = join(projectRoot, 'dist/apps/api/src/production-account-deletion-worker-runtime.js');
if (!existsSync(entry) || !existsSync(compiledRuntime)) unavailable();

// An activation flag cannot substitute for an installed, least-privilege
// S4 database. Confirm the REAL Worker DB identity, the private off-primary
// mount and the exact deletion RPCs BEFORE spawning a destructive process.
// This preflight uses SELECT against pg_catalog only, on a READ ONLY
// transaction. It never queries protected rows, mutates schema or logs IDs.
const requiredPrivateFunctions = [
  'internal_list_official_reader_paid_answer_purge_jobs_v1(integer)',
  'internal_claim_official_reader_paid_answer_purge_v1(uuid,text)',
  'internal_qry_official_reader_paid_answer_purge_manifest_v1(uuid,text)',
  'internal_commit_official_reader_paid_answer_purge_v1(uuid,text,text,uuid[],text[])',
  'internal_renew_official_reader_paid_answer_purge_lease_v1(uuid,text)',
  'internal_finish_official_reader_paid_answer_purge_v1(uuid,text,text,uuid[])',
  'internal_finish_empty_official_reader_paid_answer_purge_v1(uuid,text)',
  'internal_release_official_reader_paid_answer_purge_v1(uuid,text)',
];
let pool;
try {
  const [dbConfig, dbPool, offPrimaryConfig, offPrimaryStore] = await Promise.all([
    import('../../dist/apps/api/src/production-account-deletion-worker-db-config.js'),
    import('../../dist/apps/api/src/node-postgres-account-deletion-worker-pool.js'),
    import('../../dist/apps/api/src/official-reader-offprimary-worker-config-v1.js'),
    import('../../dist/apps/api/src/official-reader-node-offprimary-privacy-store-v1.js'),
  ]);
  const parsedDb = dbConfig.parseProductionAccountDeletionWorkerDbConfigV1(
    process.env,
  );
  const parsedMount = offPrimaryConfig.parseOfficialReaderOffPrimaryWorkerConfigV1(
    process.env,
  );
  if (parsedMount === null) unavailable();
  offPrimaryStore.createOfficialReaderNodeOffPrimaryStoreV1(parsedMount);
  pool = dbPool.createNodePostgresAccountDeletionWorkerPoolV1(parsedDb);
  const connection = await pool.connect();
  let began = false;
  try {
    await connection.query('BEGIN READ ONLY');
    began = true;
    await connection.query('SET LOCAL ROLE myeongha_system_executor');
    const { rows } = await connection.query(`
      select
        (select c.relrowsecurity and c.relforcerowsecurity
           from pg_catalog.pg_class c
          where c.oid=pg_catalog.to_regclass('public.official_reader_paid_answer_bodies')
        ) as "protectedRls",
        (select c.relrowsecurity and c.relforcerowsecurity
           from pg_catalog.pg_class c
          where c.oid=pg_catalog.to_regclass('public.official_reader_paid_answer_purge_jobs_v1')
        ) as "queueRls"
    `, [requiredPrivateFunctions.map(
      signature => 'public.' + signature,
    ).map(signature => signature)]);
    // A missing function must never be ignored by the count. Use the exact
    // pg_catalog.to_regprocedure for each static signature separately.
    const rpcRows = await connection.query(`
      select
        pg_catalog.to_regprocedure('public.' || sig) is not null as "installed",
        pg_catalog.has_function_privilege(
          current_user, pg_catalog.to_regprocedure('public.' || sig), 'EXECUTE'
        ) as "canExecute"
      from pg_catalog.unnest($1::text[]) as f(sig)
    `, [requiredPrivateFunctions]);
    if (rows.length !== 1
        || rows[0].protectedRls !== true
        || rows[0].queueRls !== true
        || rpcRows.rows.length !== requiredPrivateFunctions.length
        || rpcRows.rows.some(row =>
          row.installed !== true || row.canExecute !== true)) unavailable();
    await connection.query('ROLLBACK');
    began = false;
  } finally {
    if (began) await connection.query('ROLLBACK').catch(() => {});
    connection.release();
  }
} catch {
  unavailable();
} finally {
  if (pool) await pool.close();
}

// No shell or inherited HTTP listener; one child with one sequential loop.
// The child owns bounded DB leases and retry/backoff; this process forwards
// termination and propagates exit status to the existing host supervisor.
const child = spawn(process.execPath, [
  entry,
  '--confirmation', launch.confirmation,
  '--limit', String(launch.batchLimit),
  '--interval-seconds', String(launch.pollIntervalSeconds),
], { cwd: projectRoot, env: process.env, stdio: 'inherit', shell: false });

const onTerm = () => { if (!child.killed) child.kill('SIGTERM'); };
const onInt = () => { if (!child.killed) child.kill('SIGINT'); };
process.on('SIGTERM', onTerm);
process.on('SIGINT', onInt);

let status;
try {
  status = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
} finally {
  process.off('SIGTERM', onTerm);
  process.off('SIGINT', onInt);
}
process.exitCode = status.code ?? (status.signal ? 1 : 0);
