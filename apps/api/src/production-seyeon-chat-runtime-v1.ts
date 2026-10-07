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
  createSeyeonProductionTransactionalPortsV1,
} from './seyeon-production-transactional-ports-v1.js';
import type {
  SeyeonStructuredProviderPortV2,
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

export interface CreateProductionSeyeonChatRuntimeInputV1 {
  readonly databaseConfig: ProductionUserDataRuntimeConfigV1;
  readonly providerConfig?: OpenAiSeyeonStructuredProviderConfigV1;
  readonly provider?: SeyeonStructuredProviderPortV2;
  readonly pool?: PostgresSubjectPoolV1;
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



export function createProductionSeyeonChatRuntimeV1(
  input: CreateProductionSeyeonChatRuntimeInputV1,
): ProductionSeyeonChatRuntimeV1 {
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config: input.databaseConfig,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const provider = resolveProvider(input);
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
      const resolvedSubject = await runner.resolveSubject();
      const ports = createSeyeonProductionTransactionalPortsV1({
        subjectId: resolvedSubject.subjectId,
        runner,
      });

      const threadBinding = await getChatThreadRuntimeBinding({
        resolvedSubjectId: resolvedSubject.subjectId,
        threadId,
        authorityPort: ports.threadBinding,
      });
      assertDogfoodThread(threadBinding);

      const bundleManifest = await getContentBundleManifest({
        contentBundleId: threadBinding.activeContentBundleId,
        authorityPort: ports.bundleManifest,
      });
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

      const execution =
        await runSeyeonProductionChatExecutionV1({
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
              provider,
              turnBinding,
              productionContext,
            }),
          interpreterProvider: provider,
          rendererProvider: provider,
          semanticReviewerProvider: provider,
          persistencePort: ports.chatPersistence,
          executionIdPort: idPort,
          postTurn: Object.freeze({
            ledger,
            analysisOutboxPort: ports.postTurnAnalysis,
            executionMode: 'DEFERRED',
            semanticRelevanceByEventId: Object.freeze({}),
          }),
        });

      return Object.freeze({
        runtimeVersion: PRODUCTION_SEYEON_CHAT_RUNTIME_VERSION_V1,
        subjectId: resolvedSubject.subjectId,
        threadBinding,
        bundleManifest,
        execution,
      });
    },

    close() {
      return poolLease.close();
    },
  });
}
