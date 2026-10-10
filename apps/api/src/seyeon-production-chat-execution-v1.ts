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
  type SeyeonProductionContextSnapshotV1,
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
import {
  assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1,
} from './seyeon-personal-record-precommit-hold-v1.js';
import {
  createSeyeonAttemptZeroPersonalProofV1,
} from './seyeon-attempt-zero-personal-proof-v1.js';
import type { SeyeonAttemptZeroPersonalProofV1 } from './seyeon-attempt-zero-personal-proof-v1.js';
import type {
  SeyeonExactModelPersonalSourceSelectionV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';
import type {
  SeyeonProductionRelationshipSyncOutboxPortV1,
} from './seyeon-production-relationship-outbox-v1.js';
import type {
  SeyeonProductionRelationshipActivationV1,
} from './seyeon-production-relationship-activation-v1.js';
import type {
  SeyeonProductionRelationshipTurnBindingV1,
} from './seyeon-production-relationship-read-v1.js';
import {
  projectSeyeonProductionRelationshipBandsV1,
} from './seyeon-production-relationship-band-v1.js';

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
    /** DB command atomically pins zero-proof with context_ready BEFORE models. */
    zeroPersonalProof: SeyeonAttemptZeroPersonalProofV1;
    exactModelSourceSelection: SeyeonExactModelPersonalSourceSelectionV1;
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

export type SeyeonProductionChatPostTurnExecutionModeV1 =
  | 'DEFERRED'
  | 'INLINE_BEST_EFFORT';

export interface SeyeonProductionChatPostTurnInputV1 {
  readonly ledger: SeyeonEventLedgerPortV2;
  readonly analysisOutboxPort: SeyeonPostTurnAnalysisOutboxPortV1;
  readonly executionMode?: SeyeonProductionChatPostTurnExecutionModeV1;
  readonly extractorProvider?:
    RunSeyeonCharacterTurnV2Input['interpreterProvider'];
  readonly lockOwner?: string;
  readonly leaseExpiresAt?: string;
  readonly semanticRelevanceByEventId: Readonly<Record<string, number>>;
  readonly recentlyMentionedEventIds?: readonly string[];
  readonly serverObservationRefs?: readonly string[];
}

export interface SeyeonProductionGovernanceResolutionInputV1 {
  readonly subjectId: string;
  readonly threadId: string;
  readonly userMessageRef: string;
  readonly userText: string;
  readonly turnBinding: SeyeonProductionRelationshipTurnBindingV1;
  readonly activation: SeyeonProductionRelationshipActivationV1;
  readonly productionContext: SeyeonProductionContextSnapshotV1;
}

export type SeyeonProductionGovernanceResolverV1 = (
  input: SeyeonProductionGovernanceResolutionInputV1,
) => Awaitable<RunSeyeonCharacterTurnV2Input['governance']>;

type BaseProductionSliceInputV1 = Omit<
  RunSeyeonProductionContextVerticalSliceInputV1<RunSeyeonCharacterTurnV2Result>,
  | 'threadId'
  | 'currentUserMessageRef'
  | 'bandProjection'
  | 'bandProjector'
  | 'productionHistoryRecords'
  | 'contextPort'
  | 'commitPort'
  | 'durableSync'
  | 'runCommittedTurn'
>;

export interface RunSeyeonProductionChatExecutionInputV1
extends BaseProductionSliceInputV1 {
  readonly threadId: string;
  readonly receivePlan: ChatReceivePlan;
  readonly baseContext: SeyeonProductionBoundCharacterContextInputV1;
  readonly governance?: RunSeyeonCharacterTurnV2Input['governance'];
  readonly resolveGovernance?: SeyeonProductionGovernanceResolverV1;
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

function postTurnInlineConfig(
  postTurn: SeyeonProductionChatPostTurnInputV1,
): Readonly<{
  extractorProvider: RunSeyeonCharacterTurnV2Input['interpreterProvider'];
  lockOwner: string;
  leaseExpiresAt: string;
}> | null {
  const mode = postTurn.executionMode ?? 'INLINE_BEST_EFFORT';
  if (mode === 'DEFERRED') return null;

  if (
    postTurn.extractorProvider === undefined ||
    postTurn.lockOwner === undefined ||
    postTurn.leaseExpiresAt === undefined
  ) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Inline post-turn execution requires extractor, lock owner, and lease expiry.',
    );
  }
  const leaseExpiresAt = boundedText(
    postTurn.leaseExpiresAt,
    'postTurn.leaseExpiresAt',
    64,
  );
  if (!Number.isFinite(Date.parse(leaseExpiresAt))) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'postTurn.leaseExpiresAt must be an ISO-compatible instant.',
    );
  }

  return Object.freeze({
    extractorProvider: postTurn.extractorProvider,
    lockOwner: boundedText(postTurn.lockOwner, 'postTurn.lockOwner', 256),
    leaseExpiresAt: new Date(leaseExpiresAt).toISOString(),
  });
}

async function resolveTurnGovernance(input: {
  readonly execution: RunSeyeonProductionChatExecutionInputV1;
  readonly subjectId: string;
  readonly threadId: string;
  readonly userMessageRef: string;
  readonly userText: string;
  readonly turnBinding: SeyeonProductionRelationshipTurnBindingV1;
  readonly activation: SeyeonProductionRelationshipActivationV1;
  readonly productionContext: SeyeonProductionContextSnapshotV1;
}): Promise<RunSeyeonCharacterTurnV2Input['governance']> {
  const base =
    input.execution.resolveGovernance === undefined
      ? input.execution.governance
      : await input.execution.resolveGovernance({
          subjectId: input.subjectId,
          threadId: input.threadId,
          userMessageRef: input.userMessageRef,
          userText: input.userText,
          turnBinding: input.turnBinding,
          activation: input.activation,
          productionContext: input.productionContext,
        });
  if (base === undefined) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Se-yeon Production execution requires server governance authority.',
    );
  }

  const semantics = relationshipSemanticsPort(
    base.relationshipSemantics,
    input.activation.appliedRelationshipSemantics,
  );
  return Object.freeze({
    ...base,
    ...(semantics === undefined
      ? {}
      : { relationshipSemantics: semantics }),
  });
}

export async function runSeyeonProductionChatExecutionV1(
  input: RunSeyeonProductionChatExecutionInputV1,
): Promise<RunSeyeonProductionChatExecutionResultV1> {
  const subjectId = boundedText(input.resolvedSubjectId, 'resolvedSubjectId', 256);
  const threadId = boundedText(input.threadId, 'threadId', 256);
  const receive = assertReceivePlan({ threadId, plan: input.receivePlan });
  const inlinePostTurn = postTurnInlineConfig(input.postTurn);
  const inlineDurableRelationshipRequired =
    inlinePostTurn !== null &&
    (
      input.mode === 'WRITE_DARK' ||
      input.mode === 'BEHAVIOR_SHADOW' ||
      input.mode === 'LIVE'
    );
  if (
    inlineDurableRelationshipRequired &&
    input.relationshipSyncOutboxPort === undefined
  ) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Inline write-capable post-turn execution requires durable relationship sync outbox authority.',
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
    const recoveryRows = await input.postTurn.analysisOutboxPort.findByTurn({
      subjectId,
      turnId: receivedTurn.turnId,
    });
    if (recoveryRows.length > 1) {
      throw new SeyeonProductionChatExecutionErrorV1(
        'Committed Chat replay resolved more than one post-turn analysis job.',
      );
    }
    const recoveryJob = recoveryRows[0];
    if (
      inlinePostTurn !== null &&
      recoveryJob !== undefined &&
      (recoveryJob.status === 'pending' ||
        recoveryJob.status === 'processing')
    ) {
      try {
        await processSeyeonPostTurnAnalysisV1({
          subjectId,
          outboxEventId: recoveryJob.outboxEventId,
          lockOwner: inlinePostTurn.lockOwner,
          leaseExpiresAt: inlinePostTurn.leaseExpiresAt,
          outboxPort: input.postTurn.analysisOutboxPort,
          extractorProvider: inlinePostTurn.extractorProvider,
          ...(input.relationshipSyncOutboxPort === undefined
            ? {}
            : {
                relationshipSyncOutboxPort:
                  input.relationshipSyncOutboxPort,
              }),
        });
      } catch {
        // Chat replay remains available while durable post-turn work is deferred
        // or waits for lease expiry/reclaim/downstream relationship recovery.
      }
    }
    return Object.freeze({
      ...committedReplay,
      committedTurn: Object.freeze({
        ...committedReplay.committedTurn,
        postTurnOutboxEventId:
          recoveryJob?.outboxEventId ?? null,
      }),
    });
  }

  const attempt = await input.persistencePort.allocateAttempt({
    subjectId,
    turnId: receivedTurn.turnId,
    attemptId: input.executionIdPort.nextAttemptId(),
    plannerVersion: SEYEON_PRODUCTION_CHAT_PLANNER_VERSION_V1,
  });
  assertSeyeonProductionAttemptOwnershipV1(attempt);

  const commitState: {
    value: SeyeonProductionChatCommitReceiptV1 | null;
  } = { value: null };

  let relationshipResult: RunSeyeonProductionContextVerticalSliceResultV1<RunSeyeonCharacterTurnV2Result>;
  try {
    relationshipResult = await runSeyeonProductionContextVerticalSliceV1({
      mode: input.mode,
      resolvedSubjectId: subjectId,
      threadId,
      currentUserMessageRef: receivedTurn.userMessageId,
      bandProjector: Object.freeze({
        project: projectSeyeonProductionRelationshipBandsV1,
      }),
      relationshipReadPort: input.relationshipReadPort,
      contextReadPort: input.contextReadPort,
      productionAuthorityRef: input.productionAuthorityRef,
      idPort: input.idPort,
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
        // Until exact-Grant atomic Commit is wired, do not invoke a model with
        // any positively admitted personal Memory/Life Fact in its context.
        assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
          productionContext,
        );
        // Pin the server-observed EMPTY personal-record set to this exact
        // attempt before model execution; persist it with Output Guard below.
        const personalRecordProof = createSeyeonAttemptZeroPersonalProofV1({
          subjectId,
          threadId,
          turnId: receivedTurn.turnId,
          attemptId: attempt.attemptId,
          context: productionContext,
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

        // Exact final selection shares the runtime normalizer/sorter/cap.
        // G1-B DB owner still must persist this set BEFORE Provider use.
        // No personal record is authorized here: the earlier HOLD remains.
        const exactModelPersonalSources = selectSeyeonExactModelPersonalSourcesV1({
          retrievedMemories: contextInput.retrievedMemories,
          ...(contextInput.maxRetrievedMemories === undefined ? {} : {
            maxRetrievedMemories: contextInput.maxRetrievedMemories,
          }),
          sourceCandidates: productionContext.personalRecordProjectionCandidates ?? [],
        });
        if (exactModelPersonalSources.selectedPersonalRecordCount !== 0 ||
            exactModelPersonalSources.permitsAtomicCommit !== false) {
          throw new SeyeonProductionChatExecutionErrorV1(
            'Se-yeon positive personal records require durable DB Pin and atomic Commit.',
          );
        }

        // This is a DB durability boundary, not a Grant/Reveal approval.
        // The owner RPC writes both exact zero markers and moves context_ready
        // in ONE PostgreSQL transaction; a failure prevents all Providers.
        await input.persistencePort.markContextReady({
          subjectId,
          turnId: receivedTurn.turnId,
          attemptId: attempt.attemptId,
          zeroPersonalProof: personalRecordProof,
          exactModelSourceSelection: exactModelPersonalSources,
        });

        const governance = await resolveTurnGovernance({
          execution: input,
          subjectId,
          threadId,
          userMessageRef: receivedTurn.userMessageId,
          userText: receivedTurn.userText,
          turnBinding,
          activation,
          productionContext,
        });

        const runtime = await runSeyeonCharacterTurnV2({
          userMessageRef: receivedTurn.userMessageId,
          userText: receivedTurn.userText,
          contextInput,
          governance,
          interpreterProvider: input.interpreterProvider,
          rendererProvider: input.rendererProvider,
          semanticReviewerProvider: input.semanticReviewerProvider,
        });
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
          productionHistoryRecords:
            productionContext.relationshipHistoryRecords,
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
            personalRecordProvenance: personalRecordProof,
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
        commitState.value = committed;

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
    if (commitState.value === null) {
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

  const committedTurn = commitState.value;
  if (committedTurn === null) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Production Chat execution returned without a committed assistant turn.',
    );
  }
  if (committedTurn.postTurnOutboxEventId === null) {
    throw new SeyeonProductionChatExecutionErrorV1(
      'Committed Production Chat turn is missing its durable post-turn outbox identity.',
    );
  }
  const runtimeResult = relationshipResult.turnResult;

  let postTurnAnalysis:
    RunSeyeonProductionChatExecutedResultV1['postTurnAnalysis'];
  if (inlinePostTurn === null) {
    postTurnAnalysis = Object.freeze({
      status: 'deferred' as const,
      outboxEventId: committedTurn.postTurnOutboxEventId,
    });
  } else {
    try {
      const result = await processSeyeonPostTurnAnalysisV1({
        subjectId,
        outboxEventId: committedTurn.postTurnOutboxEventId,
        lockOwner: inlinePostTurn.lockOwner,
        leaseExpiresAt: inlinePostTurn.leaseExpiresAt,
        outboxPort: input.postTurn.analysisOutboxPort,
        extractorProvider: inlinePostTurn.extractorProvider,
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
