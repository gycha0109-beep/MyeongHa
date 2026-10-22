#!/usr/bin/env node
// Dedicated internal Reader privacy cleanup Worker. Never invoked by a
// PortOne webhook HTTP request. Repeat from an existing dedicated Worker
// scheduler to drain persisted 2050 Entitlement-revocation purge jobs.
// No automatic public service activation, refund mutation or CI execution.

import { randomUUID } from 'node:crypto';

const CONFIRM = 'RUN_PRIVATE_READER_REVOCATION_PURGE';

function unavailable() {
  throw new Error('Official Reader protected cleanup Worker is unavailable.');
}

const argumentsList = process.argv.slice(2);
// A single invocation is suitable for the existing governed Worker queue
// scheduler; explicit --loop lets the SAME dedicated Worker process drain
// jobs on a bounded interval without GitHub Actions/CI and without overlap.
// No schedule starts from importing this module.
const loop = argumentsList.length === 6;
if ((argumentsList.length !== 4 && !loop)
    || argumentsList[0] !== '--confirmation'
    || argumentsList[1] !== CONFIRM
    || argumentsList[2] !== '--limit'
    || !/^(?:[1-9]|[1-4][0-9]|50)$/u.test(argumentsList[3] ?? '')
    || (loop && (argumentsList[4] !== '--interval-seconds'
      || !/^[0-9]{2,4}$/u.test(argumentsList[5] ?? '')))) {
  unavailable();
}
const limit = Number(argumentsList[3]);
const intervalSeconds = loop ? Number(argumentsList[5]) : null;
if (intervalSeconds !== null
    && (!Number.isSafeInteger(intervalSeconds)
      || intervalSeconds < 60 || intervalSeconds > 3600)) unavailable();
const workerId = process.env.MYEONGHA_READER_PRIVACY_PURGE_WORKER_ID;
if (typeof workerId !== 'string' || !/^[a-zA-Z0-9_.:-]{8,128}$/u.test(workerId)) {
  unavailable();
}
// Each process incarnation must have a distinct claim owner. Otherwise a
// previous hung process can still finalize a lease reclaimed by a new process
// with the same configured stable Worker name.
const executionWorkerId = workerId + ':' + randomUUID();

// Reuse the existing account-deletion Worker DB identity and private
// off-primary storage factory. No separate Postgres configuration, elevated
// Commerce role or new key storage is introduced.
const [dbConfig, workerRuntime] = await Promise.all([
  import('../../dist/apps/api/src/production-account-deletion-worker-db-config.js'),
  import('../../dist/apps/api/src/production-account-deletion-worker-runtime.js'),
]);
const databaseConfig =
  dbConfig.parseProductionAccountDeletionWorkerDbConfigV1(process.env);
const runtime = workerRuntime.createProductionReaderPrivacyMaintenanceRuntimeV1({
  databaseConfig,
});

let stopRequested = false;
let wakeSleep = null;
function requestStop() {
  stopRequested = true;
  wakeSleep?.();
}
process.on('SIGTERM', requestStop);
process.on('SIGINT', requestStop);

async function runOnce() {
  const report = await runtime.runReaderRevocationPurgeBatch({
    workerId: executionWorkerId, limit,
  });
  if (report.publicPaidReadEnabled !== false) unavailable();
  // Only totals, never Subject/Reader/Reading/Receipt/key/body identities.
  process.stdout.write(JSON.stringify(report) + '\n');
}

function sleepForInterval(seconds) {
  return new Promise(resolve => {
    if (stopRequested) return resolve();
    const timer = setTimeout(() => {
      wakeSleep = null;
      resolve();
    }, seconds * 1000);
    wakeSleep = () => {
      clearTimeout(timer);
      wakeSleep = null;
      resolve();
    };
  });
}

try {
  do {
    // One batch at a time. A Worker crash leaves its DB lease reclaimable
    // after 15 minutes, and the off-primary immutable fence remains durable.
    await runOnce();
    if (intervalSeconds !== null && !stopRequested) {
      await sleepForInterval(intervalSeconds);
    }
  } while (intervalSeconds !== null && !stopRequested);
} catch {
  // Error messages may contain DB details; do not emit raw SQL parameters,
  // Subject IDs, key references or protected ciphertext in scheduler logs.
  process.stderr.write('Reader private purge failed; pending jobs remain retryable.\n');
  process.exitCode = 1;
} finally {
  process.off('SIGTERM', requestStop);
  process.off('SIGINT', requestStop);
  await runtime.close();
}
