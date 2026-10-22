import {
  runClaimedAccountDeletionWorkerV1,
  type RunClaimedAccountDeletionWorkerResultV1,
} from './account-deletion-worker-orchestration.js';
import {
  createPostgresAccountDeletionWorkerPortsV1,
  type AccountDeletionWorkerClaimResultV1,
  type PostgresAccountDeletionWorkerPortsV1,
} from './postgres-account-deletion-worker.js';
import { createNodePostgresAccountDeletionWorkerPoolV1 } from './node-postgres-account-deletion-worker-pool.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createOfficialReaderAccountPrivacyDeletionPortV1,
  type OfficialReaderAccountPrivacyDeletionPortV1,
} from './official-reader-private-account-deletion-lifecycle-v1.js';
import {
  createOfficialReaderNodeOffPrimaryStoreV1,
  type OfficialReaderOffPrimaryStoreConfigV1,
} from './official-reader-node-offprimary-privacy-store-v1.js';
import {
  parseOfficialReaderOffPrimaryWorkerConfigV1,
} from './official-reader-offprimary-worker-config-v1.js';
import {
  runOfficialReaderPrivateRevocationPurgeBatchV1,
  type OfficialReaderPrivateRevocationPurgeBatchResultV1,
} from './official-reader-private-revocation-purge-worker-v1.js';
import type { ProductionAccountDeletionAuthAdminConfigV1 } from './production-account-deletion-auth-admin-config.js';
import type { ProductionAccountDeletionWorkerDbConfigV1 } from './production-account-deletion-worker-db-config.js';
import {
  createSupabaseAuthAdminUserDeletionAdapterV1,
  type SupabaseAuthAdminUserDeletionPortV1,
} from './supabase-auth-admin-user-deletion.js';

export const ACCOUNT_DELETION_WORKER_RUNTIME_BINDINGS_V1 = Object.freeze({
  publicRoute: null,
  routeMounted: false,
  browserAuthority: false,
  ownsBatchDiscovery: false,
  ownsRetryPolicy: false,
  claimCommitsBeforeProviderIo: true,
} as const);

export interface RunAccountDeletionOutboxEventInputV1 {
  readonly outboxEventId: string;
  readonly lockOwner: string;
  readonly leaseExpiresAt: string;
}

export interface RunAccountDeletionOutboxEventResultV1 {
  readonly claim: AccountDeletionWorkerClaimResultV1;
  readonly worker: RunClaimedAccountDeletionWorkerResultV1;
}

export interface AccountDeletionWorkerRuntimeV1 {
  run(
    input: RunAccountDeletionOutboxEventInputV1,
  ): Promise<RunAccountDeletionOutboxEventResultV1>;
}

export function createAccountDeletionWorkerRuntimeV1(input: {
  readonly ports: PostgresAccountDeletionWorkerPortsV1;
  readonly authDeletionPort: SupabaseAuthAdminUserDeletionPortV1;
  /** Only an installed off-primary ledger + key owner may enable the S4 branch. */
  readonly readerPrivacyDeletionPort?: OfficialReaderAccountPrivacyDeletionPortV1;
}): AccountDeletionWorkerRuntimeV1 {
  return Object.freeze({
    async run(runInput: RunAccountDeletionOutboxEventInputV1) {
      const claim = await input.ports.claimPort.claimEvent(runInput);

      const worker = await runClaimedAccountDeletionWorkerV1({
        subjectId: claim.subjectId,
        deletionJobId: claim.deletionJobId,
        lockOwner: runInput.lockOwner,
        resumeStatePort: input.ports.resumeStatePort,
        dbFinalizerPort: input.ports.dbFinalizerPort,
        authDeletionPort: input.authDeletionPort,
        completionPort: input.ports.completionPort,
        // A missing Privacy provider cannot skip a pending key-erasure job.
        // Legacy databases without Reader tables return an empty manifest.
        readerPrivacyStatePort: input.ports.readerPrivacyStatePort,
        ...(input.readerPrivacyDeletionPort === undefined
          ? {} : { readerPrivacyDeletionPort: input.readerPrivacyDeletionPort }),
      });

      return Object.freeze({ claim, worker });
    },
  });
}

export function createAccountDeletionWorkerRuntimeFromPoolV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly authDeletionPort: SupabaseAuthAdminUserDeletionPortV1;
  readonly readerPrivacyDeletionPort?: OfficialReaderAccountPrivacyDeletionPortV1;
}): AccountDeletionWorkerRuntimeV1 {
  return createAccountDeletionWorkerRuntimeV1({
    ports: createPostgresAccountDeletionWorkerPortsV1({ pool: input.pool }),
    authDeletionPort: input.authDeletionPort,
    ...(input.readerPrivacyDeletionPort === undefined
      ? {}
      : { readerPrivacyDeletionPort: input.readerPrivacyDeletionPort }),
  });
}

export interface ProductionAccountDeletionWorkerRuntimeLeaseV1 {
  readonly runtime: AccountDeletionWorkerRuntimeV1;
  /**
   * Uses the EXACT same governed Worker DB pool and independently mounted
   * private Privacy store as account deletion. No browser/Commerce authority.
   */
  runReaderRevocationPurgeBatch(input: Readonly<{
    workerId: string;
    limit: number;
  }>): Promise<OfficialReaderPrivateRevocationPurgeBatchResultV1>;
  close(): Promise<void>;
}

export function createProductionAccountDeletionWorkerRuntimeV1(input: {
  readonly databaseConfig: ProductionAccountDeletionWorkerDbConfigV1;
  readonly authAdminConfig: ProductionAccountDeletionAuthAdminConfigV1;
  /** Explicit dedicated mount inputs; never default to temp or Postgres. */
  readonly readerOffPrimaryStoreConfig?: OfficialReaderOffPrimaryStoreConfigV1;
  /** Optional owner-injected independent deletion provider (not combined with filesystem mode). */
  readonly readerPrivacyDeletionPort?: OfficialReaderAccountPrivacyDeletionPortV1;
}): ProductionAccountDeletionWorkerRuntimeLeaseV1 {
  if (input.readerPrivacyDeletionPort !== undefined
      && input.readerOffPrimaryStoreConfig !== undefined) {
    throw new Error('Protected Reader deletion can use only one Privacy provider.');
  }
  // Construct off-primary ports only when durable, owner-provisioned mount
  // configuration was passed. Missing/wrong roots refuse to start; there is
  // deliberately no /tmp or backed-up DB fallback.
  const offPrimaryConfig = input.readerOffPrimaryStoreConfig
    ?? parseOfficialReaderOffPrimaryWorkerConfigV1(process.env);
  const offPrimary = offPrimaryConfig === null
    ? null
    : createOfficialReaderNodeOffPrimaryStoreV1(offPrimaryConfig);
  const readerPrivacyDeletionPort = input.readerPrivacyDeletionPort
    ?? (offPrimary === null ? undefined
      : createOfficialReaderAccountPrivacyDeletionPortV1({
          ledger: offPrimary.ledger,
          keys: offPrimary.keys,
        }));
  const pool = createNodePostgresAccountDeletionWorkerPoolV1(input.databaseConfig);
  const authDeletionPort = createSupabaseAuthAdminUserDeletionAdapterV1({
    supabaseOrigin: input.authAdminConfig.supabaseOrigin,
    adminSecret: input.authAdminConfig.adminSecret,
  });

  return Object.freeze({
    runtime: createAccountDeletionWorkerRuntimeFromPoolV1({
      pool,
      authDeletionPort,
      ...(readerPrivacyDeletionPort === undefined
        ? {} : { readerPrivacyDeletionPort }),
    }),
    runReaderRevocationPurgeBatch(purgeInput: Parameters<ProductionAccountDeletionWorkerRuntimeLeaseV1['runReaderRevocationPurgeBatch']>[0]) {
      if (offPrimary === null) {
        throw new Error('Reader revocation Privacy store is unavailable.');
      }
      return runOfficialReaderPrivateRevocationPurgeBatchV1({
        pool,
        store: offPrimary,
        workerId: purgeInput.workerId,
        limit: purgeInput.limit,
      });
    },
    close() {
      return pool.close();
    },
  });
}

/**
 * Standalone runtime for the SAME private production Worker execution
 * identity without an unnecessary hosted Auth-admin secret. It shares
 * DB principal, TLS enforcement, off-primary configuration and S4 job
 * processor with createProductionAccountDeletionWorkerRuntimeV1.
 */
export interface ProductionReaderPrivacyMaintenanceRuntimeLeaseV1 {
  runReaderRevocationPurgeBatch(input: Readonly<{
    workerId: string;
    limit: number;
  }>): Promise<OfficialReaderPrivateRevocationPurgeBatchResultV1>;
  close(): Promise<void>;
}

export function createProductionReaderPrivacyMaintenanceRuntimeV1(input: {
  readonly databaseConfig: ProductionAccountDeletionWorkerDbConfigV1;
  readonly readerOffPrimaryStoreConfig?: OfficialReaderOffPrimaryStoreConfigV1;
}): ProductionReaderPrivacyMaintenanceRuntimeLeaseV1 {
  const offPrimaryConfig = input.readerOffPrimaryStoreConfig
    ?? parseOfficialReaderOffPrimaryWorkerConfigV1(process.env);
  if (offPrimaryConfig === null) {
    throw new Error('Reader revocation Privacy store is unavailable.');
  }
  const offPrimary = createOfficialReaderNodeOffPrimaryStoreV1(offPrimaryConfig);
  const pool = createNodePostgresAccountDeletionWorkerPoolV1(input.databaseConfig);
  return Object.freeze({
    runReaderRevocationPurgeBatch(purgeInput: Parameters<ProductionAccountDeletionWorkerRuntimeLeaseV1['runReaderRevocationPurgeBatch']>[0]) {
      return runOfficialReaderPrivateRevocationPurgeBatchV1({
        pool,
        store: offPrimary,
        workerId: purgeInput.workerId,
        limit: purgeInput.limit,
      });
    },
    close() { return pool.close(); },
  });
}
