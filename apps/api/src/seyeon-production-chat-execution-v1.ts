import { createHash } from 'node:crypto';

import {
  canonicalJson,
} from '../../../packages/domain/src/index.js';
import {
  assertServerPreparedChatReceivePlanV1,
  type ChatReceivePlan,
} from './chat-receive.js';
import {
  bindSeyeonProductionCharacterContextInputV1,
  type SeyeonProductionBoundCharacterContextInputV1,
} from './seyeon-production-context-v1.js';
import {
  runSeyeonProductionContextVerticalSliceV1,
  type RunSeyeonProductionContextVerticalSliceInputV1,
  type RunSeyeonProductionContextVerticalSliceResultV1,
} from './seyeon-production-context-vertical-slice-v1.js';
import {
  runSeyeonCharacterTurnV2,
  type RunSeyeonCharacterTurnV2Input,
  type RunSeyeonCharacterTurnV2Result,
} from './seyeon-character-runtime-v2.js';
import type {
  SeyeonEventLedgerPortV2,
} from './seyeon-post-turn-relationship-v2.js';
import {
  prepareSeyeonPostTurnAnalysisSnapshotV1,
  processSeyeonPostTurnAnalysisV1,
  type ProcessSeyeonPostTurnAnalysisResultV1,
  type SeyeonPostTurnAnalysisOutboxPortV1,
} from './seyeon-post-turn-analysis-worker-v1.js';
import type {
  SeyeonProductionRelationshipSyncOutboxPortV1,
} from './seyeon-production-relationship-outbox-v1.js';

export const SEYEON_PRODUCTION_CHAT_EXECUTION_VERSION_V1 =
  'seyeon-production-chat-execution-v1' as const;
export const SEYEON_PRODUCTION_CHAT_REQUEST_CONTRACT_VERSION_V1 =
  'chat-request-v1' as const;
export const SEYEON_PRODUCTION_CHAT_PLANNER_VERSION_V1 =
  'seyeon-production-chat-planner-v1' as const;
export const SEYEON_PRODUCTION_CHAT_RENDERER_VERSION_V1 =
  'seyeon-character-runtime-v2' as const;
export const SEYEON_PRODUCTION_CHAT_OUTPUT_GUARD_VERSION_V1 =
  'seyeon-semantic-review-v2' as const;

type Awaitable<T> = T | Promise<T>;

export interface SeyeonProductionChatExecutionIdPortV1 {
  nextTurnId(): string;
  nextUserMessageId(): string;
  nextAttemptId(): string;
  nextAssistantMessageId(): string;
  nextCommitOutboxEventId(): string;
  nextPostTurnAnalysisOutboxEventId(): string;
  nextRelationshipSyncOutboxEventId(): string;
  nextAiExecutionLogId(stage: 'renderer' | 'output_guard'): string;
  nextExperimentalEventId(): string;
  nextExperimentalEventDedupeKey(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly userMessageId: string;
    readonly assistantMessageId: string;
  }): string;
  nextExperimentalLedgerEntryId(): string;
}

export interface SeyeonProductionChatReceivedTurnV1 {
  readonly turnId: string;
  readonly userMessageId: string;
  readonly userText: string;
  readonly threadCharacterId: string;
  readonly contentReleaseId: string;
  readonly contentBundleId: string;
  readonly turnState: string;
  readonly committedTurn: null | Readonly<{
    readonly attemptId: string;
    readonly assistantMessageId: string;
    readonly assistantText: string;
    readonly sequenceNo: number;
    readonly committedAt: string;
  }>;
  readonly replayed: boolean;
}

export interface SeyeonProductionChatAttemptV1 {
  readonly attemptId: string;
  readonly attemptNo: number;
  readonly replayed: boolean;
}

export interface SeyeonProductionChatCommitReceiptV1 {
  readonly turnId: string;
  readonly attemptId: string;
  readonly assistantMessageId: string;
  readonly sequenceNo: number;
  readonly committedAt: string;
  readonly postTurnOutboxEventId: string | null;
  readonly replayed: boolean;
}

export interface SeyeonProductionChatPersistencePortV1 {
  receiveTurn(input: Readonly<{
    subjectId: string;
    threadId: string;
    turnId: string;
    userMessageId: string;
    clientTurnId: string;
    requestHash: string;
    requestContractVersion:
      typeof SEYEON_PRODUCTION_CHAT_REQUEST_CONTRACT_VERSION_V1;
    requestSnapshot: unknown;
    resolvedContentReleaseId: string;
    resolvedContentBundleId: string;
    userText: string;
    userContentHash: string;
  }>): Awaitable<SeyeonProductionChatReceivedTurnV1>;

  allocateAttempt(input: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
    plannerVersion: typeof SEYEON_PRODUCTION_CHAT_PLANNER_VERSION_V1;
  }>): Awaitable<SeyeonProductionChatAttemptV1>;

  markContextReady(input: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
  }>): Awaitable<void>;

  failAttempt(input: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
    failureState: 'failed_retryable';
    errorCode: 'SEYEON_PRODUCTION_EXECUTION_FAILED';
  }>): Awaitable<void>;

  persistGenerated(input: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
    threadCharacterId: string;
    aiExecutionLogId: string;
    providerKey: string;
    modelKey: string;
    rendererVersion: typeof SEYEON_PRODUCTION_CHAT_RENDERER_VERSION_V1;
    bodyText: string;
    messagePayload: unknown;
    messageSchemaVersion: string;
    contentHash: string;
    groundingRefs: readonly string[];
  }>): Awaitable<void>;

  persistValidated(input: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
    aiExecutionLogId: string;
    providerKey: string;
    modelKey: string;
    outputGuardVersion:
      typeof SEYEON_PRODUCTION_CHAT_OUTPUT_GUARD_VERSION_V1;
    generatedContentHash: string;
    validationResult: unknown;
    groundingRefs: readonly string[];
  }>): Awaitable<void>;

  commitTurn(input: Readonly<{
    subjectId: string;
    threadId: string;
    turnId: string;
    attemptId: string;
    assistantMessageId: string;
    outboxEventId: string;
    postTurnOutboxEventId: string;
    postTurnSnapshot: unknown;
    postTurnSnapshotHash: string;
  }>): Awaitable<SeyeonProductionChatCommitReceiptV1>;
}

export interface SeyeonProductionChatPostTurnInputV1 {
  readonly ledger: SeyeonEventLedgerPortV2;
  readonly extractorProvider:
    RunSeyeonCharacterTurnV2Input['interpreterProvider'];
  readonly analysisOutboxPort: SeyeonPostTurnAnalysisOutboxPortV1;
  readonly lockOwner: string;
  readonly leaseExpiresAt: string;
  readonly semanticRelevanceByEventId: Readonly<Record<string, number>>;
  readonly recentlyMentionedEventIds?: readonly string[];
  readonly serverObservationRefs?: readonly string[];
}

type BaseProductionSliceInputV1 = Omit<
  RunSeyeonProductionContextVerticalSliceInputV1<RunSeyeonCharacterTurnV2Result>,
  | 'threadId'
  | 'currentUserMessageRef'
  | 'durableSync'
  | 'runCommittedTurn'
>;

export interface RunSeyeonProductionChatExecutionInputV1
extends BaseProductionSliceInputV1 {
  readonly threadId: string;
  readonly receivePlan: ChatReceivePlan;
  readonly baseContext: SeyeonProductionBoundCharacterContextInputV1;
  readonly governance: RunSeyeonCharacterTurnV2Input['governance'];
  readonly interpreterProvider:
    RunSeyeonCharacterTurnV2Input['interpreterProvider'];
  readonly rendererProvider:
    RunSeyeonCharacterTurnV2Input['rendererProvider'];
  readonly semanticReviewerProvider:
    RunSeyeonCharacterTurnV2Input['semanticReviewerProvider'];
  readonly persistencePort: SeyeonProductionChatPersistencePortV1;
  readonly executionIdPort: SeyeonProductionChatExecutionIdPortV1;
  readonly relationshipSyncOutboxPort?:
    SeyeonProductionRelationshipSyncOutboxPortV1;
  readonly postTurn: SeyeonProductionChatPostTurnInputV1;
}

export interface RunSeyeonProductionChatExecutedResultV1 {
  readonly version: typeof SEYEON_PRODUCTION_CHAT_EXECUTION_VERSION_V1;
  readonly disposition: 'executed';
  readonly receivedTurn: SeyeonProductionChatReceivedTurnV1;
  readonly attempt: SeyeonProductionChatAttemptV1;
  readonly committedTurn: SeyeonProductionChatCommitReceiptV1;
  readonly runtimeResult: RunSeyeonCharacterTurnV2Result;
  readonly relationshipResult:
    RunSeyeonProductionContextVerticalSliceResultV1<RunSeyeonCharacterTurnV2Result>;
  readonly postTurnAnalysis:
    | Readonly<{
        readonly status: 'processed';
        readonly result: ProcessSeyeonPostTurnAnalysisResultV1;
      }>
    | Readonly<{
        readonly status: 'deferred';
        readonly outboxEventId: string;
      }>;
}

export interface RunSeyeonProductionChatCommittedReplayResultV1 {
  readonly version: typeof SEYEON_PRODUCTION_CHAT_EXECUTION_VERSION_V1;
  readonly disposition: 'committed_replay';
  readonly receivedTurn: SeyeonProductionChatReceivedTurnV1;
  readonly committedTurn: SeyeonProductionChatCommitReceiptV1;
  readonly assistantText: string;
}

export type RunSeyeonProductionChatExecutionResultV1 =
  | RunSeyeonProductionChatExecutedResultV1
  | RunSeyeonProductionChatCommittedReplayResultV1;

export class SeyeonProductionChatExecutionErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonProductionChatExecutionErrorV1';
  }
}

function boundedText(value: string, path: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new SeyeonProductionChatExecutionErrorV1(
      path + ' must be non-empty text within ' + max + ' characters.',
    );
  }
  return normalized;
}

function sha256(value: unknown): string {
  return 'sha256:v1:' + createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex');
}

function assertReceivePlan(input: {
  readonly threadId: string;
  readonly plan: ChatReceivePlan;
}): Readonly<{
  clientTurnId: string;
  userText: string;
}> {
  assertServerPreparedChatReceivePlanV1(input.plan);
  if (input.plan.isNewThread) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Se-yeon Production execution requires an existing server-owned thread.',
    );
  }
  if (input.plan.normalizedRequest.threadId !== input.threadId) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Server-prepared Chat plan does not match the requested thread.',
    );
  }
  if (
    input.plan.requestedCharacterId !== undefined &&
    input.plan.requestedCharacterId !== 'seyeon'
  ) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Se-yeon Production execution cannot run another Character.',
    );
  }
  const userText = input.plan.normalizedRequest.text;
  if (userText === undefined) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Se-yeon Production execution currently accepts text turns only.',
    );
  }
  return Object.freeze({
    clientTurnId: boundedText(
      input.plan.normalizedRequest.clientTurnId,
      'clientTurnId',
      256,
    ),
    userText: boundedText(userText, 'userText', 8000),
  });
}

export function resolveSeyeonProductionCommittedReplayV1(
  receivedTurn: SeyeonProductionChatReceivedTurnV1,
): RunSeyeonProductionChatCommittedReplayResultV1 | null {
  if (!receivedTurn.replayed) return null;

  if (
    receivedTurn.turnState === 'committed' ||
    receivedTurn.turnState === 'delivered'
  ) {
    const committed = receivedTurn.committedTurn;
    if (committed === null) {
      throw new SeyeonProductionChatExecutionErrorV1(
        'Committed Chat replay is missing authoritative assistant material.',
      );
    }
    return Object.freeze({
      version: SEYEON_PRODUCTION_CHAT_EXECUTION_VERSION_V1,
      disposition: 'committed_replay' as const,
      receivedTurn,
      committedTurn: Object.freeze({
        turnId: receivedTurn.turnId,
        attemptId: committed.attemptId,
        assistantMessageId: committed.assistantMessageId,
        sequenceNo: committed.sequenceNo,
        committedAt: committed.committedAt,
        postTurnOutboxEventId: null,
        replayed: true,
      }),
      assistantText: committed.assistantText,
    });
  }

  if (
    receivedTurn.turnState === 'failed_final' ||
    receivedTurn.turnState === 'abandoned'
  ) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Terminal Chat replay cannot start another Production execution.',
    );
  }

  return null;
}

export function assertSeyeonProductionAttemptOwnershipV1(
  attempt: SeyeonProductionChatAttemptV1,
): void {
  if (attempt.replayed) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'A Se-yeon Production execution attempt is already in flight.',
    );
  }
}

export function bindSeyeonProductionCurrentUserTurnV1(input: Readonly<{
  historicalContext: RunSeyeonCharacterTurnV2Input['contextInput'];
  userMessageId: string;
  userText: string;
}>): RunSeyeonCharacterTurnV2Input['contextInput'] {
  const userMessageId = boundedText(input.userMessageId, 'userMessageId', 256);
  const userText = boundedText(input.userText, 'userText', 8000);
  if (
    input.historicalContext.recentMessages.some(
      (message) => message.messageId === userMessageId,
    )
  ) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Current user message must not already exist in historical Production context.',
    );
  }
  return Object.freeze({
    ...input.historicalContext,
    recentMessages: Object.freeze([
      ...input.historicalContext.recentMessages,
      Object.freeze({
        messageId: userMessageId,
        role: 'user' as const,
        text: userText,
      }),
    ]),
  });
}

function relationshipSemanticsPort(
  value: Parameters<typeof runSeyeonCharacterTurnV2>[0]['governance']['relationshipSemantics'],
  applied: unknown,
): Parameters<typeof runSeyeonCharacterTurnV2>[0]['governance']['relationshipSemantics'] {
  if (applied === null) return value;
  return Object.freeze({ resolve: () => applied });
}

export async function runSeyeonProductionChatExecutionV1(
  input: RunSeyeonProductionChatExecutionInputV1,
): Promise<RunSeyeonProductionChatExecutionResultV1> {
  const subjectId = boundedText(input.resolvedSubjectId, 'resolvedSubjectId', 256);
  const threadId = boundedText(input.threadId, 'threadId', 256);
  const receive = assertReceivePlan({ threadId, plan: input.receivePlan });
  const durableRelationshipRequired =
    input.mode === 'WRITE_DARK' ||
    input.mode === 'BEHAVIOR_SHADOW' ||
    input.mode === 'LIVE';
  if (
    durableRelationshipRequired &&
    input.relationshipSyncOutboxPort === undefined
  ) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Write-capable Se-yeon Production execution requires durable relationship sync outbox authority.',
    );
  }

  const turnId = input.executionIdPort.nextTurnId();
  const userMessageId = input.executionIdPort.nextUserMessageId();
  const receivedTurn = await input.persistencePort.receiveTurn({
    subjectId,
    threadId,
    turnId,
    userMessageId,
    clientTurnId: receive.clientTurnId,
    requestHash: input.receivePlan.requestHash,
    requestContractVersion: SEYEON_PRODUCTION_CHAT_REQUEST_CONTRACT_VERSION_V1,
    requestSnapshot: input.receivePlan.normalizedRequest,
    resolvedContentReleaseId: input.receivePlan.resolvedContent.releaseId,
    resolvedContentBundleId: input.receivePlan.resolvedContent.bundleId,
    userText: receive.userText,
    userContentHash: sha256(Object.freeze({
      senderType: 'user',
      bodyText: receive.userText,
    })),
  });

  if (receivedTurn.turnId !== turnId && !receivedTurn.replayed) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Chat receive authority returned a different non-replay turn identity.',
    );
  }
  if (receivedTurn.userText !== receive.userText) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Persisted current user message does not match the server-prepared request.',
    );
  }

  const committedReplay =
    resolveSeyeonProductionCommittedReplayV1(receivedTurn);
  if (committedReplay !== null) {
    return committedReplay;
  }

  const attempt = await input.persistencePort.allocateAttempt({
    subjectId,
    turnId: receivedTurn.turnId,
    attemptId: input.executionIdPort.nextAttemptId(),
    plannerVersion: SEYEON_PRODUCTION_CHAT_PLANNER_VERSION_V1,
  });
  assertSeyeonProductionAttemptOwnershipV1(attempt);

  let committedTurn: SeyeonProductionChatCommitReceiptV1 | null = null;
  let runtimeResult: RunSeyeonCharacterTurnV2Result | null = null;

  let relationshipResult: RunSeyeonProductionContextVerticalSliceResultV1<RunSeyeonCharacterTurnV2Result>;
  try {
    relationshipResult = await runSeyeonProductionContextVerticalSliceV1({
      mode: input.mode,
      resolvedSubjectId: subjectId,
      threadId,
      currentUserMessageRef: receivedTurn.userMessageId,
      bandProjection: input.bandProjection,
      relationshipReadPort: input.relationshipReadPort,
      contextReadPort: input.contextReadPort,
      productionHistoryRecords: input.productionHistoryRecords,
      productionAuthorityRef: input.productionAuthorityRef,
      idPort: input.idPort,
      contextPort: input.contextPort,
      commitPort: input.commitPort,
      ...(input.serverOwnedPersonalRecordProjectors === undefined
        ? {}
        : {
            serverOwnedPersonalRecordProjectors:
              input.serverOwnedPersonalRecordProjectors,
          }),
      ...(input.maxRecentMessages === undefined
        ? {}
        : { maxRecentMessages: input.maxRecentMessages }),
      ...(input.maxRelationshipEvents === undefined
        ? {}
        : { maxRelationshipEvents: input.maxRelationshipEvents }),
      ...(input.maxPersonalRecords === undefined
        ? {}
        : { maxPersonalRecords: input.maxPersonalRecords }),
      runCommittedTurn: async ({
        turnBinding,
        activation,
        productionContext,
      }) => {
        await input.persistencePort.markContextReady({
          subjectId,
          turnId: receivedTurn.turnId,
          attemptId: attempt.attemptId,
        });

        const historical = bindSeyeonProductionCharacterContextInputV1({
          base: input.baseContext,
          turnBinding,
          productionContext,
        });
        const contextInput = bindSeyeonProductionCurrentUserTurnV1({
          historicalContext: historical,
          userMessageId: receivedTurn.userMessageId,
          userText: receivedTurn.userText,
        });

        const runtime = await runSeyeonCharacterTurnV2({
          userMessageRef: receivedTurn.userMessageId,
          userText: receivedTurn.userText,
          contextInput,
          governance: (() => {
            const semantics = relationshipSemanticsPort(
              input.governance.relationshipSemantics,
              activation.appliedRelationshipSemantics,
            );
            return Object.freeze({
              ...input.governance,
              ...(semantics === undefined
                ? {}
                : { relationshipSemantics: semantics }),
            });
          })(),
          interpreterProvider: input.interpreterProvider,
          rendererProvider: input.rendererProvider,
          semanticReviewerProvider: input.semanticReviewerProvider,
        });
        runtimeResult = runtime;

        const generatedHash = sha256(runtime.envelope);
        await input.persistencePort.persistGenerated({
          subjectId,
          turnId: receivedTurn.turnId,
          attemptId: attempt.attemptId,
          threadCharacterId: receivedTurn.threadCharacterId,
          aiExecutionLogId:
            input.executionIdPort.nextAiExecutionLogId('renderer'),
          providerKey: runtime.providers.renderer.providerKey,
          modelKey: runtime.providers.renderer.modelKey,
          rendererVersion: SEYEON_PRODUCTION_CHAT_RENDERER_VERSION_V1,
          bodyText: runtime.envelope.utterance,
          messagePayload: runtime.envelope,
          messageSchemaVersion: runtime.envelope.schemaVersion,
          contentHash: generatedHash,
          groundingRefs: Object.freeze([]),
        });

        const assistantMessageId =
          input.executionIdPort.nextAssistantMessageId();
        const postTurnIdentityInput = Object.freeze({
          subjectId,
          turnId: receivedTurn.turnId,
          userMessageId: receivedTurn.userMessageId,
          assistantMessageId,
        });
        const postTurnOutboxEventId =
          input.executionIdPort.nextPostTurnAnalysisOutboxEventId();
        const postTurnSnapshot = prepareSeyeonPostTurnAnalysisSnapshotV1({
          subjectId,
          mode: input.mode,
          turnId: receivedTurn.turnId,
          userMessageId: receivedTurn.userMessageId,
          assistantMessageId,
          preparedAt: new Date().toISOString(),
          productionAuthorityRef: input.productionAuthorityRef,
          runtimeResult: runtime,
          ledger: input.postTurn.ledger,
          semanticRelevanceByEventId:
            input.postTurn.semanticRelevanceByEventId,
          ...(input.postTurn.recentlyMentionedEventIds === undefined
            ? {}
            : {
                recentlyMentionedEventIds:
                  input.postTurn.recentlyMentionedEventIds,
              }),
          ...(input.postTurn.serverObservationRefs === undefined
            ? {}
            : {
                serverObservationRefs:
                  input.postTurn.serverObservationRefs,
              }),
          productionHistoryRecords: input.productionHistoryRecords,
          identity: Object.freeze({
            experimentalEventId:
              input.executionIdPort.nextExperimentalEventId(),
            experimentalEventDedupeKey:
              input.executionIdPort.nextExperimentalEventDedupeKey(
                postTurnIdentityInput,
              ),
            productionEventId: await input.idPort.nextProductionEventId(),
            relationshipSyncOutboxEventId:
              input.executionIdPort.nextRelationshipSyncOutboxEventId(),
          }),
        });

        await input.persistencePort.persistValidated({
          subjectId,
          turnId: receivedTurn.turnId,
          attemptId: attempt.attemptId,
          aiExecutionLogId:
            input.executionIdPort.nextAiExecutionLogId('output_guard'),
          providerKey: runtime.providers.semanticReviewer.providerKey,
          modelKey: runtime.providers.semanticReviewer.modelKey,
          outputGuardVersion: SEYEON_PRODUCTION_CHAT_OUTPUT_GUARD_VERSION_V1,
          generatedContentHash: generatedHash,
          validationResult: Object.freeze({
            schemaVersion: 'seyeon-production-chat-validation-v1',
            passed: true,
            generatedContentHash: generatedHash,
            semanticReviewHash: runtime.envelope.semanticReviewHash,
          }),
          groundingRefs: Object.freeze([]),
        });

        const committed = await input.persistencePort.commitTurn({
          subjectId,
          threadId,
          turnId: receivedTurn.turnId,
          attemptId: attempt.attemptId,
          assistantMessageId,
          outboxEventId: input.executionIdPort.nextCommitOutboxEventId(),
          postTurnOutboxEventId,
          postTurnSnapshot: postTurnSnapshot.snapshot,
          postTurnSnapshotHash: postTurnSnapshot.snapshotHash,
        });
        committedTurn = committed;

        return Object.freeze({
          turnResult: runtime,
          signal: Object.freeze({
            committedTurn: Object.freeze({
              turnId: committed.turnId,
              assistantMessageRef: committed.assistantMessageId,
              occurredAt: committed.committedAt,
            }),
            relationshipEvent: null,
          }),
        });
      },
    });


  } catch (error) {
    if (committedTurn === null) {
      await input.persistencePort.failAttempt({
        subjectId,
        turnId: receivedTurn.turnId,
        attemptId: attempt.attemptId,
        failureState: 'failed_retryable',
        errorCode: 'SEYEON_PRODUCTION_EXECUTION_FAILED',
      });
    }
    throw error;
  }

  if (committedTurn === null || runtimeResult === null) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Production Chat execution returned without a committed assistant turn.',
    );
  }
  if (committedTurn.postTurnOutboxEventId === null) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Committed Production Chat turn is missing its durable post-turn outbox identity.',
    );
  }

  let postTurnAnalysis:
    RunSeyeonProductionChatExecutedResultV1['postTurnAnalysis'];
  try {
    const result = await processSeyeonPostTurnAnalysisV1({
      subjectId,
      outboxEventId: committedTurn.postTurnOutboxEventId,
      lockOwner: input.postTurn.lockOwner,
      leaseExpiresAt: input.postTurn.leaseExpiresAt,
      outboxPort: input.postTurn.analysisOutboxPort,
      extractorProvider: input.postTurn.extractorProvider,
      ...(input.relationshipSyncOutboxPort === undefined
        ? {}
        : {
            relationshipSyncOutboxPort:
              input.relationshipSyncOutboxPort,
          }),
    });
    postTurnAnalysis = Object.freeze({
      status: 'processed' as const,
      result,
    });
  } catch {
    postTurnAnalysis = Object.freeze({
      status: 'deferred' as const,
      outboxEventId: committedTurn.postTurnOutboxEventId,
    });
  }

  return Object.freeze({
    version: SEYEON_PRODUCTION_CHAT_EXECUTION_VERSION_V1,
    disposition: 'executed' as const,
    receivedTurn,
    attempt,
    committedTurn,
    runtimeResult,
    relationshipResult,
    postTurnAnalysis,
  });
}
