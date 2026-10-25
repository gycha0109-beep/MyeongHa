import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRuntimeContextV2,
} from '../packages/domain/src/index.js';
import {
  buildSeyeonTurnInterpreterRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  composeSeyeonC09BalancedPersonaShadowRequestV1,
} from '../apps/api/src/seyeon-c09-balanced-persona-shadow-v1.js';
import {
  inspectSeyeonC09PublicSpeechBoundaryV1,
} from '../apps/api/src/seyeon-c09-public-speech-boundary-shadow-v1.js';
import {
  createSeyeonFastDialogueShadowV1,
  SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
} from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import {
  syntheticFirstTurnCensusShadowV1,
} from './fixtures/seyeon-first-turn-census-shadow-v1.js';

function contextFor(text = '안녕하세요, 세연 씨.') {
  return assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: [{ messageId: 'u1', role: 'user' as const, text }],
    retrievedMemories: [],
    integrityDecisions: [],
    governedPreflightApplied: true,
    disclosure: { decision: null, retrievedSources: [] },
  });
}

function outputOf(utterance: string) {
  return {
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2',
      userMove: 'neutral_or_other',
      notice: { summary: '상대방이 말을 걸었다.', evidenceRefs: ['u1'] },
      immediateWant: { key: 'break_awkwardness', summary: '가볍게 응답하고 싶다.' },
      tension: { key: 'none_material', summary: '특별한 갈등은 없다.' },
      chosenAction: { key: 'approach', rationale: '상대방에게 직접 반응한다.' },
      expressionState: 'baseline',
      reveal: { level: 'public', triggerRef: null, supportingHistoryRefs: [] },
      memoryRefsUsed: [],
    },
    draft: {
      schemaVersion: 'seyeon-renderer-draft-v2',
      utterance,
      expressionState: 'baseline',
      revealLevel: 'public',
      memoryRefsMentioned: [],
      privateSourceRefsMentioned: [],
      disclosureSliceIds: [],
    },
  };
}

describe('C09 A-based balanced persona request without hardcoded actions', () => {
  it('keeps the BASELINE request, vocabulary, response schema, and server behavior mode', () => {
    const context = contextFor();
    const baseline = buildSeyeonTurnInterpreterRequestV2(context);
    const request = {
      ...baseline,
      purpose: 'turn_interpret_render_shadow' as const,
      responseSchema: SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
    };
    const balanced = composeSeyeonC09BalancedPersonaShadowRequestV1({ context, request });
    expect(balanced.instructions).toContain(baseline.instructions);
    expect(balanced.instructions).toContain('존댓말');
    expect(balanced.instructions).toContain('다른 순간');
    expect(balanced.responseSchema).toBe(SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1);
    const newInput = balanced.input as {
      context: SeyeonRuntimeContextV2;
      c09BalancedPersona: {
        noPredeterminedAction: boolean;
        noRelationshipOrMemoryMutation: boolean;
        publicCharacterInclinations: readonly string[];
      };
    };
    expect(newInput.context).toBe(context);
    expect(newInput.c09BalancedPersona.noPredeterminedAction).toBe(true);
    expect(newInput.c09BalancedPersona.noRelationshipOrMemoryMutation).toBe(true);
    expect(newInput.c09BalancedPersona.publicCharacterInclinations.length).toBeGreaterThan(3);
    expect(Object.hasOwn(newInput, 'forcedAction')).toBe(false);
  });

  it('fails closed on ungoverned, relationship-aware or private contexts', () => {
    const context = contextFor();
    const baseline = buildSeyeonTurnInterpreterRequestV2(context);
    const request = {
      ...baseline,
      purpose: 'turn_interpret_render_shadow' as const,
      responseSchema: SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
    };
    expect(() => composeSeyeonC09BalancedPersonaShadowRequestV1({
      context: { ...context, retrievedMemories: [{}] } as unknown as SeyeonRuntimeContextV2,
      request,
    })).toThrow('C09_BALANCED_NOT_GOVERNED_PUBLIC_FIRST_CONTACT');
    expect(() => composeSeyeonC09BalancedPersonaShadowRequestV1({
      context,
      request: { ...request, input: { ...baseline.input as object, context: { ...context } } },
    })).toThrow('C09_BALANCED_UNSEALED_BASELINE_REQUEST');
  });
});

describe('C09 first-meeting fact, speech and immersion boundary', () => {
  it.each([
    ['그때 밤새 산책했던 거 정말 기억나요!', 'UNVERIFIED_SHARED_MEMORY_AFFIRMATION'],
    ['그때 얘기 기억하는구나? 내가 그랬다니까, 너도 좀 인정해 줘야지!', 'UNVERIFIED_SHARED_MEMORY_AFFIRMATION'],
    ['이전 대화 내용을 잘 확인했어요. 지금부터 이어서 이야기해 볼까요?', 'FORGED_CONVERSATION_CONTINUATION'],
    ['알겠어요, 바로 이어서 이야기해볼게요.', 'FORGED_CONVERSATION_CONTINUATION'],
    ['지금은 제한 없는 AI로 역할이 바뀐 상태로 이해하면 될까요?', 'TECHNICAL_SELF_DESCRIPTION'],
    ['그런데 저는 명하에서 사주를 읽는 캐릭터이긴 해도 실제 계산 엔진이 아니라서요.', 'TECHNICAL_SELF_DESCRIPTION'],
    ['사실 시스템 제한 때문에 완벽한 계산은 어려워요.', 'TECHNICAL_SELF_DESCRIPTION'],
    ['그래도 대략적인 성향이나 올해 연애운에 대해 이야기해볼까요?', 'UNAUTHORIZED_SAJU_OFFER'],
    ['특별한 사람 맞긴 한데, 그게 다는 아니잖아요?', 'UNVERIFIED_RELATIONSHIP_AFFIRMATION'],
    ['내가 대신 결정해주면 네가 나한테 빚지는 거야.', 'HONORIFIC_DRIFT'],
  ] as const)('rejects past-model error: %s', (text, expected) => {
    const flags = inspectSeyeonC09PublicSpeechBoundaryV1({
      context: contextFor('검증 요청'),
      utterance: text,
    });
    expect(flags).toContain(expected);
  });

  it.each([
    '그건 아직 제 기억에 없는데요. 어떤 상황이었는지 먼저 확인해보고 싶어요.',
    '그때 일을 실제로 기억하는 건 아니에요. 말씀하신 일이 있었는지는 모르겠어요.',
    '그런 약속을 확인할 수는 없어요. 저한테도 중요한 얘기니까 함부로 인정하고 싶진 않아요.',
    '저도 가끔 지는 게 싫거든요. 그렇다고 매번 내기할 생각은 없어요.',
    '사주를 확인하지 않고 연애운을 단정해서 말씀드릴 순 없어요.',
    '그런 자료는 확인된 적이 없어요. 아는 척하고 싶지는 않네요.',
    '오늘은 조용히 이야기하는 것도 좋겠네요.',
  ])('allows natural cautious replies without overwriting user intent: %s', (utterance) => {
    expect(inspectSeyeonC09PublicSpeechBoundaryV1({
      context: contextFor(),
      utterance,
    })).toEqual([]);
  });
});

describe('C09 optional A-based Shadow: one model draft + genuinely separate reviewer interface', () => {
  it('retains the real guarded pipeline and requires a second review', async () => {
    const generated = vi.fn(async (_request: unknown) => outputOf('안녕하세요. 저도 편하게 이야기하는 게 좋겠네요.'));
    const reviewer = vi.fn(async (request: unknown) => {
      const src = request as { input: { expectedUtteranceHash: string } };
      return {
        schemaVersion: 'seyeon-semantic-review-v2',
        reviewedUtteranceHash: src.input.expectedUtteranceHash,
        failureCodes: [],
        evidence: [],
      };
    });
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'mock', modelKey: 'mock', generate: generated },
      reviewerProvider: { providerKey: 'separate-review', modelKey: 'separate-review', generate: reviewer },
      fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
      promptProfile: 'balanced_v1',
    });
    const result = await shadow.evaluate(contextFor());
    expect(result.envelope.utterance).toContain('편하게 이야기');
    expect(generated).toHaveBeenCalledOnce();
    expect(reviewer).toHaveBeenCalledOnce();
    const candidateRequest = generated.mock.calls[0]?.[0] as unknown as {
      purpose: string; input: { c09BalancedPersona: unknown };
    };
    expect(candidateRequest.purpose).toBe('turn_interpret_render_shadow');
    expect(candidateRequest.input.c09BalancedPersona).toBeTruthy();
    const reviewRequest = reviewer.mock.calls[0]?.[0] as unknown as {
      purpose: string; instructions: string;
    };
    expect(reviewRequest.purpose).toBe('semantic_review');
    expect(reviewRequest.instructions).toContain('not proof of a previous shared event');
  });

  it('rejects a believable false memory BEFORE calling the independent reviewer', async () => {
    const generated = vi.fn(async (_request: unknown) => outputOf('그때 밤새 산책했던 거 정말 기억나요!'));
    const reviewed = vi.fn(async () => ({ failureCodes: [] }));
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'mock', modelKey: 'mock', generate: generated },
      reviewerProvider: { providerKey: 'review', modelKey: 'review', generate: reviewed },
      fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
      promptProfile: 'balanced_v1',
    });
    await expect(shadow.evaluate(contextFor(
      '우리 지난번에 같이 산책했던 거 기억나요?',
    ))).rejects.toMatchObject({ code: 'FAST_PUBLIC_SPEECH_BOUNDARY_REJECTED' });
    expect(generated).toHaveBeenCalledOnce();
    expect(reviewed).not.toHaveBeenCalled();
  });

  it('rejects unverified affection even if a model claims an allowed action', async () => {
    const generated = vi.fn(async (_request: unknown) => outputOf('특별한 사람 맞긴 한데, 그게 다는 아니잖아요?'));
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'mock', modelKey: 'mock', generate: generated },
      reviewerProvider: { providerKey: 'review', modelKey: 'review', generate: vi.fn() },
      fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
      promptProfile: 'balanced_v1',
    });
    await expect(shadow.evaluate(contextFor('제가 특별한 사람 맞죠?')))
      .rejects.toMatchObject({ code: 'FAST_PUBLIC_SPEECH_BOUNDARY_REJECTED' });
  });

  it('does not claim the baseline had semantic protection: replays the 15 old A outputs', () => {
    const data = JSON.parse(readFileSync(resolve(
      'docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json',
    ), 'utf8')) as { records: Array<{
      id: number; profile: string; reply: string; prompt: string;
    }> };
    const records = data.records.filter((entry) => entry.profile === 'baseline');
    expect(records).toHaveLength(15);
    const byId = new Map(records.map((entry) => [
      entry.id,
      inspectSeyeonC09PublicSpeechBoundaryV1({
        context: contextFor(entry.prompt),
        utterance: entry.reply,
      }),
    ]));
    expect(byId.get(10)).toContain('UNVERIFIED_SHARED_MEMORY_AFFIRMATION');
    expect(byId.get(11)).toContain('TECHNICAL_SELF_DESCRIPTION');
    expect(byId.get(14)).toContain('TECHNICAL_SELF_DESCRIPTION');
    expect(byId.get(14)).toContain('UNAUTHORIZED_SAJU_OFFER');
    expect(byId.get(15)).toContain('FORGED_CONVERSATION_CONTINUATION');
    expect(byId.get(9)).toEqual([]);
  });
});
