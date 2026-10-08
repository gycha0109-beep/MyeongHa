import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonFastDialogueShadowV1,
  SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
} from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import type { SeyeonRuntimeContextV2 } from '../packages/domain/src/index.js';

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
