import { describe, expect, it, vi } from 'vitest';
import { runCharacterGovernedPreflightV1 } from '../apps/api/src/character-governed-preflight-v1.js';
import { createOpenAiSeyeonStructuredProviderV1 } from '../apps/api/src/openai-seyeon-structured-provider-v1.js';

function governedPorts(
  classifyIntegrity: () => Promise<{ claims: [] }>,
  classifyDisclosure: () => Promise<{ topicKey: null; questionContext: 'casual_curiosity' }>,
) {
  return {
    characterId: 'seyeon' as const,
    userMessageRef: 'msg-001',
    userText: '안녕',
    relationship: {
      gate: 'PUBLIC' as const,
      trustBand: 'low' as const,
      relevantSharedHistoryRefs: [] as string[],
    },
    integrity: {
      classifier: { classify: classifyIntegrity },
      authorityResolver: { resolve() { throw new Error('no claim may be promoted'); } },
    },
    disclosure: {
      classifier: { classify: classifyDisclosure },
      sourceDescriptor: { readDescriptor() { throw new Error('no private source should be requested'); } },
      factAuthorityResolver: { resolve() { throw new Error('no private authority should be requested'); } },
      retriever: { retrieve() { throw new Error('no private source should be retrieved'); } },
    },
  };
}

describe('Seyeon inference efficiency phase 1', () => {
  it('starts independent integrity and disclosure classification concurrently', async () => {
    const entered: string[] = [];
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const pending = runCharacterGovernedPreflightV1(governedPorts(
      async () => {
        entered.push('integrity');
        await barrier;
        return { claims: [] };
      },
      async () => {
        entered.push('disclosure');
        await barrier;
        return { topicKey: null, questionContext: 'casual_curiosity' };
      },
    ));
    await Promise.resolve();
    expect(entered).toEqual(['integrity', 'disclosure']);
    release();
    const result = await pending;
    expect(result.integrity.decisions).toEqual([]);
    expect(result.disclosure.status).toBe('not_sensitive');
    expect(result.retrievedPrivateSources).toEqual([]);
  });

  it('fails closed if either classifier fails, without retrieving private sources', async () => {
    const disclosureClassifier = vi.fn(async () => ({
      topicKey: null,
      questionContext: 'casual_curiosity' as const,
    }));
    await expect(runCharacterGovernedPreflightV1(governedPorts(
      async () => { throw new Error('integrity classifier offline'); },
      disclosureClassifier,
    ))).rejects.toThrow('integrity classifier offline');
    expect(disclosureClassifier).toHaveBeenCalledOnce();
  });

  it('reports only bounded timing and token counters for a structured provider response', async () => {
    const logs = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const provider = createOpenAiSeyeonStructuredProviderV1({
        apiKey: 'sk-test-secret-long-enough-1234567890',
        model: 'gpt-5.6-terra',
        fetchImpl: async () => Response.json({
          status: 'completed',
          output: [{
            type: 'message',
            content: [{ type: 'output_text', text: '{"accepted":true}' }],
          }],
          usage: {
            input_tokens: 110,
            output_tokens: 21,
            input_tokens_details: { cached_tokens: 9 },
            output_tokens_details: { reasoning_tokens: 5 },
          },
        }),
      });
      const actual = await provider.generate({
        contractVersion: 'seyeon-structured-provider-v2',
        purpose: 'turn_interpretation',
        instructions: 'Secret prompt text must never be logged',
        input: { secret: 'private-user-input-must-never-be-logged' },
        responseSchema: {
          type: 'object', additionalProperties: false,
          properties: { accepted: { type: 'boolean' } },
          required: ['accepted'],
        },
      });
      expect(actual).toEqual({ accepted: true });
      const entry = String(logs.mock.calls.find((call) =>
        String(call[0]).startsWith('MYEONGHA_SEYEON_PROVIDER_METRIC '))?.[0] ?? '');
      expect(entry).toContain('"inputTokens":110');
      expect(entry).toContain('"outputTokens":21');
      expect(entry).toContain('"cachedInputTokens":9');
      expect(entry).toContain('"reasoningTokens":5');
      expect(entry).toContain('"purpose":"turn_interpretation"');
      expect(entry).not.toContain('Secret prompt');
      expect(entry).not.toContain('private-user-input');
      expect(entry).not.toContain('sk-test-secret');
    } finally {
      logs.mockRestore();
    }
  });
});
