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
import {
  PRODUCTION_SEYEON_CHAT_RUNTIME_BINDINGS_V1,
  createProductionSeyeonChatRuntimeV1,
  type ProductionSeyeonChatRuntimeV1,
  type RunProductionSeyeonChatResultV1,
} from './production-seyeon-chat-runtime-v1.js';
import {
  createProductionSeyeonPostTurnWorkerRuntimeV1,
  type ProductionSeyeonPostTurnWorkerRuntimeV1,
  type RunProductionSeyeonPostTurnWorkerResultV1,
} from './production-seyeon-post-turn-worker-runtime-v1.js';
import {
  createProductionSeyeonRelationshipWorkerRuntimeV1,
  type ProductionSeyeonRelationshipWorkerRuntimeV1,
  type RunProductionSeyeonRelationshipWorkerResultV1,
} from './production-seyeon-relationship-worker-runtime-v1.js';
import type {
  ProductionUserDataRuntimeConfigV1,
} from './production-user-data-runtime-config.js';
import type {
  SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const SEYEON_INTERNAL_DOGFOOD_HARNESS_VERSION_V1 =
  'seyeon-internal-dogfood-harness-v1' as const;

export const SEYEON_INTERNAL_DOGFOOD_HARNESS_BINDINGS_V1 = Object.freeze({
  publicRoute: null,
  routeMounted: false,
  browserAuthority: false,
  existingSingleCharacterThreadRequired: true,
  chatRelationshipMode: 'WRITE_DARK',
  chatPostTurnExecution: 'DEFERRED',
  downstreamExecution: 'OPERATOR_DRIVEN',
} as const);

export interface SeyeonInternalDogfoodWorkerLeaseV1 {
  readonly lockOwner: string;
  readonly leaseExpiresAt: string;
}

export interface RunSeyeonInternalDogfoodTurnInputV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly threadId: string;
  readonly clientTurnId: string;
  readonly text: string;
  readonly postTurnLease: SeyeonInternalDogfoodWorkerLeaseV1;
  readonly relationshipLease: SeyeonInternalDogfoodWorkerLeaseV1;
}

export interface SeyeonInternalDogfoodRuntimeSetV1 {
  readonly chat: ProductionSeyeonChatRuntimeV1;
  readonly postTurn: ProductionSeyeonPostTurnWorkerRuntimeV1;
  readonly relationship: ProductionSeyeonRelationshipWorkerRuntimeV1;
}

export type RunSeyeonInternalDogfoodTurnResultV1 =
  | Readonly<{
      readonly version: typeof SEYEON_INTERNAL_DOGFOOD_HARNESS_VERSION_V1;
      readonly disposition: 'committed_replay';
      readonly subjectId: string;
      readonly chat: RunProductionSeyeonChatResultV1;
      readonly postTurn: null;
      readonly relationship: null;
      readonly relationshipRevision: null;
    }>
  | Readonly<{
      readonly version: typeof SEYEON_INTERNAL_DOGFOOD_HARNESS_VERSION_V1;
      readonly disposition: 'executed';
      readonly subjectId: string;
      readonly chat: RunProductionSeyeonChatResultV1;
      readonly postTurn: RunProductionSeyeonPostTurnWorkerResultV1;
      readonly relationship: RunProductionSeyeonRelationshipWorkerResultV1 | null;
      readonly relationshipRevision:
        | Readonly<{
            readonly revisionBefore: number;
            readonly revisionAfter: number;
            readonly applied: boolean;
            readonly replayed: boolean;
          }>
        | null;
    }>;

export class SeyeonInternalDogfoodHarnessErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonInternalDogfoodHarnessErrorV1';
  }
}

function assertInternalBoundary(): void {
  if (
    PRODUCTION_SEYEON_CHAT_RUNTIME_BINDINGS_V1.publicRoute !== null ||
    PRODUCTION_SEYEON_CHAT_RUNTIME_BINDINGS_V1.routeMounted ||
    PRODUCTION_SEYEON_CHAT_RUNTIME_BINDINGS_V1.browserAuthority ||
    PRODUCTION_SEYEON_CHAT_RUNTIME_BINDINGS_V1.relationshipMode !== 'WRITE_DARK' ||
    PRODUCTION_SEYEON_CHAT_RUNTIME_BINDINGS_V1.postTurnExecution !== 'DEFERRED'
  ) {
    throw new SeyeonInternalDogfoodHarnessErrorV1(
      'Se-yeon internal dogfood cannot run outside the pinned internal WRITE_DARK / DEFERRED boundary.',
    );
  }
}

export async function runSeyeonInternalDogfoodTurnV1(input: {
  readonly runtimes: SeyeonInternalDogfoodRuntimeSetV1;
  readonly turn: RunSeyeonInternalDogfoodTurnInputV1;
}): Promise<RunSeyeonInternalDogfoodTurnResultV1> {
  assertInternalBoundary();

  const chat = await input.runtimes.chat.run({
    verifiedEvidence: input.turn.verifiedEvidence,
    threadId: input.turn.threadId,
    clientTurnId: input.turn.clientTurnId,
    text: input.turn.text,
  });

  if (chat.execution.disposition === 'committed_replay') {
    return Object.freeze({
      version: SEYEON_INTERNAL_DOGFOOD_HARNESS_VERSION_V1,
      disposition: 'committed_replay' as const,
      subjectId: chat.subjectId,
      chat,
      postTurn: null,
      relationship: null,
      relationshipRevision: null,
    });
  }

  if (chat.execution.postTurnAnalysis.status !== 'deferred') {
    throw new SeyeonInternalDogfoodHarnessErrorV1(
      'Production Se-yeon dogfood requires deferred post-turn execution.',
    );
  }

  const postTurn = await input.runtimes.postTurn.run({
    verifiedEvidence: input.turn.verifiedEvidence,
    outboxEventId: chat.execution.postTurnAnalysis.outboxEventId,
    lockOwner: input.turn.postTurnLease.lockOwner,
    leaseExpiresAt: input.turn.postTurnLease.leaseExpiresAt,
  });

  if (postTurn.subjectId !== chat.subjectId) {
    throw new SeyeonInternalDogfoodHarnessErrorV1(
      'Post-turn worker resolved a different canonical Subject.',
    );
  }

  if (postTurn.result.decision !== 'enqueued') {
    return Object.freeze({
      version: SEYEON_INTERNAL_DOGFOOD_HARNESS_VERSION_V1,
      disposition: 'executed' as const,
      subjectId: chat.subjectId,
      chat,
      postTurn,
      relationship: null,
      relationshipRevision: null,
    });
  }

  const relationship = await input.runtimes.relationship.run({
    verifiedEvidence: input.turn.verifiedEvidence,
    outboxEventId: postTurn.result.relationshipSyncOutboxEventId,
    lockOwner: input.turn.relationshipLease.lockOwner,
    leaseExpiresAt: input.turn.relationshipLease.leaseExpiresAt,
  });

  if (relationship.subjectId !== chat.subjectId) {
    throw new SeyeonInternalDogfoodHarnessErrorV1(
      'Relationship worker resolved a different canonical Subject.',
    );
  }

  const apply = relationship.result.applyResult;
  return Object.freeze({
    version: SEYEON_INTERNAL_DOGFOOD_HARNESS_VERSION_V1,
    disposition: 'executed' as const,
    subjectId: chat.subjectId,
    chat,
    postTurn,
    relationship,
    relationshipRevision: Object.freeze({
      revisionBefore: apply.revisionBefore,
      revisionAfter: apply.revisionAfter,
      applied: apply.applied,
      replayed: apply.replayed,
    }),
  });
}

export interface ProductionSeyeonInternalDogfoodHarnessV1 {
  run(
    input: RunSeyeonInternalDogfoodTurnInputV1,
  ): Promise<RunSeyeonInternalDogfoodTurnResultV1>;
  close(): Promise<void>;
}

export interface CreateProductionSeyeonInternalDogfoodHarnessInputV1 {
  readonly databaseConfig: ProductionUserDataRuntimeConfigV1;
  readonly providerConfig?: OpenAiSeyeonStructuredProviderConfigV1;
  readonly provider?: SeyeonStructuredProviderPortV2;
  readonly pool?: PostgresSubjectPoolV1;
  readonly createUuid?: () => string;
}

function resolveProvider(
  input: CreateProductionSeyeonInternalDogfoodHarnessInputV1,
): SeyeonStructuredProviderPortV2 {
  if (input.provider !== undefined) return input.provider;
  if (input.providerConfig === undefined) {
    throw new SeyeonInternalDogfoodHarnessErrorV1(
      'Se-yeon internal dogfood requires a server-owned structured provider.',
    );
  }
  return createOpenAiSeyeonStructuredProviderV1(input.providerConfig);
}

export function createProductionSeyeonInternalDogfoodHarnessV1(
  input: CreateProductionSeyeonInternalDogfoodHarnessInputV1,
): ProductionSeyeonInternalDogfoodHarnessV1 {
  assertInternalBoundary();

  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config: input.databaseConfig,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const provider = resolveProvider(input);
  const shared = {
    databaseConfig: input.databaseConfig,
    pool: poolLease.pool,
  } as const;

  const chat = createProductionSeyeonChatRuntimeV1({
    ...shared,
    provider,
    ...(input.createUuid === undefined ? {} : { createUuid: input.createUuid }),
  });
  const postTurn = createProductionSeyeonPostTurnWorkerRuntimeV1({
    ...shared,
    provider,
  });
  const relationship = createProductionSeyeonRelationshipWorkerRuntimeV1({
    ...shared,
    ...(input.createUuid === undefined ? {} : { createUuid: input.createUuid }),
  });

  const runtimes = Object.freeze({ chat, postTurn, relationship });

  return Object.freeze({
    run(turn: RunSeyeonInternalDogfoodTurnInputV1) {
      return runSeyeonInternalDogfoodTurnV1({ runtimes, turn });
    },
    async close() {
      await Promise.all([
        chat.close(),
        postTurn.close(),
        relationship.close(),
      ]);
      await poolLease.close();
    },
  });
}
