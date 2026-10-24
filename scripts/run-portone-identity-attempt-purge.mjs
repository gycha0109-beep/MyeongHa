// One explicitly operator-authorized batch; never scheduled, never public.
// No phone/name/CI/DI/birthDate/provider response is returned or logged.
const CONFIRM = 'PURGE_EXPIRED_PORTONE_IDENTITY_ATTEMPTS_ONE_BATCH';
const REQUIRED_APPLIED = 'APPROVED_AND_APPLIED';

function stop(reason) {
  throw new Error('PortOne identity attempt purge blocked: ' + reason);
}

async function main() {
  if (process.env.MYEONGHA_PORTONE_IDENTITY_PURGE_CONFIRM !== CONFIRM) {
    stop('explicit one-time confirmation missing');
  }
  if (process.env.MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE !== REQUIRED_APPLIED) {
    stop('approved and applied database migration evidence required');
  }
  const rawLimit = process.env.MYEONGHA_PORTONE_IDENTITY_PURGE_LIMIT;
  if (!rawLimit || !/^(?:[1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|250)$/.test(rawLimit)) {
    stop('batch limit must be explicitly set to an integer in 1..250');
  }
  const limit = Number(rawLimit);
  const [
    { parseProductionAccountDeletionWorkerDbConfigV1 },
    { createNodePostgresAccountDeletionWorkerPoolV1 },
    { createPostgresPortOneIdentityAttemptPurgePortV1 },
  ] = await Promise.all([
    import('../dist/apps/api/src/production-account-deletion-worker-db-config.js'),
    import('../dist/apps/api/src/node-postgres-account-deletion-worker-pool.js'),
    import('../dist/apps/api/src/postgres-portone-identity-attempt-purge-v1.js'),
  ]);

  // Reuse the existing worker's dedicated login role, strict verify-full TLS
  // peer check and transaction-local myeongha_system_executor execution role.
  const config = parseProductionAccountDeletionWorkerDbConfigV1(process.env);
  const pool = createNodePostgresAccountDeletionWorkerPoolV1(config);
  try {
    const removed = await createPostgresPortOneIdentityAttemptPurgePortV1(pool)
      .purgeExpiredAttempts(limit);
    console.log(JSON.stringify({
      result: 'PORTONE_IDENTITY_EXPIRED_ATTEMPTS_PURGED',
      removed,
      maximumBatch: limit,
      scheduled: false,
    }));
  } finally {
    await pool.close();
  }
}

main().catch(() => {
  // Never include connection strings, provider IDs or privileged error bodies.
  console.error('PORTONE_IDENTITY_ATTEMPT_PURGE_BLOCKED_OR_FAILED');
  process.exitCode = 1;
});
