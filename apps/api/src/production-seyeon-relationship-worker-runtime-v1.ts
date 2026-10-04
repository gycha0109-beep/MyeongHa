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
