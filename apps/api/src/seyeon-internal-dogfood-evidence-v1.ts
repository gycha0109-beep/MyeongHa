import {
  getChatThreadRuntimeBinding,
} from './chat-thread-runtime-binding-read.js';
import {
  getChatThreadStream,
} from './chat-thread-stream-read.js';
import {
  getMemoryGrants,
} from './memory-grants-read.js';
import {
  getMemoryItems,
} from './memory-items-read.js';
import {
  createOpenAiSeyeonStructuredProviderV1,
} from './openai-seyeon-structured-provider-v1.js';
import {
  createPostgresChatThreadRuntimeBindingAuthorityPortV1,
} from './postgres-chat-thread-runtime-binding.js';
import {
  createPostgresChatThreadStreamReadAuthorityPortV1,
} from './postgres-chat-thread-stream-v1.js';
import {
  createPostgresReaderContextMemoryGrantsAuthorityPortV1,
  createPostgresReaderContextMemoryItemsAuthorityPortV1,
} from './postgres-reader-context-memory.js';
import {
  createPostgresSeyeonProductionContextReadAuthorityPortV1,
} from './postgres-seyeon-production-context-read-v1.js';
import {
  createPostgresSeyeonProductionRelationshipReadAuthorityPortV1,
} from './postgres-seyeon-production-relationship-read-v1.js';
import type {
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  createProductionPostgresSubjectPoolLeaseV1,
} from './production-postgres-subject-pool-lease.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import {
  createProductionSeyeonInternalDogfoodRelationshipInspectorV1,
  inspectSeyeonInternalDogfoodRelationshipV1,
  type SeyeonInternalDogfoodRelationshipInspectionV1,
  type SeyeonInternalDogfoodRelationshipInspectorV1,
} from './seyeon-internal-dogfood-relationship-inspector-v1.js';
import {
  createProductionSeyeonInternalDogfoodHarnessV1,
  type ProductionSeyeonInternalDogfoodHarnessV1,
} from './seyeon-internal-dogfood-harness-v1.js';
import {
  parseSeyeonInternalLiveProviderConfigV1,
  runSeyeonInternalLiveDogfoodSessionV1,
} from './seyeon-internal-live-dogfood-v1.js';
import {
  assertSeyeonInternalDogfoodRelationshipPreconditionV1,
  buildSeyeonInternalDogfoodClientTurnIdV1,
  runSeyeonInternalDogfoodScenarioV1,
  type RunSeyeonInternalDogfoodScenarioResultV1,
} from './seyeon-internal-dogfood-scenario-runner-v1.js';
import type {
  SeyeonInternalDogfoodScenarioV1,
} from './seyeon-internal-dogfood-scenarios-v1.js';
import {
  createSeyeonProductionSubjectTransactionRunnerV1,
} from './seyeon-production-subject-transaction-v1.js';
import {
  createObservedSeyeonStructuredProviderV1,
  diffSeyeonStructuredProviderInvocationsV1,
  type ObservedSeyeonStructuredProviderV1,
  type SeyeonStructuredProviderInvocationSnapshotV1,
} from './seyeon-structured-provider-observer-v1.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const SEYEON_INTERNAL_DOGFOOD_EVIDENCE_VERSION_V1 =
  'seyeon-internal-dogfood-evidence-v1' as const;

export type SeyeonInternalDogfoodTechnicalVerdictV1 =
  | 'PASS'
  | 'FAIL'
  | 'NOT_RUN_PREREQUISITE';

export interface SeyeonInternalDogfoodEvidenceSnapshotV1 {
  readonly version:
    typeof SEYEON_INTERNAL_DOGFOOD_EVIDENCE_VERSION_V1;
  readonly subjectId: string;
  readonly thread: Readonly<{
    readonly threadId: string;
    readonly activeContentReleaseId: string;
    readonly activeContentBundleId: string;
    readonly contentRevision: number;
    readonly participantCharacterIds: readonly string[];
  }>;
  readonly stream: Readonly<{
    readonly messageCount: number;
    readonly maxSequenceNo: number;
    readonly messageIds: readonly string[];
    readonly userMessageCount: number;
    readonly characterMessageCount: number;
    readonly systemMessageCount: number;
  }>;
  readonly memory: Readonly<{
    readonly itemIds: readonly string[];
    readonly grants: readonly Readonly<{
      readonly memoryItemId: string;
      readonly grantId: string;
      readonly characterId: string;
    }>[];
  }>;
  readonly relationship:
    SeyeonInternalDogfoodRelationshipInspectionV1;
}

export interface SeyeonInternalDogfoodEvidenceInspectorV1 {
  inspect(input: {
    readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
    readonly threadId: string;
  }): Promise<SeyeonInternalDogfoodEvidenceSnapshotV1>;
}

export interface ConfiguredSeyeonInternalDogfoodEvidenceRuntimeV1 {
  readonly pool: PostgresSubjectPoolV1;
  readonly harness: ProductionSeyeonInternalDogfoodHarnessV1;
  readonly observer: ObservedSeyeonStructuredProviderV1;
  readonly relationshipInspector:
    SeyeonInternalDogfoodRelationshipInspectorV1;
  readonly evidenceInspector:
    SeyeonInternalDogfoodEvidenceInspectorV1;
  close(): Promise<void>;
}

export function createConfiguredSeyeonInternalDogfoodEvidenceRuntimeV1(
  env: ProductionUserDataRuntimeEnvV1,
): ConfiguredSeyeonInternalDogfoodEvidenceRuntimeV1 {
  const databaseConfig = parseProductionUserDataRuntimeConfigV1(env);
  const providerConfig =
    parseSeyeonInternalLiveProviderConfigV1(env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config: databaseConfig,
  });
  const observer = createObservedSeyeonStructuredProviderV1(
    createOpenAiSeyeonStructuredProviderV1(providerConfig),
  );
  const harness = createProductionSeyeonInternalDogfoodHarnessV1({
    databaseConfig,
    provider: observer.provider,
    pool: poolLease.pool,
  });
  const relationshipInspector =
    createProductionSeyeonInternalDogfoodRelationshipInspectorV1({
      pool: poolLease.pool,
    });
  const evidenceInspector =
    createProductionSeyeonInternalDogfoodEvidenceInspectorV1({
      pool: poolLease.pool,
    });

  return Object.freeze({
    pool: poolLease.pool,
    harness,
    observer,
    relationshipInspector,
    evidenceInspector,
    async close() {
      await harness.close();
      await poolLease.close();
    },
  });
}

export interface RunSeyeonInternalDogfoodEvidenceInputV1 {
  readonly harness: ProductionSeyeonInternalDogfoodHarnessV1;
  readonly observer: ObservedSeyeonStructuredProviderV1;
  readonly evidenceInspector: SeyeonInternalDogfoodEvidenceInspectorV1;
  readonly relationshipInspector?:
    SeyeonInternalDogfoodRelationshipInspectorV1;
  readonly scenario: SeyeonInternalDogfoodScenarioV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly threadId: string;
  readonly runId: string;
  readonly now?: () => Date;
}

export interface RunSeyeonInternalDogfoodEvidenceResultV1 {
  readonly version:
    typeof SEYEON_INTERNAL_DOGFOOD_EVIDENCE_VERSION_V1;
  readonly verdict: SeyeonInternalDogfoodTechnicalVerdictV1;
  readonly reasons: readonly string[];
  readonly preflight: SeyeonInternalDogfoodEvidenceSnapshotV1;
  readonly scenario: RunSeyeonInternalDogfoodScenarioResultV1 | null;
  readonly postRun: SeyeonInternalDogfoodEvidenceSnapshotV1 | null;
  readonly replay: Readonly<{
    readonly providerDelta:
      SeyeonStructuredProviderInvocationSnapshotV1;
    readonly disposition: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly assistantMessageId: string;
    readonly sequenceNo: number;
    readonly committedAt: string;
  }> | null;
  readonly postReplay: SeyeonInternalDogfoodEvidenceSnapshotV1 | null;
}

function stableStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort());
}

function snapshotEqual(
  left: unknown,
  right: unknown,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cleanStartReasons(
  scenario: SeyeonInternalDogfoodScenarioV1,
  snapshot: SeyeonInternalDogfoodEvidenceSnapshotV1,
): readonly string[] {
  const expected = scenario.evidencePrecondition;
  if (expected === undefined) return Object.freeze([]);

  const reasons: string[] = [];
  if (
    expected.threadMustBeEmpty === true &&
    snapshot.stream.messageCount !== 0
  ) {
    reasons.push(
      'Scenario requires an empty authoritative Chat thread stream.',
    );
  }
  if (
    expected.relationshipMustBeEmpty === true &&
    (
      snapshot.relationship.relationship !== null ||
      snapshot.relationship.activeEventIds.length !== 0
    )
  ) {
    reasons.push(
      'Scenario requires an empty authoritative Se-yeon relationship.',
    );
  }
  return Object.freeze(reasons);
}

function relationshipPreconditionReasons(
  scenario: SeyeonInternalDogfoodScenarioV1,
  snapshot: SeyeonInternalDogfoodEvidenceSnapshotV1,
): readonly string[] {
  if (scenario.relationshipPrecondition === undefined) {
    return Object.freeze([]);
  }
  try {
    assertSeyeonInternalDogfoodRelationshipPreconditionV1(
      scenario,
      snapshot.relationship,
    );
    return Object.freeze([]);
  } catch (error) {
    return Object.freeze([
      error instanceof Error
        ? error.message
        : 'Relationship precondition is not satisfied.',
    ]);
  }
}

function technicalReasons(input: {
  readonly preflight: SeyeonInternalDogfoodEvidenceSnapshotV1;
  readonly scenario: RunSeyeonInternalDogfoodScenarioResultV1;
  readonly postRun: SeyeonInternalDogfoodEvidenceSnapshotV1;
  readonly replay: Readonly<{
    readonly providerDelta:
      SeyeonStructuredProviderInvocationSnapshotV1;
    readonly disposition: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly assistantMessageId: string;
    readonly sequenceNo: number;
    readonly committedAt: string;
  }>;
  readonly postReplay: SeyeonInternalDogfoodEvidenceSnapshotV1;
}): readonly string[] {
  const reasons: string[] = [];

  if (
    input.preflight.subjectId !== input.scenario.subjectId ||
    input.postRun.subjectId !== input.scenario.subjectId ||
    input.postReplay.subjectId !== input.scenario.subjectId
  ) {
    reasons.push('Canonical Subject drifted during dogfood execution.');
  }

  const preThread = input.preflight.thread;
  const postThread = input.postRun.thread;
  if (
    preThread.threadId !== postThread.threadId ||
    preThread.activeContentReleaseId !== postThread.activeContentReleaseId ||
    preThread.activeContentBundleId !== postThread.activeContentBundleId ||
    preThread.contentRevision !== postThread.contentRevision ||
    !snapshotEqual(
      preThread.participantCharacterIds,
      postThread.participantCharacterIds,
    )
  ) {
    reasons.push('Thread/content binding drifted during scenario execution.');
  }

  const expectedMessageDelta = input.scenario.turnCount * 2;
  const actualMessageDelta =
    input.postRun.stream.messageCount -
    input.preflight.stream.messageCount;
  if (actualMessageDelta !== expectedMessageDelta) {
    reasons.push(
      'Scenario message delta does not equal exactly two committed messages per fresh turn.',
    );
  }

  const turnIds = new Set<string>();
  const attemptIds = new Set<string>();
  const assistantMessageIds = new Set<string>();
  let previousRevision = -1;
  for (const turn of input.scenario.turns) {
    const committed = turn.assistant.committedTurn;
    if (turnIds.has(committed.turnId)) {
      reasons.push('Scenario reused a committed turn identity.');
    }
    if (attemptIds.has(committed.attemptId)) {
      reasons.push('Scenario reused a committed attempt identity.');
    }
    if (assistantMessageIds.has(committed.assistantMessageId)) {
      reasons.push('Scenario reused an assistant message identity.');
    }
    turnIds.add(committed.turnId);
    attemptIds.add(committed.attemptId);
    assistantMessageIds.add(committed.assistantMessageId);

    if (
      !input.postRun.stream.messageIds.includes(
        committed.assistantMessageId,
      )
    ) {
      reasons.push(
        'Committed assistant message is absent from authoritative thread stream.',
      );
    }

    const used = turn.assistant.relationshipRevisionUsedForTurn;
    if (used !== null) {
      if (used < previousRevision) {
        reasons.push(
          'Relationship revision used for turns moved backwards.',
        );
      }
      previousRevision = used;
    }
  }

  if (
    !snapshotEqual(
      input.preflight.memory,
      input.postRun.memory,
    )
  ) {
    reasons.push(
      'Durable personal Memory items or grants changed during dogfood execution.',
    );
  }

  const finalTurn =
    input.scenario.turns[input.scenario.turns.length - 1];
  if (finalTurn === undefined) {
    reasons.push('Scenario produced no final committed turn.');
  } else {
    const finalCommitted = finalTurn.assistant.committedTurn;
    if (input.replay.disposition !== 'committed_replay') {
      reasons.push('Final replay did not return committed_replay.');
    }
    if (
      input.replay.turnId !== finalCommitted.turnId ||
      input.replay.attemptId !== finalCommitted.attemptId ||
      input.replay.assistantMessageId !==
        finalCommitted.assistantMessageId ||
      input.replay.sequenceNo !== finalCommitted.sequenceNo ||
      input.replay.committedAt !== finalCommitted.committedAt
    ) {
      reasons.push(
        'Final committed replay identity differs from the original committed turn.',
      );
    }
  }

  if (input.replay.providerDelta.total !== 0) {
    reasons.push('Final committed replay invoked the provider again.');
  }

  if (!snapshotEqual(input.postRun, input.postReplay)) {
    reasons.push(
      'Final committed replay changed authoritative DB evidence.',
    );
  }

  return Object.freeze(reasons);
}

function leaseExpiresAt(now: Date): string {
  return new Date(now.getTime() + 15 * 60_000).toISOString();
}

function lockSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, '_');
}

export function createProductionSeyeonInternalDogfoodEvidenceInspectorV1(
  input: {
    readonly pool: PostgresSubjectPoolV1;
  },
): SeyeonInternalDogfoodEvidenceInspectorV1 {
  return Object.freeze({
    async inspect(request: {
      readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
      readonly threadId: string;
    }) {
      const runner =
        createSeyeonProductionSubjectTransactionRunnerV1({
          pool: input.pool,
          verifiedEvidence: request.verifiedEvidence,
        });
      const resolved = await runner.resolveSubject();

      return await runner.run(
        resolved.subjectId,
        async (client) => {
          const thread = await getChatThreadRuntimeBinding({
            resolvedSubjectId: resolved.subjectId,
            threadId: request.threadId,
            authorityPort:
              createPostgresChatThreadRuntimeBindingAuthorityPortV1(
                client,
              ),
          });
          const stream = await getChatThreadStream({
            resolvedSubjectId: resolved.subjectId,
            threadId: request.threadId,
            afterSequenceNo: 0,
            authorityPort:
              createPostgresChatThreadStreamReadAuthorityPortV1(
                client,
              ),
          });
          const memoryItems = await getMemoryItems({
            resolvedSubjectId: resolved.subjectId,
            authorityPort:
              createPostgresReaderContextMemoryItemsAuthorityPortV1(
                client,
              ),
          });
          const grantPort =
            createPostgresReaderContextMemoryGrantsAuthorityPortV1(
              client,
            );
          const grants: Array<Readonly<{
            memoryItemId: string;
            grantId: string;
            characterId: string;
          }>> = [];
          for (const item of memoryItems.memories) {
            const response = await getMemoryGrants({
              resolvedSubjectId: resolved.subjectId,
              memoryItemId: item.memoryItemId,
              authorityPort: grantPort,
            });
            for (const grant of response.grants) {
              grants.push(Object.freeze({
                memoryItemId: item.memoryItemId,
                grantId: grant.grantId,
                characterId: grant.characterId,
              }));
            }
          }

          const relationship =
            await inspectSeyeonInternalDogfoodRelationshipV1({
              subjectId: resolved.subjectId,
              relationshipReadPort:
                createPostgresSeyeonProductionRelationshipReadAuthorityPortV1(
                  client,
                ),
              contextReadPort:
                createPostgresSeyeonProductionContextReadAuthorityPortV1(
                  client,
                ),
            });

          const counts = {
            user: 0,
            character: 0,
            system: 0,
          };
          for (const message of stream.messages) {
            counts[message.senderType] += 1;
          }
          const maxSequenceNo =
            stream.messages.length === 0
              ? 0
              : stream.messages[stream.messages.length - 1]!.sequenceNo;

          return Object.freeze({
            version:
              SEYEON_INTERNAL_DOGFOOD_EVIDENCE_VERSION_V1,
            subjectId: resolved.subjectId,
            thread: Object.freeze({
              threadId: thread.threadId,
              activeContentReleaseId:
                thread.activeContentReleaseId,
              activeContentBundleId:
                thread.activeContentBundleId,
              contentRevision: thread.contentRevision,
              participantCharacterIds: Object.freeze([
                ...thread.participantCharacterIds,
              ]),
            }),
            stream: Object.freeze({
              messageCount: stream.messages.length,
              maxSequenceNo,
              messageIds: stableStrings(
                stream.messages.map((message) => message.messageId),
              ),
              userMessageCount: counts.user,
              characterMessageCount: counts.character,
              systemMessageCount: counts.system,
            }),
            memory: Object.freeze({
              itemIds: stableStrings(
                memoryItems.memories.map(
                  (item) => item.memoryItemId,
                ),
              ),
              grants: Object.freeze(
                [...grants].sort((left, right) =>
                  (
                    left.memoryItemId + ':' +
                    left.grantId + ':' +
                    left.characterId
                  ).localeCompare(
                    right.memoryItemId + ':' +
                    right.grantId + ':' +
                    right.characterId,
                  ),
                ),
              ),
            }),
            relationship,
          });
        },
      );
    },
  });
}

export async function runSeyeonInternalDogfoodEvidenceV1(
  input: RunSeyeonInternalDogfoodEvidenceInputV1,
): Promise<RunSeyeonInternalDogfoodEvidenceResultV1> {
  const preflight = await input.evidenceInspector.inspect({
    verifiedEvidence: input.verifiedEvidence,
    threadId: input.threadId,
  });

  const prerequisiteReasons = Object.freeze([
    ...cleanStartReasons(input.scenario, preflight),
    ...relationshipPreconditionReasons(
      input.scenario,
      preflight,
    ),
  ]);
  if (prerequisiteReasons.length > 0) {
    return Object.freeze({
      version: SEYEON_INTERNAL_DOGFOOD_EVIDENCE_VERSION_V1,
      verdict: 'NOT_RUN_PREREQUISITE' as const,
      reasons: prerequisiteReasons,
      preflight,
      scenario: null,
      postRun: null,
      replay: null,
      postReplay: null,
    });
  }

  const scenario = await runSeyeonInternalDogfoodScenarioV1({
    harness: input.harness,
    observer: input.observer,
    ...(input.relationshipInspector === undefined
      ? {}
      : { relationshipInspector: input.relationshipInspector }),
    scenario: input.scenario,
    verifiedEvidence: input.verifiedEvidence,
    threadId: input.threadId,
    runId: input.runId,
    verifyFinalReplay: false,
    ...(input.now === undefined ? {} : { now: input.now }),
  });

  const postRun = await input.evidenceInspector.inspect({
    verifiedEvidence: input.verifiedEvidence,
    threadId: input.threadId,
  });

  const finalTurnIndex = input.scenario.turns.length;
  const finalFixture =
    input.scenario.turns[finalTurnIndex - 1];
  if (finalFixture === undefined) {
    throw new Error(
      'Evidence runner cannot replay an empty scenario.',
    );
  }
  const finalClientTurnId =
    buildSeyeonInternalDogfoodClientTurnIdV1(
      input.scenario.scenarioId,
      input.runId,
      finalTurnIndex,
    );
  const now = input.now?.() ?? new Date();
  const expiresAt = leaseExpiresAt(now);
  const beforeReplayProvider = input.observer.snapshot();

  const replaySession =
    await runSeyeonInternalLiveDogfoodSessionV1({
      harness: input.harness,
      observer: input.observer,
      verifyReplay: false,
      turn: Object.freeze({
        verifiedEvidence: input.verifiedEvidence,
        threadId: input.threadId,
        clientTurnId: finalClientTurnId,
        text: finalFixture.text,
        postTurnLease: Object.freeze({
          lockOwner:
            'seyeon-evidence-post-' +
            lockSuffix(finalClientTurnId),
          leaseExpiresAt: expiresAt,
        }),
        relationshipLease: Object.freeze({
          lockOwner:
            'seyeon-evidence-relationship-' +
            lockSuffix(finalClientTurnId),
          leaseExpiresAt: expiresAt,
        }),
      }),
    });

  const replayProviderDelta =
    diffSeyeonStructuredProviderInvocationsV1(
      beforeReplayProvider,
      input.observer.snapshot(),
    );
  const replay = Object.freeze({
    providerDelta: replayProviderDelta,
    disposition: replaySession.first.disposition,
    turnId: replaySession.first.committedTurn.turnId,
    attemptId: replaySession.first.committedTurn.attemptId,
    assistantMessageId:
      replaySession.first.committedTurn.assistantMessageId,
    sequenceNo: replaySession.first.committedTurn.sequenceNo,
    committedAt: replaySession.first.committedTurn.committedAt,
  });

  const postReplay = await input.evidenceInspector.inspect({
    verifiedEvidence: input.verifiedEvidence,
    threadId: input.threadId,
  });

  const reasons = technicalReasons({
    preflight,
    scenario,
    postRun,
    replay,
    postReplay,
  });

  return Object.freeze({
    version: SEYEON_INTERNAL_DOGFOOD_EVIDENCE_VERSION_V1,
    verdict: reasons.length === 0 ? 'PASS' as const : 'FAIL' as const,
    reasons,
    preflight,
    scenario,
    postRun,
    replay,
    postReplay,
  });
}
