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
import {
  runSeyeonPostTurnRelationshipV2,
  type SeyeonEventLedgerPortV2,
} from './seyeon-post-turn-relationship-v2.js';

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
  }>): Awaitable<SeyeonProductionChatCommitReceiptV1>;
}

export interface SeyeonProductionChatPostTurnInputV1 {
  readonly ledger: SeyeonEventLedgerPortV2;
  readonly extractorProvider:
    RunSeyeonCharacterTurnV2Input['interpreterProvider'];
  readonly semanticRelevanceByEventId: Readonly<Record<string, number>>;
  readonly recentlyMentionedEventIds?: readonly string[];
  readonly serverObservationRefs?: readonly string[];
}

type BaseProductionSliceInputV1 = Omit<
  RunSeyeonProductionContextVerticalSliceInputV1<RunSeyeonCharacterTurnV2Result>,
  | 'threadId'
  | 'currentUserMessageRef'
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
  readonly postTurn: SeyeonProductionChatPostTurnInputV1;
}

export interface RunSeyeonProductionChatExecutionResultV1 {
  readonly version: typeof SEYEON_PRODUCTION_CHAT_EXECUTION_VERSION_V1;
  readonly receivedTurn: SeyeonProductionChatReceivedTurnV1;
  readonly attempt: SeyeonProductionChatAttemptV1;
  readonly committedTurn: SeyeonProductionChatCommitReceiptV1;
  readonly runtimeResult: RunSeyeonCharacterTurnV2Result;
  readonly relationshipResult:
    RunSeyeonProductionContextVerticalSliceResultV1<RunSeyeonCharacterTurnV2Result>;
}

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

  const attempt = await input.persistencePort.allocateAttempt({
    subjectId,
    turnId: receivedTurn.turnId,
    attemptId: input.executionIdPort.nextAttemptId(),
    plannerVersion: SEYEON_PRODUCTION_CHAT_PLANNER_VERSION_V1,
  });

  let committedTurn: SeyeonProductionChatCommitReceiptV1 | null = null;
  let runtimeResult: RunSeyeonCharacterTurnV2Result | null = null;

  const relationshipResult = await runSeyeonProductionContextVerticalSliceV1({
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
      const contextInput = Object.freeze({
        ...historical,
        recentMessages: Object.freeze([
          ...historical.recentMessages,
          Object.freeze({
            messageId: receivedTurn.userMessageId,
            role: 'user' as const,
            text: receivedTurn.userText,
          }),
        ]),
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

      const generatedHash = runtime.envelope.semanticReviewHash;
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
        assistantMessageId: input.executionIdPort.nextAssistantMessageId(),
        outboxEventId: input.executionIdPort.nextCommitOutboxEventId(),
      });
      committedTurn = committed;

      const postTurnIdentityInput = Object.freeze({
        subjectId,
        turnId: committed.turnId,
        userMessageId: receivedTurn.userMessageId,
        assistantMessageId: committed.assistantMessageId,
      });
      const postTurn = await runSeyeonPostTurnRelationshipV2({
        turnId: committed.turnId,
        messages: Object.freeze([
          Object.freeze({
            messageId: receivedTurn.userMessageId,
            role: 'user' as const,
            text: receivedTurn.userText,
          }),
          Object.freeze({
            messageId: committed.assistantMessageId,
            role: 'assistant' as const,
            text: runtime.envelope.utterance,
          }),
        ]),
        interpretation: runtime.interpretation,
        envelope: runtime.envelope,
        ledger: input.postTurn.ledger,
        extractorProvider: input.postTurn.extractorProvider,
        eventAuthorityEvidence: Object.freeze({
          integrityDecisions: runtime.governedPreflight.integrity.decisions,
          riskCausality: runtime.riskCausality,
          ...(input.postTurn.serverObservationRefs === undefined
            ? {}
            : {
                serverObservationRefs:
                  input.postTurn.serverObservationRefs,
              }),
        }),
        semanticRelevanceByEventId:
          input.postTurn.semanticRelevanceByEventId,
        ...(input.postTurn.recentlyMentionedEventIds === undefined
          ? {}
          : {
              recentlyMentionedEventIds:
                input.postTurn.recentlyMentionedEventIds,
            }),
        identity: Object.freeze({
          eventId: input.executionIdPort.nextExperimentalEventId(),
          eventDedupeKey:
            input.executionIdPort.nextExperimentalEventDedupeKey(
              postTurnIdentityInput,
            ),
          ledgerEntryId:
            input.executionIdPort.nextExperimentalLedgerEntryId(),
          occurredAt: committed.committedAt,
          recordedAt: committed.committedAt,
        }),
      });

      const relationshipEvent =
        postTurn.decision === 'event'
          ? Object.freeze({
              experimentalEvent: postTurn.event,
              authorityDecision: postTurn.authorityDecision,
              activeExperimentalEvents:
                input.postTurn.ledger.activeEvents(),
            })
          : null;

      return Object.freeze({
        turnResult: runtime,
        signal: Object.freeze({
          committedTurn: Object.freeze({
            turnId: committed.turnId,
            assistantMessageRef: committed.assistantMessageId,
            occurredAt: committed.committedAt,
          }),
          relationshipEvent,
        }),
      });
    },
  });

  if (committedTurn === null || runtimeResult === null) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Production Chat execution returned without a committed assistant turn.',
    );
  }

  return Object.freeze({
    version: SEYEON_PRODUCTION_CHAT_EXECUTION_VERSION_V1,
    receivedTurn,
    attempt,
    committedTurn,
    runtimeResult,
    relationshipResult,
  });
}
