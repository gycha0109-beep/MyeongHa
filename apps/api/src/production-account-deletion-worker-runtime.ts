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
import type {
  OfficialReaderAccountPrivacyDeletionPortV1,
} from './official-reader-private-account-deletion-lifecycle-v1.js';
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
  close(): Promise<void>;
}

export function createProductionAccountDeletionWorkerRuntimeV1(input: {
  readonly databaseConfig: ProductionAccountDeletionWorkerDbConfigV1;
  readonly authAdminConfig: ProductionAccountDeletionAuthAdminConfigV1;
  /** Not supplied until an independently durable Privacy ledger is installed. */
  readonly readerPrivacyDeletionPort?: OfficialReaderAccountPrivacyDeletionPortV1;
}): ProductionAccountDeletionWorkerRuntimeLeaseV1 {
  const pool = createNodePostgresAccountDeletionWorkerPoolV1(input.databaseConfig);
  const authDeletionPort = createSupabaseAuthAdminUserDeletionAdapterV1({
    supabaseOrigin: input.authAdminConfig.supabaseOrigin,
    adminSecret: input.authAdminConfig.adminSecret,
  });

  return Object.freeze({
    runtime: createAccountDeletionWorkerRuntimeFromPoolV1({
      pool,
      authDeletionPort,
      ...(input.readerPrivacyDeletionPort === undefined
        ? {}
        : { readerPrivacyDeletionPort: input.readerPrivacyDeletionPort }),
    }),
    close() {
      return pool.close();
    },
  });
}
