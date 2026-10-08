import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonFastDialogueShadowV1,
  SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
} from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import { assembleSeyeonRuntimeContextV2, type SeyeonRuntimeContextV2 } from '../packages/domain/src/index.js';

function publicContext(): SeyeonRuntimeContextV2 {
  return {
    character: { characterId: 'seyeon' },
    integrity: { governedPreflightApplied: true, decisions: [] },
    disclosure: { decision: null, retrievedSources: [] },
    retrievedMemories: [],
    relationship: null, relationshipSemantics: null,
    recentConversation: [], actionPolicy: {
      allowedActionKeys: ['approach'], allowedExpressionStates: ['baseline'],
    },
  } as unknown as SeyeonRuntimeContextV2;
}

describe('Seyeon low-risk combined dialogue Shadow', () => {
  it('accepts a governed public greeting only after the separate semantic reviewer passes', async () => {
    const context = assembleSeyeonRuntimeContextV2({
      relationship: null,
      recentMessages: [{ messageId: 'u1', role: 'user', text: '안녕, 세연아.' }],
      retrievedMemories: [],
      integrityDecisions: [],
      governedPreflightApplied: true,
      disclosure: { decision: null, retrievedSources: [] },
    });
    const generate = vi.fn(async (_request: unknown) => ({
      interpretation: {
        schemaVersion: 'seyeon-turn-interpretation-v2',
        userMove: 'neutral_or_other',
        notice: { summary: '상대가 가볍게 인사했다.', evidenceRefs: ['u1'] },
        immediateWant: { key: 'break_awkwardness', summary: '세연 쪽에서 인사를 건넨다.' },
        tension: { key: 'none_material', summary: '없음.' },
        chosenAction: { key: 'approach', rationale: '첫 인사에 직접 반응한다.' },
        expressionState: 'baseline',
        reveal: { level: 'public', triggerRef: null, supportingHistoryRefs: [] },
        memoryRefsUsed: [],
      },
      draft: {
        schemaVersion: 'seyeon-renderer-draft-v2',
        utterance: '안녕하세요. 이렇게 인사부터 건네주시니까 기분이 조금 좋네요.',
        expressionState: 'baseline',
        revealLevel: 'public',
        memoryRefsMentioned: [],
        privateSourceRefsMentioned: [],
        disclosureSliceIds: [],
      },
    }));
    const reviewer = vi.fn(async (request: unknown) => {
      const payload = request as { input: { expectedUtteranceHash: string } };
      return {
        schemaVersion: 'seyeon-semantic-review-v2',
        reviewedUtteranceHash: payload.input.expectedUtteranceHash,
        failureCodes: [], evidence: [],
      };
    });
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'test', modelKey: 'test', generate },
      reviewerProvider: { providerKey: 'test', modelKey: 'test', generate: reviewer },
    });
    const result = await shadow.evaluate(context);
    expect(result.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(result.envelope.utterance).toContain('안녕하세요.');
    expect(result.interpretation.chosenAction.key).toBe('approach');
    expect(generate).toHaveBeenCalledOnce();
    expect(reviewer).toHaveBeenCalledOnce();
    expect(reviewer.mock.calls[0]?.[0]).toMatchObject({ purpose: 'semantic_review' });
  });

  it('builds one combined structured candidate and never allows unreviewed output', async () => {
    const generate = vi.fn(async (_request: unknown) => ({ interpretation: {}, draft: {} }));
    const review = vi.fn(async () => ({ failureCodes: [] }));
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'test', modelKey: 'test', generate },
      reviewerProvider: { providerKey: 'test', modelKey: 'test', generate: review },
    });
    await expect(shadow.evaluate(publicContext())).rejects.toThrow();
    expect(generate).toHaveBeenCalledOnce();
    const request = generate.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(request).toMatchObject({
      purpose: 'turn_interpret_render_shadow',
      responseSchema: SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
    });
    expect(review).not.toHaveBeenCalled();
  });

  it('rejects sensitive, unverifiable, and non-first-contact cases before any AI call', async () => {
    const generate = vi.fn(async () => ({}));
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'test', modelKey: 'test', generate },
      reviewerProvider: { providerKey: 'test', modelKey: 'test', generate },
    });
    const base = publicContext();
    const inputs = [
      { ...base, integrity: { ...base.integrity, governedPreflightApplied: false } },
      { ...base, integrity: { ...base.integrity, decisions: [{}] } },
      { ...base, disclosure: { ...base.disclosure, decision: {} } },
      { ...base, retrievedMemories: [{}] },
      { ...base, relationship: {} },
    ];
    for (const input of inputs) {
      await expect(shadow.evaluate(input as SeyeonRuntimeContextV2)).rejects.toThrow();
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects forged authority or unknown response fields before semantic review', async () => {
    const generate = vi.fn(async () => ({
      interpretation: {}, draft: {}, mayMutateRelationship: true,
    }));
    const reviewer = vi.fn(async () => ({}));
    const shadow = createSeyeonFastDialogueShadowV1({
      candidateProvider: { providerKey: 'test', modelKey: 'test', generate },
      reviewerProvider: { providerKey: 'test', modelKey: 'test', generate: reviewer },
    });
    await expect(shadow.evaluate(publicContext())).rejects.toThrow('invalid outer response');
    expect(reviewer).not.toHaveBeenCalled();
  });
});
