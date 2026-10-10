import {
  assertSeyeonProductionGovernorBoundaryV1,
  type SeyeonProductionGovernorModeV1,
} from './seyeon-production-governor-boundary-v1.js';
import {
  createPersistingSeyeonAiProviderV1,
  type SeyeonAiCostLedgerBindingV1,
  type SeyeonAiGovernorAdmissionV1,
} from './postgres-seyeon-ai-cost-ledger-v1.js';
import {
  InMemorySeyeonEventLedgerV2,
  type CharacterClientCompatibilityProfileV1,
} from '../../../packages/domain/src/index.js';
import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingV1,
} from './chat-thread-runtime-binding-read.js';
import {
  getContentBundleManifest,
  type ContentBundleManifestReadResponseV1,
} from './content-bundle-manifest-read.js';
import {
  prepareInternalPinnedSeyeonDogfoodReceivePlanV1,
  prepareServerCompatiblePinnedSeyeonReceivePlanV1,
} from './chat-receive.js';
import {
  assertSeyeonPublicContentCompatibilityV1,
} from './seyeon-public-content-compatibility-v1.js';
import {
  createOpenAiSeyeonStructuredProviderV1,
  OpenAiSeyeonStructuredProviderErrorV1,
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
  runSeyeonProductionChatExecutionV1,
  type RunSeyeonProductionChatExecutionResultV1,
} from './seyeon-production-chat-execution-v1.js';
import {
  createSeyeonProductionGovernanceV1,
} from './seyeon-production-governance-v1.js';
import {
  createSeyeonProductionRuntimeIdPortV1,
} from './seyeon-production-runtime-ids-v1.js';
import {
  createSeyeonProductionSubjectTransactionRunnerV1,
} from './seyeon-production-subject-transaction-v1.js';
import {
  createSeyeonGovernedCostTransactionRunnerV1,
} from './seyeon-governed-cost-transaction-v1.js';
import type {
  SeyeonGovernedDbConfigV1,
  SeyeonGovernedPostgresSubjectPoolV1,
} from './seyeon-governed-postgres-pool-v1.js';
import {
  createSeyeonProductionCostPoolLeaseV1,
} from './seyeon-production-cost-pool-lease-v1.js';
import {
  createSeyeonProductionTransactionalPortsV1,
} from './seyeon-production-transactional-ports-v1.js';
import {
  SeyeonCharacterRuntimeErrorV2,
  type SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const PRODUCTION_SEYEON_CHAT_RUNTIME_VERSION_V1 =
  'production-seyeon-chat-runtime-v1' as const;

export const PRODUCTION_SEYEON_CHAT_RUNTIME_BINDINGS_V1 = Object.freeze({
  publicRoute: null,
  routeMounted: false,
  browserAuthority: false,
  relationshipMode: 'WRITE_DARK',
  postTurnExecution: 'DEFERRED',
  clientCompatibilityVerdict: false,
  existingSingleCharacterThreadRequired: true,
} as const);

export interface RunProductionSeyeonChatInputV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly threadId: string;
  readonly clientTurnId: string;
  readonly text: string;
}

export interface RunProductionSeyeonChatResultV1 {
  readonly runtimeVersion: typeof PRODUCTION_SEYEON_CHAT_RUNTIME_VERSION_V1;
  readonly subjectId: string;
  readonly threadBinding: ChatThreadRuntimeBindingV1;
  readonly bundleManifest: ContentBundleManifestReadResponseV1;
  readonly execution: RunSeyeonProductionChatExecutionResultV1;
}

export interface ProductionSeyeonChatRuntimeV1 {
  run(input: RunProductionSeyeonChatInputV1):
    Promise<RunProductionSeyeonChatResultV1>;
  close(): Promise<void>;
}

export interface SeyeonProductionRoleProviderConfigsV1 {
  readonly preflight?: OpenAiSeyeonStructuredProviderConfigV1;
  readonly interpreter?: OpenAiSeyeonStructuredProviderConfigV1;
  readonly renderer?: OpenAiSeyeonStructuredProviderConfigV1;
  readonly reviewer?: OpenAiSeyeonStructuredProviderConfigV1;
}

export interface CreateProductionSeyeonChatRuntimeInputV1 {
  readonly databaseConfig: ProductionUserDataRuntimeConfigV1;
  readonly providerConfig?: OpenAiSeyeonStructuredProviderConfigV1;
  readonly roleProviderConfigs?: SeyeonProductionRoleProviderConfigsV1;
  /** Default OFF: no Production Governor activation in D3A. */
  readonly governorMode?: SeyeonProductionGovernorModeV1;
  /** Explicit server-only opt-in: each native role must receive a certified cap. */
  readonly costGovernorForRole?: (
    role: keyof SeyeonProductionRoleProviderConfigsV1,
    config: OpenAiSeyeonStructuredProviderConfigV1,
  ) => SeyeonAiGovernorAdmissionV1;
  readonly provider?: SeyeonStructuredProviderPortV2;
  readonly pool?: PostgresSubjectPoolV1;
  /** ENFORCE-only segregated DB credentials, never the ordinary Subject Pool. */
  readonly governedDbConfig?: SeyeonGovernedDbConfigV1;
  /** Server-owned test seam; not accepted from HTTP request input. */
  readonly governedCostPool?: SeyeonGovernedPostgresSubjectPoolV1;
  readonly createUuid?: () => string;
  /** Server-owned public Web compatibility authority. Never derived from a request. */
  readonly clientCompatibilityProfile?: CharacterClientCompatibilityProfileV1;
}

function text(value: string, path: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new Error(
      'Production Se-yeon Chat ' + path +
      ' must be non-empty text within ' + max + ' characters.',
    );
  }
  return normalized;
}

function resolveProvider(
  input: CreateProductionSeyeonChatRuntimeInputV1,
): SeyeonStructuredProviderPortV2 {
  if (input.provider !== undefined) return input.provider;
  if (input.providerConfig === undefined) {
    throw new Error(
      'Production Se-yeon Chat requires a server-owned structured provider.',
    );
  }
  return createOpenAiSeyeonStructuredProviderV1(input.providerConfig);
}

function assertDogfoodThread(
  binding: ChatThreadRuntimeBindingV1,
): void {
  if (
    binding.participantCharacterIds.length !== 1 ||
    binding.participantCharacterIds[0] !== 'seyeon'
  ) {
    throw new Error(
      'Production Se-yeon dogfood requires an owned active single-character Se-yeon thread.',
    );
  }
}

function assertBundleContainsSeyeon(
  manifest: ContentBundleManifestReadResponseV1,
): void {
  if (!manifest.manifest.characterIds.includes('seyeon')) {
    throw new Error(
      'Pinned content bundle does not contain Se-yeon.',
    );
  }
}



type SeyeonTurnRuntimePhaseV1 =
  | 'subject_resolution'
  | 'thread_binding'
  | 'content_manifest'
  | 'chat_execution';

async function runSeyeonTurnRuntimePhaseV1<T>(
  stage: SeyeonTurnRuntimePhaseV1,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await action();
  } catch (error) {
    const rawCode = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : null;
    const sqlState = typeof rawCode === 'string' && /^[A-Z0-9]{5}$/u.test(rawCode)
      ? rawCode
      : null;
    const runtimeStage =
      error instanceof SeyeonCharacterRuntimeErrorV2 ? error.stage : null;
    const providerCause =
      error instanceof SeyeonCharacterRuntimeErrorV2 &&
      error.cause instanceof OpenAiSeyeonStructuredProviderErrorV1
        ? error.cause
        : null;
    console.error(
      'MYEONGHA_SEYEON_TURN_RUNTIME_DIAGNOSTIC ' +
      JSON.stringify({
        schemaVersion: 'myeongha-seyeon-turn-runtime-diagnostic-v1',
        stage,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        sqlState,
        runtimeStage,
        providerFailureCode: providerCause?.code ?? null,
        providerHttpStatus: providerCause?.httpStatus ?? null,
        providerDiagnostic: providerCause?.diagnostic ?? null,
      }),
    );
    throw error;
  } finally {
    console.info('MYEONGHA_SEYEON_RUNTIME_METRIC ' + JSON.stringify({
      schemaVersion: 'myeongha-seyeon-runtime-metric-v1',
      stage,
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
    }));
  }
}

export function createProductionSeyeonChatRuntimeV1(
  input: CreateProductionSeyeonChatRuntimeInputV1,
): ProductionSeyeonChatRuntimeV1 {
  if (input.costGovernorForRole !== undefined &&
      input.provider !== undefined) {
    throw new Error('Governed chat requires native, fully metered Provider config.');
  }
  if (input.costGovernorForRole !== undefined &&
      input.provider === undefined &&
      input.providerConfig === undefined &&
      Object.values(input.roleProviderConfigs ?? {}).some(v => v === undefined)) {
    throw new Error('Governed chat requires configuration for every active role.');
  }
  assertSeyeonProductionGovernorBoundaryV1({
    mode: input.governorMode,
    target: 'chat',
    provider: input.provider,
    providerConfig: input.providerConfig,
    roleProviderConfigs: input.roleProviderConfigs,
    governorConfigured: input.costGovernorForRole !== undefined,
  });
  const costPoolLease = createSeyeonProductionCostPoolLeaseV1({
    mode: input.governorMode,
    ...(input.governedDbConfig === undefined ? {} : { governedDbConfig: input.governedDbConfig }),
    ...(input.governedCostPool === undefined ? {} : { governedPool: input.governedCostPool }),
  });
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config: input.databaseConfig,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const provider = input.governorMode === 'ENFORCE' ? null : resolveProvider(input);
  const roleProvider = (role: keyof SeyeonProductionRoleProviderConfigsV1) => {
    if (input.governorMode === 'ENFORCE' || provider === null) {
      throw new Error('ENFORCE rejects raw role Provider fallback.');
    }
    const roleConfig = input.roleProviderConfigs?.[role];
    return roleConfig === undefined
      ? provider
      : createOpenAiSeyeonStructuredProviderV1(roleConfig);
  };
  const idPort = createSeyeonProductionRuntimeIdPortV1(
    input.createUuid,
  );

  return Object.freeze({
    async run(
      runInput: RunProductionSeyeonChatInputV1,
    ): Promise<RunProductionSeyeonChatResultV1> {
      const threadId = text(runInput.threadId, 'threadId', 256);
      const clientTurnId = text(
        runInput.clientTurnId,
        'clientTurnId',
        256,
      );
      const userText = text(runInput.text, 'text', 8000);

      const runner =
        createSeyeonProductionSubjectTransactionRunnerV1({
          pool: poolLease.pool,
          verifiedEvidence: runInput.verifiedEvidence,
        });
      const resolvedSubject = await runSeyeonTurnRuntimePhaseV1(
        'subject_resolution',
        () => runner.resolveSubject(),
      );;
      // The main Subject Runner remains responsible for Chat/Outbox writes.
      // Governed Start and Settle use a different DB LOGIN + role only.
      const costRunner = costPoolLease === null
        ? runner
        : createSeyeonGovernedCostTransactionRunnerV1({
            pool: costPoolLease.pool,
            verifiedEvidence: runInput.verifiedEvidence,
          });
      if (costPoolLease !== null) {
        // Prove independent credential + the same canonical Subject before
        // any model provider can be invoked. Never fallback to legacy.
        const governedSubject = await costRunner.resolveSubject();
        if (governedSubject.subjectId.toLowerCase() !==
            resolvedSubject.subjectId.toLowerCase() ||
            governedSubject.subjectKind !== resolvedSubject.subjectKind) {
          throw new Error('ENFORCE cost DB canonical Subject does not match the application Subject.');
        }
      }
      const ports = createSeyeonProductionTransactionalPortsV1({
        subjectId: resolvedSubject.subjectId,
        runner,
      });

      // The authoritative attempt is allocated before every native model call.
      // Never derive cost ownership from browser/client-supplied identities.
      let activeCostBinding: SeyeonAiCostLedgerBindingV1 | null = null;
      const meteredChatPersistence = Object.freeze({
        ...ports.chatPersistence,
        async allocateAttempt(
          request: Parameters<typeof ports.chatPersistence.allocateAttempt>[0],
        ) {
          const attempt = await ports.chatPersistence.allocateAttempt(request);
          activeCostBinding = Object.freeze({
            subjectId: resolvedSubject.subjectId,
            turnId: request.turnId,
            attemptId: attempt.attemptId,
            phase: 'chat' as const,
          });
          return attempt;
        },
      });
      const meterRole = (role: keyof SeyeonProductionRoleProviderConfigsV1) => {
        const roleConfig = input.roleProviderConfigs?.[role];
        const config = roleConfig ??
          (input.provider === undefined ? input.providerConfig : undefined);
        if (config === undefined) return roleProvider(role);
        const governor = input.costGovernorForRole?.(role, config);
        if (input.governorMode === 'ENFORCE' && governor === undefined) {
          throw new Error('ENFORCE refuses a missing role Governor.');
        }
        return createPersistingSeyeonAiProviderV1({
          config, runner: costRunner, getBinding: () => activeCostBinding,
          ...(governor === undefined ? {} : { governor }),
        });
      };
      const meteredPreflight = meterRole('preflight');
      const meteredInterpreter = meterRole('interpreter');
      const meteredRenderer = meterRole('renderer');
      const meteredReviewer = meterRole('reviewer');

      const threadBinding = await runSeyeonTurnRuntimePhaseV1(
        'thread_binding',
        () => getChatThreadRuntimeBinding({
          resolvedSubjectId: resolvedSubject.subjectId,
          threadId,
          authorityPort: ports.threadBinding,
        }),
      );
      assertDogfoodThread(threadBinding);

      const bundleManifest = await runSeyeonTurnRuntimePhaseV1(
        'content_manifest',
        () => getContentBundleManifest({
          contentBundleId: threadBinding.activeContentBundleId,
          authorityPort: ports.bundleManifest,
        }),
      );
      assertBundleContainsSeyeon(bundleManifest);

      const trustedThread = Object.freeze({
        threadId,
        pinnedReleaseId: threadBinding.activeContentReleaseId,
        participantCharacterIds: threadBinding.participantCharacterIds,
      });

      const receivePlan =
        input.clientCompatibilityProfile === undefined
          ? prepareInternalPinnedSeyeonDogfoodReceivePlanV1({
              request: Object.freeze({
                threadId,
                characterId: 'seyeon',
                clientTurnId,
                text: userText,
                clientCapability: 'internal-seyeon-dogfood-v1',
              }),
              trustedThread,
              pinnedBundleId: threadBinding.activeContentBundleId,
              contentVersion: bundleManifest.manifest.contentVersion,
            })
          : (() => {
              assertSeyeonPublicContentCompatibilityV1({
                bundleManifest,
                clientProfile: input.clientCompatibilityProfile,
              });
              return prepareServerCompatiblePinnedSeyeonReceivePlanV1({
                clientTurnId,
                text: userText,
                trustedThread,
                pinnedBundleId: threadBinding.activeContentBundleId,
                contentVersion: bundleManifest.manifest.contentVersion,
                clientCapability: bundleManifest.manifest.minClientCapability,
              });
            })();

      const ledger = new InMemorySeyeonEventLedgerV2();

      const execution = await runSeyeonTurnRuntimePhaseV1(
        'chat_execution',
        () => runSeyeonProductionChatExecutionV1({
          mode: 'WRITE_DARK',
          resolvedSubjectId: resolvedSubject.subjectId,
          threadId,
          receivePlan,
          baseContext: Object.freeze({}),
          relationshipReadPort: ports.relationshipRead,
          contextReadPort: ports.contextRead,
          productionAuthorityRef:
            'server:production-seyeon-chat-runtime-v1',
          idPort,
          resolveGovernance: ({
            turnBinding,
            productionContext,
          }) =>
            createSeyeonProductionGovernanceV1({
              provider: meteredPreflight,
              turnBinding,
              productionContext,
            }),
          interpreterProvider: meteredInterpreter,
          rendererProvider: meteredRenderer,
          semanticReviewerProvider: meteredReviewer,
          persistencePort: meteredChatPersistence,
          executionIdPort: idPort,
          postTurn: Object.freeze({
            ledger,
            analysisOutboxPort: ports.postTurnAnalysis,
            executionMode: 'DEFERRED',
            semanticRelevanceByEventId: Object.freeze({}),
          }),
        }),
      );

      return Object.freeze({
        runtimeVersion: PRODUCTION_SEYEON_CHAT_RUNTIME_VERSION_V1,
        subjectId: resolvedSubject.subjectId,
        threadBinding,
        bundleManifest,
        execution,
      });
    },

    async close() {
      try {
        await poolLease.close();
      } finally {
        await costPoolLease?.close();
      }
    },
  });
}
