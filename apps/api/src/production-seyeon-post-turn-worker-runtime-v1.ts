import {
  createPersistingSeyeonAiProviderV1,
  type SeyeonAiCostLedgerBindingV1,
  type SeyeonAiGovernorAdmissionV1,
} from './postgres-seyeon-ai-cost-ledger-v1.js';
import {
  createOpenAiSeyeonStructuredProviderV1,
  type OpenAiSeyeonStructuredProviderConfigV1,
} from './openai-seyeon-structured-provider-v1.js';
import type {
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  createProductionPostgresSubjectPoolLeaseV1,
} from './production-postgres-subject-pool-lease.js';
import type {
  ProductionUserDataRuntimeConfigV1,
} from './production-user-data-runtime-config.js';
import {
  processSeyeonPostTurnAnalysisV1,
  type ProcessSeyeonPostTurnAnalysisResultV1,
} from './seyeon-post-turn-analysis-worker-v1.js';
import {
  createSeyeonProductionSubjectTransactionRunnerV1,
} from './seyeon-production-subject-transaction-v1.js';
import {
  createSeyeonProductionTransactionalPortsV1,
} from './seyeon-production-transactional-ports-v1.js';
import type {
  SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const PRODUCTION_SEYEON_POST_TURN_WORKER_RUNTIME_VERSION_V1 =
  'production-seyeon-post-turn-worker-runtime-v1' as const;

export interface RunProductionSeyeonPostTurnWorkerInputV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly outboxEventId: string;
  readonly lockOwner: string;
  readonly leaseExpiresAt: string;
}

export interface RunProductionSeyeonPostTurnWorkerResultV1 {
  readonly runtimeVersion:
    typeof PRODUCTION_SEYEON_POST_TURN_WORKER_RUNTIME_VERSION_V1;
  readonly subjectId: string;
  readonly result: ProcessSeyeonPostTurnAnalysisResultV1;
}

export interface ProductionSeyeonPostTurnWorkerRuntimeV1 {
  run(
    input: RunProductionSeyeonPostTurnWorkerInputV1,
  ): Promise<RunProductionSeyeonPostTurnWorkerResultV1>;
  close(): Promise<void>;
}

export interface CreateProductionSeyeonPostTurnWorkerRuntimeInputV1 {
  readonly databaseConfig: ProductionUserDataRuntimeConfigV1;
  readonly providerConfig?: OpenAiSeyeonStructuredProviderConfigV1;
  readonly provider?: SeyeonStructuredProviderPortV2;
  /** Explicit server-only, absent by default. */
  readonly costGovernor?: SeyeonAiGovernorAdmissionV1;
  readonly pool?: PostgresSubjectPoolV1;
}

function resolveProvider(
  input: CreateProductionSeyeonPostTurnWorkerRuntimeInputV1,
): SeyeonStructuredProviderPortV2 {
  if (input.provider !== undefined) return input.provider;
  if (input.providerConfig === undefined) {
    throw new Error(
      'Production Se-yeon post-turn worker requires a server-owned structured provider.',
    );
  }
  return createOpenAiSeyeonStructuredProviderV1(input.providerConfig);
}

export function createProductionSeyeonPostTurnWorkerRuntimeV1(
  input: CreateProductionSeyeonPostTurnWorkerRuntimeInputV1,
): ProductionSeyeonPostTurnWorkerRuntimeV1 {
  if (input.costGovernor !== undefined &&
      (input.provider !== undefined || input.providerConfig === undefined)) {
    throw new Error('Governed post-turn requires native metered Provider config.');
  }
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config: input.databaseConfig,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const provider = resolveProvider(input);

  return Object.freeze({
    async run(
      runInput: RunProductionSeyeonPostTurnWorkerInputV1,
    ): Promise<RunProductionSeyeonPostTurnWorkerResultV1> {
      const runner =
        createSeyeonProductionSubjectTransactionRunnerV1({
          pool: poolLease.pool,
          verifiedEvidence: runInput.verifiedEvidence,
        });
      const resolvedSubject = await runner.resolveSubject();
      const ports = createSeyeonProductionTransactionalPortsV1({
        subjectId: resolvedSubject.subjectId,
        runner,
      });

      let activeCostBinding: SeyeonAiCostLedgerBindingV1 | null = null;
      const meteredOutbox = Object.freeze({
        ...ports.postTurnAnalysis,
        async claim(
          request: Parameters<typeof ports.postTurnAnalysis.claim>[0],
        ) {
          const rows = await ports.postTurnAnalysis.claim(request);
          const claim = rows[0];
          if (claim !== undefined) {
            activeCostBinding = Object.freeze({
              subjectId: resolvedSubject.subjectId,
              turnId: claim.turnId,
              attemptId: claim.attemptId,
              phase: 'post_turn' as const,
            });
          }
          return rows;
        },
      });
      const meteredProvider =
        input.provider === undefined && input.providerConfig !== undefined
          ? createPersistingSeyeonAiProviderV1({
              config: input.providerConfig,
              runner,
              getBinding: () => activeCostBinding,
              ...(input.costGovernor === undefined ? {} : {
                governor: input.costGovernor,
              }),
            })
          : provider;

      const result = await processSeyeonPostTurnAnalysisV1({
        subjectId: resolvedSubject.subjectId,
        outboxEventId: runInput.outboxEventId,
        lockOwner: runInput.lockOwner,
        leaseExpiresAt: runInput.leaseExpiresAt,
        outboxPort: meteredOutbox,
        extractorProvider: meteredProvider,
        relationshipSyncOutboxPort:
          ports.relationshipSyncOutbox,
      });

      return Object.freeze({
        runtimeVersion:
          PRODUCTION_SEYEON_POST_TURN_WORKER_RUNTIME_VERSION_V1,
        subjectId: resolvedSubject.subjectId,
        result,
      });
    },

    close() {
      return poolLease.close();
    },
  });
}
