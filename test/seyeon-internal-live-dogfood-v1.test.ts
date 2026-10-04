import { describe, expect, it } from 'vitest';

import {
  parseSeyeonInternalLiveDogfoodCommandV1,
  parseSeyeonInternalLiveProviderConfigV1,
  runSeyeonInternalLiveDogfoodSessionV1,
} from '../apps/api/src/seyeon-internal-live-dogfood-v1.js';
import {
  createObservedSeyeonStructuredProviderV1,
} from '../apps/api/src/seyeon-structured-provider-observer-v1.js';
import type {
  ProductionSeyeonInternalDogfoodHarnessV1,
  RunSeyeonInternalDogfoodTurnResultV1,
} from '../apps/api/src/seyeon-internal-dogfood-harness-v1.js';
import type {
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';

const EXECUTED = {
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
        committedAt: '2026-10-04T06:00:00.000Z',
        postTurnOutboxEventId: 'post-turn-1',
        replayed: false,
      },
      runtimeResult: {
        envelope: {
          utterance: '첫 응답',
        },
      },
      relationshipResult: {},
      postTurnAnalysis: {
        status: 'deferred',
        outboxEventId: 'post-turn-1',
      },
    },
  },
  postTurn: {
    runtimeVersion: 'production-seyeon-post-turn-worker-runtime-v1',
    subjectId: 'subject-1',
    result: {
      decision: 'none',
    },
  },
  relationship: null,
  relationshipRevision: null,
} as unknown as RunSeyeonInternalDogfoodTurnResultV1;

const REPLAY = {
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
        committedAt: '2026-10-04T06:00:00.000Z',
        postTurnOutboxEventId: null,
        replayed: true,
      },
      assistantText: '첫 응답',
    },
  },
  postTurn: null,
  relationship: null,
  relationshipRevision: null,
} as unknown as RunSeyeonInternalDogfoodTurnResultV1;

describe('Se-yeon internal live dogfood V1', () => {
  it('parses one verified identity and keeps public authority out of CLI input', () => {
    expect(
      parseSeyeonInternalLiveDogfoodCommandV1([
        '--member-auth-user-id',
        'auth-user-1',
        '--thread',
        'thread-1',
        '--client-turn',
        'turn-1',
        '--text',
        '안녕하세요.',
        '--verify-replay',
      ]),
    ).toEqual({
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: 'auth-user-1',
      },
      threadId: 'thread-1',
      clientTurnId: 'turn-1',
      text: '안녕하세요.',
      verifyReplay: true,
    });

    expect(() =>
      parseSeyeonInternalLiveDogfoodCommandV1([
        '--member-auth-user-id',
        'auth-user-1',
        '--guest-token-hash',
        'guest-hash-1',
        '--thread',
        'thread-1',
        '--client-turn',
        'turn-1',
        '--text',
        '안녕하세요.',
      ]),
    ).toThrow(/Exactly one verified identity/i);

    expect(() =>
      parseSeyeonInternalLiveDogfoodCommandV1([
        '--member-auth-user-id',
        'auth-user-1',
        '--thread',
        'thread-1',
        '--client-turn',
        'turn-1',
        '--text',
        '안녕하세요.',
        '--relationship-stage',
        'S4_SPECIAL',
      ]),
    ).toThrow(/Unsupported/i);
  });

  it('reads provider credentials from environment without adding an origin override', () => {
    expect(
      parseSeyeonInternalLiveProviderConfigV1({
        OPENAI_API_KEY: 'sk-test-123456789012345678901234567890',
        MYEONGHA_SEYEON_OPENAI_MODEL: 'gpt-test-model',
        MYEONGHA_SEYEON_OPENAI_TIMEOUT_MS: '45000',
      }),
    ).toEqual({
      apiKey: 'sk-test-123456789012345678901234567890',
      model: 'gpt-test-model',
      timeoutMs: 45000,
    });
  });

  it('verifies committed replay adds zero provider calls', async () => {
    const delegate = {
      providerKey: 'test-provider',
      modelKey: 'test-model',
      async generate(request: SeyeonStructuredProviderRequestV2) {
        return { purpose: request.purpose };
      },
    };
    const observer = createObservedSeyeonStructuredProviderV1(delegate);
    let runCount = 0;

    const harness: ProductionSeyeonInternalDogfoodHarnessV1 = {
      async run() {
        runCount += 1;
        if (runCount === 1) {
          await observer.provider.generate({
            contractVersion: 'seyeon-structured-provider-v2',
            purpose: 'dialogue_render',
            instructions: 'test',
            input: {},
            responseSchema: {},
          });
          return EXECUTED;
        }
        return REPLAY;
      },
      async close() {},
    };

    const result = await runSeyeonInternalLiveDogfoodSessionV1({
      harness,
      observer,
      verifyReplay: true,
      turn: {
        verifiedEvidence: {
          kind: 'member',
          verifiedAuthUserId: 'auth-user-1',
        },
        threadId: 'thread-1',
        clientTurnId: 'turn-1',
        text: '안녕하세요.',
        postTurnLease: {
          lockOwner: 'post-turn',
          leaseExpiresAt: '2026-10-04T06:05:00.000Z',
        },
        relationshipLease: {
          lockOwner: 'relationship',
          leaseExpiresAt: '2026-10-04T06:05:00.000Z',
        },
      },
    });

    expect(result.first.assistantText).toBe('첫 응답');
    expect(result.replay?.disposition).toBe('committed_replay');
    expect(result.providerAfterFirst.total).toBe(1);
    expect(result.providerReplayDelta?.total).toBe(0);
  });

  it('fails if a replay path invokes the provider again', async () => {
    const delegate = {
      providerKey: 'test-provider',
      modelKey: 'test-model',
      async generate() {
        return {};
      },
    };
    const observer = createObservedSeyeonStructuredProviderV1(delegate);
    let runCount = 0;

    const harness: ProductionSeyeonInternalDogfoodHarnessV1 = {
      async run() {
        runCount += 1;
        await observer.provider.generate({
          contractVersion: 'seyeon-structured-provider-v2',
          purpose: 'semantic_review',
          instructions: 'test',
          input: {},
          responseSchema: {},
        });
        return runCount === 1 ? EXECUTED : REPLAY;
      },
      async close() {},
    };

    await expect(
      runSeyeonInternalLiveDogfoodSessionV1({
        harness,
        observer,
        verifyReplay: true,
        turn: {
          verifiedEvidence: {
            kind: 'member',
            verifiedAuthUserId: 'auth-user-1',
          },
          threadId: 'thread-1',
          clientTurnId: 'turn-1',
          text: '안녕하세요.',
          postTurnLease: {
            lockOwner: 'post-turn',
            leaseExpiresAt: '2026-10-04T06:05:00.000Z',
          },
          relationshipLease: {
            lockOwner: 'relationship',
            leaseExpiresAt: '2026-10-04T06:05:00.000Z',
          },
        },
      }),
    ).rejects.toThrow(/invoked the structured provider again/i);
  });
});
