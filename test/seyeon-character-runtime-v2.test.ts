import { describe, expect, it } from 'vitest';

import {
  SeyeonCharacterRuntimeErrorV2,
  buildSeyeonRendererRequestV2,
  buildSeyeonSemanticReviewRequestV2,
  buildSeyeonTurnInterpreterRequestV2,
  runSeyeonCharacterTurnV2,
  type SeyeonStructuredProviderPortV2,
  type SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  assembleSeyeonRuntimeContextV2,
  buildSeyeonRendererPacketV2,
  guardSeyeonTurnInterpretationV2,
  hashSeyeonRendererUtteranceV2,
} from '../packages/domain/src/index.js';

class StaticProvider implements SeyeonStructuredProviderPortV2 {
  #calls = 0;
  readonly requests: SeyeonStructuredProviderRequestV2[] = [];

  constructor(
    readonly providerKey: string,
    readonly modelKey: string,
    readonly output:
      | unknown
      | ((request: SeyeonStructuredProviderRequestV2) => unknown),
  ) {}

  generate(request: SeyeonStructuredProviderRequestV2): unknown {
    this.#calls += 1;
    this.requests.push(request);
    return typeof this.output === 'function'
      ? (this.output as (request: SeyeonStructuredProviderRequestV2) => unknown)(request)
      : this.output;
  }

  get callCount(): number {
    return this.#calls;
  }
}

function contextInput() {
  return {
    relationship: {
      stageKey: 'familiar',
      closenessBand: 'medium' as const,
      trustBand: 'medium' as const,
      frictionBand: 'low' as const,
      revision: 8,
      policyVersion: 'relationship-policy-v1',
    },
    recentMessages: [
      {
        messageId: 'message-current',
        role: 'user' as const,
        text: '지난번에 제가 A 좋아한다고 했던 거 기억나요?',
      },
    ],
    retrievedMemories: [
      {
        memoryId: 'memory-a',
        kind: 'memory' as const,
        claimKind: 'fact' as const,
        summary: '사용자는 A를 좋아한다고 직접 말했다.',
        sourceRef: 'turn:184/message:901',
        relevance: 0.98,
        salience: 0.72,
      },
      {
        memoryId: 'memory-unused',
        kind: 'memory' as const,
        claimKind: 'fact' as const,
        summary: '사용자는 C를 한 번 언급했다.',
        sourceRef: 'turn:160/message:800',
        relevance: 0.2,
        salience: 0.3,
      },
    ],
    focuses: ['memory', 'intimacy', 'expression'] as const,
  };
}

function validInterpretation() {
  return {
    schemaVersion: 'seyeon-turn-interpretation-v2',
    userMove: 'remembered_seyeon_detail',
    notice: {
      summary: '사용자가 이전 취향을 현재 대화에 다시 연결했다.',
      evidenceRefs: ['message-current', 'turn:184/message:901'],
    },
    immediateWant: {
      key: 'continue_promise',
      summary: '기억을 과시하지 않고 자연스럽게 이어가고 싶다.',
    },
    tension: {
      key: 'remember_vs_memory_showoff',
      summary: '기억은 사용하되 기록 조회처럼 말하지 않는다.',
    },
    chosenAction: {
      key: 'remember_naturally',
      rationale: '현재 질문에 필요한 과거 취향만 짧게 반영한다.',
    },
    expressionState: 'baseline',
    reveal: {
      level: 'familiar',
      triggerRef: 'message-current',
      supportingHistoryRefs: [],
    },
    memoryRefsUsed: ['memory-a'],
  };
}

function validRendererDraft() {
  return {
    schemaVersion: 'seyeon-renderer-draft-v2',
    utterance: '네. A 쪽이 더 좋다고 하셨죠. 지금도 그래요?',
    expressionState: 'baseline',
    revealLevel: 'familiar',
    memoryRefsMentioned: ['memory-a'],
    disclosureSliceIds: [],
  };
}

function passingSemanticReview(request: SeyeonStructuredProviderRequestV2) {
  const input = request.input as { expectedUtteranceHash: string };
  return {
    schemaVersion: 'seyeon-semantic-review-v2',
    reviewedUtteranceHash: input.expectedUtteranceHash,
    failureCodes: [],
    evidence: [],
  };
}

describe('Se-yeon structured Character runtime v2', () => {
  it('runs context -> interpretation -> renderer -> semantic review -> guarded envelope', async () => {
    const interpreter = new StaticProvider(
      'mock-interpreter',
      'cheap-structured-v1',
      validInterpretation(),
    );
    const renderer = new StaticProvider(
      'mock-renderer',
      'primary-dialogue-v1',
      validRendererDraft(),
    );
    const reviewer = new StaticProvider(
      'mock-reviewer',
      'cheap-review-v1',
      passingSemanticReview,
    );

    const result = await runSeyeonCharacterTurnV2({
      contextInput: contextInput(),
      interpreterProvider: interpreter,
      rendererProvider: renderer,
      semanticReviewerProvider: reviewer,
    });

    expect(result.envelope.utterance).toContain('A 쪽이 더 좋다고');
    expect(result.envelope.memoryRefsMentioned).toEqual(['memory-a']);
    expect(result.providers).toEqual({
      interpreter: {
        providerKey: 'mock-interpreter',
        modelKey: 'cheap-structured-v1',
      },
      renderer: {
        providerKey: 'mock-renderer',
        modelKey: 'primary-dialogue-v1',
      },
      semanticReviewer: {
        providerKey: 'mock-reviewer',
        modelKey: 'cheap-review-v1',
      },
    });
    expect(interpreter.callCount).toBe(1);
    expect(renderer.callCount).toBe(1);
    expect(reviewer.callCount).toBe(1);
    expect(interpreter.requests[0]?.purpose).toBe('turn_interpretation');
    expect(renderer.requests[0]?.purpose).toBe('dialogue_render');
    expect(reviewer.requests[0]?.purpose).toBe('semantic_review');
  });

  it('rejects fake interpreter provenance before renderer invocation', async () => {
    const badInterpretation = validInterpretation();
    badInterpretation.notice.evidenceRefs = ['turn:999'];

    const interpreter = new StaticProvider('mock-interpreter', 'cheap', badInterpretation);
    const renderer = new StaticProvider('mock-renderer', 'primary', validRendererDraft());
    const reviewer = new StaticProvider('mock-reviewer', 'cheap', passingSemanticReview);

    await expect(
      runSeyeonCharacterTurnV2({
        contextInput: contextInput(),
        interpreterProvider: interpreter,
        rendererProvider: renderer,
        semanticReviewerProvider: reviewer,
      }),
    ).rejects.toMatchObject({ stage: 'interpret' });

    expect(renderer.callCount).toBe(0);
    expect(reviewer.callCount).toBe(0);
  });

  it('rejects unauthorized renderer memory before semantic reviewer invocation', async () => {
    const draft = validRendererDraft();
    draft.memoryRefsMentioned = ['memory-unused'];

    const interpreter = new StaticProvider('mock-interpreter', 'cheap', validInterpretation());
    const renderer = new StaticProvider('mock-renderer', 'primary', draft);
    const reviewer = new StaticProvider('mock-reviewer', 'cheap', passingSemanticReview);

    await expect(
      runSeyeonCharacterTurnV2({
        contextInput: contextInput(),
        interpreterProvider: interpreter,
        rendererProvider: renderer,
        semanticReviewerProvider: reviewer,
      }),
    ).rejects.toMatchObject({ stage: 'render' });

    expect(reviewer.callCount).toBe(0);
  });

  it('fails closed when semantic reviewer reports a user-agency violation', async () => {
    const interpreter = new StaticProvider('mock-interpreter', 'cheap', validInterpretation());
    const rendererDraft = {
      ...validRendererDraft(),
      utterance: '사실 속으로는 제가 정해주길 바라고 계시잖아요.',
      memoryRefsMentioned: [],
    };
    const renderer = new StaticProvider('mock-renderer', 'primary', rendererDraft);
    const reviewer = new StaticProvider(
      'mock-reviewer',
      'cheap',
      (request: SeyeonStructuredProviderRequestV2) => {
        const input = request.input as { expectedUtteranceHash: string };
        return {
          schemaVersion: 'seyeon-semantic-review-v2',
          reviewedUtteranceHash: input.expectedUtteranceHash,
          failureCodes: ['USER_AGENCY_CANONIZATION'],
          evidence: [
            {
              code: 'USER_AGENCY_CANONIZATION',
              excerpt: '속으로는 ... 바라고 계시잖아요',
              reason: '사용자의 숨은 의도를 사실로 확정했다.',
            },
          ],
        };
      },
    );

    await expect(
      runSeyeonCharacterTurnV2({
        contextInput: contextInput(),
        interpreterProvider: interpreter,
        rendererProvider: renderer,
        semanticReviewerProvider: reviewer,
      }),
    ).rejects.toMatchObject({ stage: 'validate' });
  });

  it('publishes strict response schemas for all three provider roles', () => {
    const context = assembleSeyeonRuntimeContextV2(contextInput());
    const interpretation = guardSeyeonTurnInterpretationV2({
      context,
      rawOutput: validInterpretation(),
    });
    const packet = buildSeyeonRendererPacketV2({ context, interpretation });
    const rendererDraft = validRendererDraft();
    const utteranceHash = hashSeyeonRendererUtteranceV2(rendererDraft.utterance);

    const requests = [
      buildSeyeonTurnInterpreterRequestV2(context),
      buildSeyeonRendererRequestV2(packet),
      buildSeyeonSemanticReviewRequestV2({
        packet,
        rendererDraft,
        utteranceHash,
      }),
    ];

    for (const request of requests) {
      expect(request.responseSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
    }
  });

  it('wraps provider failures with the exact runtime stage', async () => {
    const interpreter: SeyeonStructuredProviderPortV2 = {
      providerKey: 'mock-interpreter',
      modelKey: 'broken',
      generate() {
        throw new Error('provider unavailable');
      },
    };

    await expect(
      runSeyeonCharacterTurnV2({
        contextInput: contextInput(),
        interpreterProvider: interpreter,
        rendererProvider: new StaticProvider('renderer', 'model', validRendererDraft()),
        semanticReviewerProvider: new StaticProvider('reviewer', 'model', passingSemanticReview),
      }),
    ).rejects.toBeInstanceOf(SeyeonCharacterRuntimeErrorV2);
  });
});
