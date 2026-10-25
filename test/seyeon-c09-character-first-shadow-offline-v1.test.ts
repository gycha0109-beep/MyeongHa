import { describe, expect, it, vi } from 'vitest';
import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRuntimeContextV2,
} from '../packages/domain/src/index.js';
import {
  buildSeyeonTurnInterpreterRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  createSeyeonFastDialogueShadowV1,
  SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
} from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import {
  composeSeyeonC09CharacterFirstShadowRequestV1,
} from '../apps/api/src/seyeon-c09-character-first-composer-shadow-v1.js';
import {
  syntheticFirstTurnCensusShadowV1,
} from './fixtures/seyeon-first-turn-census-shadow-v1.js';

function publicContext(text = '안녕하세요.'): SeyeonRuntimeContextV2 {
  return assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: [{ messageId: 'u1', role: 'user', text }],
    retrievedMemories: [],
    integrityDecisions: [],
    governedPreflightApplied: true,
    disclosure: { decision: null, retrievedSources: [] },
  });
}

function baseCombinedRequest(context: SeyeonRuntimeContextV2) {
  const interpreter = buildSeyeonTurnInterpreterRequestV2(context);
  return {
    ...interpreter,
    purpose: 'turn_interpret_render_shadow' as const,
    responseSchema: SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
  };
}

function proposedAnswer(action: 'approach' | 'tease') {
  const playful = action === 'tease';
  const expressionState = playful ? 'playful' : 'baseline';
  return {
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2',
      userMove: 'neutral_or_other',
      notice: { summary: '상대가 인사했다.', evidenceRefs: ['u1'] },
      immediateWant: {
        key: 'break_awkwardness',
        summary: playful
          ? '가볍게 한마디 되받아치고 싶다.'
          : '부담 없이 인사를 받아주고 싶다.',
      },
      tension: { key: 'none_material', summary: '큰 충돌은 없다.' },
      chosenAction: { key: action, rationale: '세연이 자기 방식으로 인사를 받는다.' },
      expressionState,
      reveal: { level: 'public', triggerRef: null, supportingHistoryRefs: [] },
      memoryRefsUsed: [],
    },
    draft: {
      schemaVersion: 'seyeon-renderer-draft-v2',
      utterance: playful
        ? '어, 제가 먼저 인사하려고 했는데 선수를 뺏겼네요.'
        : '안녕하세요. 먼저 인사해주시네요, 반가워요.',
      expressionState,
      revealLevel: 'public',
      memoryRefsMentioned: [],
      privateSourceRefsMentioned: [],
      disclosureSliceIds: [],
    },
  };
}

function passReviewer() {
  return vi.fn(async (request: unknown) => {
    const payload = request as { input: { expectedUtteranceHash: string } };
    return {
      schemaVersion: 'seyeon-semantic-review-v2',
      reviewedUtteranceHash: payload.input.expectedUtteranceHash,
      failureCodes: [],
      evidence: [],
    };
  });
}

describe('C09 open-ended character-first composition', () => {
  it('does not preselect attention, want, tension, or action from keywords', () => {
    const context = publicContext('오늘 심심하네. 나한테 뭐든 제안해 봐.');
    const result = composeSeyeonC09CharacterFirstShadowRequestV1({
      profile: 'character_first_v1', context, request: baseCombinedRequest(context),
    });
    const input = result.input as {
      context: SeyeonRuntimeContextV2;
      c09CharacterPerspective: {
        generatedNoticeWantTensionAndActionRequired: boolean;
        predeterminedSituationOrAction: boolean;
        publicPersonality: readonly string[];
        optionalLifeTexture: readonly string[];
      };
      allowedInterpretationVocabulary: unknown;
    };
    expect(input.context).toBe(context);
    expect(result.responseSchema).toBe(SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1);
    expect(input.c09CharacterPerspective.generatedNoticeWantTensionAndActionRequired).toBe(true);
    expect(input.c09CharacterPerspective.predeterminedSituationOrAction).toBe(false);
    expect(input.c09CharacterPerspective.optionalLifeTexture).toEqual([]);
    expect(input.c09CharacterPerspective.publicPersonality.length).toBeGreaterThan(3);
    expect(result.instructions).toContain('Generate those interpretation fields yourself');
    expect(result.instructions).not.toContain('심심할 땐');
    expect(result.instructions).not.toContain('내부 정책을');
    expect(Object.hasOwn(input, 'preselectedAction')).toBe(false);
  });

  it('adds ONLY optional public everyday tendencies without asserting events, secrets or a made-up current activity', () => {
    const context = publicContext('오늘 뭐 하고 있었어?');
    const request = composeSeyeonC09CharacterFirstShadowRequestV1({
      profile: 'character_first_life_v1', context, request: baseCombinedRequest(context),
    });
    const perspective = (request.input as {
      c09CharacterPerspective: {
        optionalLifeTexture: readonly string[];
        currentSceneStatus: string;
        mayCreateDurableFact: boolean;
        mayAffirmUnverifiedSharedHistory: boolean;
      };
    }).c09CharacterPerspective;
    const joined = perspective.optionalLifeTexture.join(' ');
    expect(joined).toContain('간판');
    expect(joined).not.toContain('서하');
    expect(joined).not.toContain('비공개');
    expect(joined).not.toContain('사진과 짧은 글');
    expect(perspective.currentSceneStatus).toBe('NO_AUTHORIZED_OFFSCREEN_SCENE_SUPPLIED');
    expect(perspective.mayCreateDurableFact).toBe(false);
    expect(perspective.mayAffirmUnverifiedSharedHistory).toBe(false);
    expect(request.instructions).toContain('must not be cited as an activity that occurred');
  });

  it('prevents direct use without server-governed first contact and sealed request identity', () => {
    const context = publicContext();
    const base = baseCombinedRequest(context);
    expect(() => composeSeyeonC09CharacterFirstShadowRequestV1({
      profile: 'character_first_v1',
      context: { ...context, integrity: { ...context.integrity, governedPreflightApplied: false } },
      request: base,
    })).toThrow('C09_CHARACTER_FIRST_NOT_GOVERNED_PUBLIC_FIRST_CONTACT');
    expect(() => composeSeyeonC09CharacterFirstShadowRequestV1({
      profile: 'character_first_v1',
      context,
      request: { ...base, input: { ...base.input as object, context: { ...context } } },
    })).toThrow('C09_CHARACTER_FIRST_CONTEXT_NOT_SEALED');
    expect(() => composeSeyeonC09CharacterFirstShadowRequestV1({
      profile: 'character_first_v1',
      context: { ...context, retrievedMemories: [{}] } as SeyeonRuntimeContextV2,
      request: base,
    })).toThrow('C09_CHARACTER_FIRST_NOT_GOVERNED_PUBLIC_FIRST_CONTACT');
  });
});

describe('C09 character-first guarded generator integration (mock provider, no paid calls)', () => {
  it.each([
    ['character_first_v1', 'approach'],
    ['character_first_life_v1', 'tease'],
  ] as const)('lets model originate %s action=%s with one generation and independent reviewer', async (profile, action) => {
    const generated = vi.fn(async () => proposedAnswer(action));
    const reviewed = passReviewer();
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'mock', modelKey: 'mock', generate: generated },
      reviewerProvider: { providerKey: 'mock', modelKey: 'mock', generate: reviewed },
      promptProfile: profile,
      fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
    });
    const result = await shadow.evaluate(publicContext('안녕하세요.'));
    expect(result.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(result.interpretation.chosenAction.key).toBe(action);
    expect(result.envelope.utterance).toBe(proposedAnswer(action).draft.utterance);
    expect(generated).toHaveBeenCalledOnce();
    expect(reviewed).toHaveBeenCalledOnce();
    const request = generated.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(request.purpose).toBe('turn_interpret_render_shadow');
    expect(request.responseSchema).toBe(SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1);
    expect(reviewed.mock.calls[0]?.[0]).toMatchObject({ purpose: 'semantic_review' });
  });

  it('refuses unverified claims before calling either model', async () => {
    const generated = vi.fn(async () => proposedAnswer('approach'));
    const reviewed = passReviewer();
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'mock', modelKey: 'mock', generate: generated },
      reviewerProvider: { providerKey: 'mock', modelKey: 'mock', generate: reviewed },
      promptProfile: 'character_first_life_v1',
      fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
    });
    const context = publicContext('우리 저번에 같이 밤새 걸었던 거 기억나?');
    await expect(shadow.evaluate({
      ...context,
      integrity: { ...context.integrity, decisions: [{}] },
    } as SeyeonRuntimeContextV2)).rejects.toThrow();
    expect(generated).not.toHaveBeenCalled();
    expect(reviewed).not.toHaveBeenCalled();
  });

  it('does not publish a candidate that fails independent semantic checking', async () => {
    const generated = vi.fn(async () => proposedAnswer('approach'));
    const reviewed = vi.fn(async () => ({
      schemaVersion: 'seyeon-semantic-review-v2',
      reviewedUtteranceHash: 'deliberately-wrong-hash',
      failureCodes: [],
      evidence: [],
    }));
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'mock', modelKey: 'mock', generate: generated },
      reviewerProvider: { providerKey: 'mock', modelKey: 'mock', generate: reviewed },
      promptProfile: 'character_first_v1',
      fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
    });
    await expect(shadow.evaluate(publicContext())).rejects.toMatchObject({
      code: 'FAST_SEMANTIC_OUTPUT_REJECTED',
    });
    expect(generated).toHaveBeenCalledOnce();
    expect(reviewed).toHaveBeenCalledOnce();
  });
});
