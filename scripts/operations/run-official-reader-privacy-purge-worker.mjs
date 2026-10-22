#!/usr/bin/env node
// Dedicated internal Reader privacy cleanup Worker. Never invoked by a
// PortOne webhook HTTP request. Repeat from an existing dedicated Worker
// scheduler to drain persisted 2050 Entitlement-revocation purge jobs.
// No automatic public service activation, refund mutation or CI execution.

const CONFIRM = 'RUN_PRIVATE_READER_REVOCATION_PURGE';

function unavailable() {
  throw new Error('Official Reader protected cleanup Worker is unavailable.');
}

const argumentsList = process.argv.slice(2);
if (argumentsList.length !== 4
    || argumentsList[0] !== '--confirmation'
    || argumentsList[1] !== CONFIRM
    || argumentsList[2] !== '--limit'
    || !/^(?:[1-9]|[1-4][0-9]|50)$/u.test(argumentsList[3] ?? '')) {
  unavailable();
}
const limit = Number(argumentsList[3]);
const workerId = process.env.MYEONGHA_READER_PRIVACY_PURGE_WORKER_ID;
if (typeof workerId !== 'string' || !/^[a-zA-Z0-9_.:-]{8,128}$/u.test(workerId)) {
  unavailable();
}

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

try {
  const report = await runtime.runReaderRevocationPurgeBatch({
    workerId, limit,
  });
  if (report.publicPaidReadEnabled !== false) unavailable();
  // Only totals, never Subject/Reader/Reading/Receipt/key/body identities.
  process.stdout.write(JSON.stringify(report) + '\n');
} finally {
  await runtime.close();
}
