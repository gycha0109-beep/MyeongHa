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
