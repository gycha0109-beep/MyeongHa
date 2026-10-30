import type {
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  createPostgresProductionRelationshipApplyPortV1,
} from './postgres-production-relationship-event-apply-v1.js';
import {
  createPostgresSeyeonProductionRelationshipSyncOutboxPortV1,
} from './postgres-seyeon-production-relationship-outbox-v1.js';
import {
  createProductionPostgresSubjectPoolLeaseV1,
} from './production-postgres-subject-pool-lease.js';
import type {
  ProductionUserDataRuntimeConfigV1,
} from './production-user-data-runtime-config.js';
import {
  processSeyeonProductionRelationshipSyncOutboxV1,
  type ProcessSeyeonProductionRelationshipSyncOutboxResultV1,
} from './seyeon-production-relationship-outbox-v1.js';
import {
  createSeyeonProductionRuntimeIdPortV1,
} from './seyeon-production-runtime-ids-v1.js';
import {
  createSeyeonProductionSubjectTransactionRunnerV1,
} from './seyeon-production-subject-transaction-v1.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const PRODUCTION_SEYEON_RELATIONSHIP_WORKER_RUNTIME_VERSION_V1 =
  'production-seyeon-relationship-worker-runtime-v1' as const;

/**
 * G3: queued relationship Events may contain prior personal/derived sources.
 * Neither event.authority nor a valid Outbox lease proves that the original
 * Grant and each derived origin are still valid at apply time.
 */
export class SeyeonRelationshipSyncSourceAuthorityHoldV1 extends Error {
  readonly code = 'SEYEON_RELATIONSHIP_SYNC_SOURCE_AUTHORITY_HOLD' as const;
  constructor() {
    super('Relationship sync requires current original Grant and derived-source authorization.');
    this.name = 'SeyeonRelationshipSyncSourceAuthorityHoldV1';
  }
}

/** Production cannot consume historical relationship Outbox material until
 * a DB-owner current-original-Grant + derived-lineage gate is connected.
 */
export function assertSeyeonRelationshipSyncCurrentSourceAuthorityV1(): void {
  throw new SeyeonRelationshipSyncSourceAuthorityHoldV1();
}

export interface RunProductionSeyeonRelationshipWorkerInputV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly outboxEventId: string;
  readonly lockOwner: string;
  readonly leaseExpiresAt: string;
}

export interface RunProductionSeyeonRelationshipWorkerResultV1 {
  readonly runtimeVersion:
    typeof PRODUCTION_SEYEON_RELATIONSHIP_WORKER_RUNTIME_VERSION_V1;
  readonly subjectId: string;
  readonly result: ProcessSeyeonProductionRelationshipSyncOutboxResultV1;
}

export interface ProductionSeyeonRelationshipWorkerRuntimeV1 {
  run(
    input: RunProductionSeyeonRelationshipWorkerInputV1,
  ): Promise<RunProductionSeyeonRelationshipWorkerResultV1>;
  close(): Promise<void>;
}

export interface CreateProductionSeyeonRelationshipWorkerRuntimeInputV1 {
  readonly databaseConfig: ProductionUserDataRuntimeConfigV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly createUuid?: () => string;
}

export function createProductionSeyeonRelationshipWorkerRuntimeV1(
  input: CreateProductionSeyeonRelationshipWorkerRuntimeInputV1,
): ProductionSeyeonRelationshipWorkerRuntimeV1 {
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config: input.databaseConfig,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const idPort = createSeyeonProductionRuntimeIdPortV1(
    input.createUuid,
  );

  return Object.freeze({
    async run(
      runInput: RunProductionSeyeonRelationshipWorkerInputV1,
    ): Promise<RunProductionSeyeonRelationshipWorkerResultV1> {
      // No claim, payload read, relationship-state lock or apply is permitted
      // merely because an old Event was enqueued before Grant revocation.
      // This also closes queued legacy Events created before the Post-turn HOLD.
      assertSeyeonRelationshipSyncCurrentSourceAuthorityV1();
      const runner =
        createSeyeonProductionSubjectTransactionRunnerV1({
          pool: poolLease.pool,
          verifiedEvidence: runInput.verifiedEvidence,
        });
      const resolvedSubject = await runner.resolveSubject();

      const result = await runner.run(
        resolvedSubject.subjectId,
        async (client) => {
          const outboxPort =
            createPostgresSeyeonProductionRelationshipSyncOutboxPortV1(
              client,
            );
          const applyPort =
            createPostgresProductionRelationshipApplyPortV1(client);

          return processSeyeonProductionRelationshipSyncOutboxV1({
            subjectId: resolvedSubject.subjectId,
            outboxEventId: runInput.outboxEventId,
            lockOwner: runInput.lockOwner,
            leaseExpiresAt: runInput.leaseExpiresAt,
            outboxPort,
            idPort,
            contextPort: applyPort,
            commitPort: applyPort,
          });
        },
      );

      return Object.freeze({
        runtimeVersion:
          PRODUCTION_SEYEON_RELATIONSHIP_WORKER_RUNTIME_VERSION_V1,
        subjectId: resolvedSubject.subjectId,
        result,
      });
    },

    close() {
      return poolLease.close();
    },
  });
}
