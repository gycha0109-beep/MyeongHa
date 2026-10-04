import { describe, expect, it } from 'vitest';

import type {
  ProductionSeyeonInternalDogfoodHarnessV1,
  RunSeyeonInternalDogfoodTurnResultV1,
} from '../apps/api/src/seyeon-internal-dogfood-harness-v1.js';
import {
  runSeyeonInternalDogfoodScenarioV1,
} from '../apps/api/src/seyeon-internal-dogfood-scenario-runner-v1.js';
import type {
  SeyeonInternalDogfoodScenarioV1,
} from '../apps/api/src/seyeon-internal-dogfood-scenarios-v1.js';
import {
  createObservedSeyeonStructuredProviderV1,
} from '../apps/api/src/seyeon-structured-provider-observer-v1.js';
import type {
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';

function executed(
  input: {
    readonly clientTurnId: string;
    readonly index: number;
  },
): RunSeyeonInternalDogfoodTurnResultV1 {
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
          turnId: 'turn-' + input.index,
          attemptId: 'attempt-' + input.index,
          assistantMessageId: 'assistant-' + input.index,
          sequenceNo: input.index * 2,
          committedAt: '2026-10-04T06:00:00.000Z',
          postTurnOutboxEventId: 'post-' + input.index,
          replayed: false,
        },
        runtimeResult: {
          envelope: {
            utterance: 'assistant ' + input.clientTurnId,
          },
        },
        relationshipResult: {
          relationshipRevisionUsedForTurn: input.index - 1,
          turnBinding: {
            relationship: {
              revision: input.index - 1,
              stageKey: 'S0_FIRST_MEETING',
              closenessBand: 'low',
              trustBand: 'low',
              frictionBand: 'low',
            },
          },
        },
        postTurnAnalysis: {
          status: 'deferred',
          outboxEventId: 'post-' + input.index,
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

function replay(
  input: {
    readonly clientTurnId: string;
    readonly index: number;
  },
): RunSeyeonInternalDogfoodTurnResultV1 {
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
          turnId: 'turn-' + input.index,
          attemptId: 'attempt-' + input.index,
          assistantMessageId: 'assistant-' + input.index,
          sequenceNo: input.index * 2,
          committedAt: '2026-10-04T06:00:00.000Z',
          postTurnOutboxEventId: null,
          replayed: true,
        },
        assistantText: 'assistant ' + input.clientTurnId,
      },
    },
    postTurn: null,
    relationship: null,
    relationshipRevision: null,
  } as unknown as RunSeyeonInternalDogfoodTurnResultV1;
}

describe('Se-yeon internal dogfood scenario runner V1', () => {
  it('runs turns sequentially and verifies the final committed replay', async () => {
    const delegate = {
      providerKey: 'test-provider',
      modelKey: 'test-model',
      async generate(request: SeyeonStructuredProviderRequestV2) {
        return { purpose: request.purpose };
      },
    };
    const observer = createObservedSeyeonStructuredProviderV1(delegate);
    const seen = new Map<string, number>();
    let executionIndex = 0;

    const harness: ProductionSeyeonInternalDogfoodHarnessV1 = {
      async run(turn) {
        const prior = seen.get(turn.clientTurnId);
        if (prior !== undefined) {
          return replay({
            clientTurnId: turn.clientTurnId,
            index: prior,
          });
        }

        executionIndex += 1;
        seen.set(turn.clientTurnId, executionIndex);
        await observer.provider.generate({
          contractVersion: 'seyeon-structured-provider-v2',
          purpose: 'dialogue_render',
          instructions: 'test',
          input: {},
          responseSchema: {},
        });
        return executed({
          clientTurnId: turn.clientTurnId,
          index: executionIndex,
        });
      },
      async close() {},
    };

    const scenario: SeyeonInternalDogfoodScenarioV1 = {
      scenarioId: 'first-meeting-v1',
      description: 'test scenario',
      reviewFocus: ['continuity'],
      turns: [
        { text: 'one' },
        { text: 'two' },
        { text: 'three' },
      ],
    };

    const result = await runSeyeonInternalDogfoodScenarioV1({
      harness,
      observer,
      scenario,
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: 'auth-user-1',
      },
      threadId: 'thread-1',
      runId: 'run-001',
      verifyFinalReplay: true,
      now: () => new Date('2026-10-04T06:00:00.000Z'),
    });

    expect(result.turnCount).toBe(3);
    expect(result.turns.map((turn) => turn.clientTurnId)).toEqual([
      'dogfood:first-meeting-v1:run-001:01',
      'dogfood:first-meeting-v1:run-001:02',
      'dogfood:first-meeting-v1:run-001:03',
    ]);
    expect(result.turns.map((turn) => turn.providerDelta.total)).toEqual([
      1, 1, 1,
    ]);
    expect(result.turns[0]?.assistant.relationshipRevisionUsedForTurn)
      .toBe(0);
    expect(result.turns[2]?.finalReplay?.providerDelta.total).toBe(0);
    expect(result.providerDelta.total).toBe(3);
  });

  it('rejects a run id that cannot be safely embedded in clientTurnId', async () => {
    const observer = createObservedSeyeonStructuredProviderV1({
      providerKey: 'test-provider',
      modelKey: 'test-model',
      async generate() {
        return {};
      },
    });
    const harness: ProductionSeyeonInternalDogfoodHarnessV1 = {
      async run() {
        throw new Error('must not run');
      },
      async close() {},
    };

    await expect(
      runSeyeonInternalDogfoodScenarioV1({
        harness,
        observer,
        scenario: {
          scenarioId: 'first-meeting-v1',
          description: 'test',
          reviewFocus: [],
          turns: [{ text: 'one' }],
        },
        verifiedEvidence: {
          kind: 'member',
          verifiedAuthUserId: 'auth-user-1',
        },
        threadId: 'thread-1',
        runId: 'bad run id',
        verifyFinalReplay: false,
      }),
    ).rejects.toThrow(/runId/i);
  });
});
