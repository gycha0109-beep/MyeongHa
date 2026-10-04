import { describe, expect, it } from 'vitest';

import type {
  RunSeyeonInternalDogfoodTurnResultV1,
  ProductionSeyeonInternalDogfoodHarnessV1,
} from '../apps/api/src/seyeon-internal-dogfood-harness-v1.js';
import {
  runSeyeonInternalDogfoodEvidenceV1,
  type SeyeonInternalDogfoodEvidenceSnapshotV1,
} from '../apps/api/src/seyeon-internal-dogfood-evidence-v1.js';
import {
  createObservedSeyeonStructuredProviderV1,
} from '../apps/api/src/seyeon-structured-provider-observer-v1.js';
import type {
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';

function snapshot(input: {
  readonly messages: readonly Readonly<{
    id: string;
    sender: 'user' | 'character';
    sequence: number;
  }>[];
}): SeyeonInternalDogfoodEvidenceSnapshotV1 {
  return {
    version: 'seyeon-internal-dogfood-evidence-v1',
    subjectId: 'subject-1',
    thread: {
      threadId: 'thread-1',
      activeContentReleaseId: 'release-1',
      activeContentBundleId: 'bundle-1',
      contentRevision: 1,
      participantCharacterIds: ['seyeon'],
    },
    stream: {
      messageCount: input.messages.length,
      maxSequenceNo:
        input.messages[input.messages.length - 1]?.sequence ?? 0,
      messageIds: input.messages.map((item) => item.id).sort(),
      userMessageCount:
        input.messages.filter((item) => item.sender === 'user').length,
      characterMessageCount:
        input.messages.filter((item) => item.sender === 'character').length,
      systemMessageCount: 0,
    },
    memory: {
      itemIds: [],
      grants: [],
    },
    relationship: {
      version: 'seyeon-internal-dogfood-relationship-inspector-v1',
      subjectId: 'subject-1',
      relationship: null,
      activeEventKinds: [],
      activeEventIds: [],
    },
  };
}

function executed(): RunSeyeonInternalDogfoodTurnResultV1 {
  return {
    version: 'seyeon-internal-dogfood-harness-v1',
    disposition: 'executed',
    subjectId: 'subject-1',
    chat: {
      runtimeVersion: 'production-seyeon-chat-runtime-v1',
      subjectId: 'subject-1',
      threadBinding: {},
      bundleManifest: {},
      execution: {
        version: 'seyeon-production-chat-execution-v1',
        disposition: 'executed',
        receivedTurn: {},
        attempt: {},
        committedTurn: {
          turnId: 'turn-1',
          attemptId: 'attempt-1',
          assistantMessageId: 'assistant-1',
          sequenceNo: 2,
          committedAt: '2026-10-04T00:00:00.000Z',
          postTurnOutboxEventId: 'post-1',
          replayed: false,
        },
        runtimeResult: {
          envelope: { utterance: '안녕하세요.' },
        },
        relationshipResult: {
          relationshipRevisionUsedForTurn: null,
          turnBinding: {
            relationship: null,
            relationshipSemantics: null,
          },
        },
        postTurnAnalysis: {
          status: 'deferred',
          outboxEventId: 'post-1',
        },
      },
    },
    postTurn: {
      runtimeVersion: 'production-seyeon-post-turn-worker-runtime-v1',
      subjectId: 'subject-1',
      result: { decision: 'none' },
    },
    relationship: null,
    relationshipRevision: null,
  } as unknown as RunSeyeonInternalDogfoodTurnResultV1;
}

function replay(): RunSeyeonInternalDogfoodTurnResultV1 {
  return {
    version: 'seyeon-internal-dogfood-harness-v1',
    disposition: 'committed_replay',
    subjectId: 'subject-1',
    chat: {
      runtimeVersion: 'production-seyeon-chat-runtime-v1',
      subjectId: 'subject-1',
      threadBinding: {},
      bundleManifest: {},
      execution: {
        version: 'seyeon-production-chat-execution-v1',
        disposition: 'committed_replay',
        receivedTurn: {},
        committedTurn: {
          turnId: 'turn-1',
          attemptId: 'attempt-1',
          assistantMessageId: 'assistant-1',
          sequenceNo: 2,
          committedAt: '2026-10-04T00:00:00.000Z',
          postTurnOutboxEventId: null,
          replayed: true,
        },
        assistantText: '안녕하세요.',
      },
    },
    postTurn: null,
    relationship: null,
    relationshipRevision: null,
  } as unknown as RunSeyeonInternalDogfoodTurnResultV1;
}

describe('Se-yeon live dogfood evidence V1', () => {
  it('returns NOT_RUN_PREREQUISITE before provider execution for a dirty clean-start thread', async () => {
    const observer = createObservedSeyeonStructuredProviderV1({
      providerKey: 'test-provider',
      modelKey: 'test-model',
      async generate() {
        return {};
      },
    });
    let harnessCalls = 0;
    const harness: ProductionSeyeonInternalDogfoodHarnessV1 = {
      async run() {
        harnessCalls += 1;
        return executed();
      },
      async close() {},
    };

    const result = await runSeyeonInternalDogfoodEvidenceV1({
      harness,
      observer,
      evidenceInspector: {
        async inspect() {
          return snapshot({
            messages: [{
              id: 'existing-1',
              sender: 'user',
              sequence: 1,
            }],
          });
        },
      },
      scenario: {
        scenarioId: 'first-meeting-v1',
        description: 'clean start',
        reviewFocus: [],
        evidencePrecondition: {
          threadMustBeEmpty: true,
          relationshipMustBeEmpty: true,
        },
        turns: [{ text: 'hello' }],
      },
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: 'auth-user-1',
      },
      threadId: 'thread-1',
      runId: 'run-001',
    });

    expect(result.verdict).toBe('NOT_RUN_PREREQUISITE');
    expect(harnessCalls).toBe(0);
    expect(observer.snapshot().total).toBe(0);
  });

  it('passes on exact two-message commit, zero Memory delta, and read-only committed replay', async () => {
    const observer = createObservedSeyeonStructuredProviderV1({
      providerKey: 'test-provider',
      modelKey: 'test-model',
      async generate(request: SeyeonStructuredProviderRequestV2) {
        return { purpose: request.purpose };
      },
    });
    let harnessCalls = 0;
    const harness: ProductionSeyeonInternalDogfoodHarnessV1 = {
      async run() {
        harnessCalls += 1;
        if (harnessCalls === 1) {
          await observer.provider.generate({
            contractVersion: 'seyeon-structured-provider-v2',
            purpose: 'dialogue_render',
            instructions: 'test',
            input: {},
            responseSchema: {},
          });
          return executed();
        }
        return replay();
      },
      async close() {},
    };
    const snapshots = [
      snapshot({ messages: [] }),
      snapshot({
        messages: [
          { id: 'user-1', sender: 'user', sequence: 1 },
          { id: 'assistant-1', sender: 'character', sequence: 2 },
        ],
      }),
      snapshot({
        messages: [
          { id: 'user-1', sender: 'user', sequence: 1 },
          { id: 'assistant-1', sender: 'character', sequence: 2 },
        ],
      }),
    ];
    let snapshotIndex = 0;

    const result = await runSeyeonInternalDogfoodEvidenceV1({
      harness,
      observer,
      evidenceInspector: {
        async inspect() {
          return snapshots[snapshotIndex++]!;
        },
      },
      scenario: {
        scenarioId: 'first-meeting-v1',
        description: 'clean start',
        reviewFocus: [],
        evidencePrecondition: {
          threadMustBeEmpty: true,
          relationshipMustBeEmpty: true,
        },
        turns: [{ text: '안녕하세요.' }],
      },
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: 'auth-user-1',
      },
      threadId: 'thread-1',
      runId: 'run-001',
      now: () => new Date('2026-10-04T00:00:00.000Z'),
    });

    expect(result.verdict).toBe('PASS');
    expect(result.reasons).toEqual([]);
    expect(result.scenario?.turnCount).toBe(1);
    expect(result.replay?.providerDelta.total).toBe(0);
    expect(result.postRun?.memory).toEqual(result.preflight.memory);
    expect(result.postReplay).toEqual(result.postRun);
  });
});
