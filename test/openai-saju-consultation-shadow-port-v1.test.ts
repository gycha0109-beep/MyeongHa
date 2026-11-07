import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiSajuConsultationShadowPortV1,
  OPENAI_SAJU_CONSULTATION_SHADOW_EVALUATOR_VERSION_V1,
  type OpenAiSajuConsultationShadowFetchV1,
  type OpenAiSajuConsultationShadowOutcomeV1,
} from '../apps/api/src/openai-saju-consultation-shadow-port-v1.js';
import {
  CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1,
  hashCharacterSajuSp2CandidateV1,
} from '../packages/domain/src/character-saju-sp2-evaluation.js';
import type {
  CharacterGroundingUnitViewV1,
} from '../packages/domain/src/character-saju-insight-selector.js';
import type {
  CharacterReadingPerspectiveRefV1,
} from '../packages/domain/src/character-saju-reading-plan.js';

const UNIT: CharacterGroundingUnitViewV1 = {
  unitId: 'grounding_unit_' + '1'.repeat(24),
  domain: 'career',
  axis: 'work',
  narrativeRole: 'primary',
  semanticKey: 'career:role:work',
  canonicalMeaning: '공식 판독: 일의 성취 구조는 자율적 성과와 연결됩니다.',
  sourceBlockRefs: ['official-c-1'],
  qualifiers: ['조건: 조직 내 책임과의 충돌 가능성'],
  prohibitedExtensions: ['연도·사건 단정 금지'],
  requiredCompanionUnitRefs: [],
  requiredDisclosureRefs: [],
  realizationPolicyRef: 'bounded_semantic_paraphrase_v1',
};
const PROFILE: CharacterReadingPerspectiveRefV1 = {
  characterId: 'baekheon',
  perspectiveVersion: 'published-v1',
  sourceContentVersion: 'content-v1',
  sourceSajuProfileVersion: 'saju-v1',
  profileHash: 'test-profile-hash',
};
const CANDIDATE = {
  schemaVersion: CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1,
  characterId: 'baekheon',
  sourceUnitRefs: [UNIT.unitId],
  text: '이 사주에서 먼저 짚을 부분은 일의 성취 구조입니다.',
} as const;

function responseJson(output: unknown): Response {
  return new Response(JSON.stringify({
    status: 'completed',
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(output) }],
    }],
    usage: {
      input_tokens: 111,
      output_tokens: 55,
      input_tokens_details: { cached_tokens: 3 },
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function fixture(fetchImpl: OpenAiSajuConsultationShadowFetchV1) {
  const beforeDispatch = vi.fn(async () => undefined);
  const afterOutcome = vi.fn(async (_receipt: OpenAiSajuConsultationShadowOutcomeV1) => undefined);
  const port = createOpenAiSajuConsultationShadowPortV1({
    apiKey: 'offline-test-secret',
    generationModel: 'test-generation-model',
    reviewModel: 'test-review-model',
    fetchImpl,
    beforeDispatch,
    afterOutcome,
  });
  return { port, beforeDispatch, afterOutcome };
}

describe('OpenAI Saju consultation shadow transport (offline, never user-visible)', () => {
  it('makes separate structured generation/review calls with budget and outcome receipts', async () => {
    const fetchImpl = vi.fn<OpenAiSajuConsultationShadowFetchV1>(async (_url, init) => {
      const body = JSON.parse(String(init.body)) as { model: string };
      if (body.model === 'test-generation-model') return responseJson(CANDIDATE);
      return responseJson({
        schemaVersion: 'myeongha-character-saju-sp2-evaluator-verdict-v1',
        evaluatorVersion: OPENAI_SAJU_CONSULTATION_SHADOW_EVALUATOR_VERSION_V1,
        candidateHash: hashCharacterSajuSp2CandidateV1(CANDIDATE),
        unitId: UNIT.unitId,
        semanticPreserved: true,
        characterFidelityPreserved: true,
        failureClasses: [],
      });
    });
    const { port, beforeDispatch, afterOutcome } = fixture(fetchImpl);
    const candidate = await port.generate({
      instructions: '공식 의미만 설명',
      input: { unit: UNIT },
      responseSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['schemaVersion', 'characterId', 'sourceUnitRefs', 'text'],
        properties: {
          schemaVersion: { type: 'string' },
          characterId: { type: 'string' },
          sourceUnitRefs: { type: 'array', items: { type: 'string' } },
          text: { type: 'string' },
        },
      },
    });
    expect(candidate).toEqual(CANDIDATE);
    const verdict = await port.evaluate({
      candidate: CANDIDATE,
      candidateHash: hashCharacterSajuSp2CandidateV1(CANDIDATE),
      groundingUnit: UNIT,
      characterProfileRef: PROFILE,
      publishedCharacterVoice: { speech: { honorifics: true } },
    });
    expect(verdict.semanticPreserved).toBe(true);
    expect(verdict.characterFidelityPreserved).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(beforeDispatch).toHaveBeenCalledTimes(2);
    expect(afterOutcome).toHaveBeenCalledTimes(2);
    const genRequest = JSON.parse(String(fetchImpl.mock.calls[0]![1].body)) as {
      store: boolean;
      text: { format: { strict: boolean; type: string } };
    };
    expect(genRequest.store).toBe(false);
    expect(genRequest.text.format).toMatchObject({ strict: true, type: 'json_schema' });
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.openai.com/v1/responses');
    expect(fetchImpl.mock.calls[0]![1].redirect).toBe('manual');
    const reviewRequest = JSON.parse(String(fetchImpl.mock.calls[1]![1].body)) as {
      input: readonly { content: readonly { text: string }[] }[];
    };
    expect(JSON.parse(reviewRequest.input[0]!.content[0]!.text)).toMatchObject({
      officialUnit: UNIT,
      publishedCharacterVoice: { speech: { honorifics: true } },
    });
    for (const [index, call] of afterOutcome.mock.calls.entries()) {
      expect(call[0]).toMatchObject({
        outcome: 'response_received',
        purpose: index === 0 ? 'consultation_generate' : 'consultation_evaluate',
        usage: { inputTokens: 111, outputTokens: 55, cachedInputTokens: 3 },
      });
      expect(call[0]).not.toHaveProperty('candidate');
      expect(call[0]).not.toHaveProperty('text');
      expect(call[0]).not.toHaveProperty('apiKey');
    }
  });

  it('never dispatches if server-side budget admission rejects the call', async () => {
    const fetchImpl = vi.fn<OpenAiSajuConsultationShadowFetchV1>(
      async () => responseJson(CANDIDATE),
    );
    const beforeDispatch = vi.fn(async () => { throw new Error('no budget'); });
    const afterOutcome = vi.fn(async (_receipt: OpenAiSajuConsultationShadowOutcomeV1) => undefined);
    const port = createOpenAiSajuConsultationShadowPortV1({
      apiKey: 'offline-test-secret',
      generationModel: 'test-generation-model',
      reviewModel: 'test-review-model',
      fetchImpl,
      beforeDispatch,
      afterOutcome,
    });
    await expect(port.generate({
      instructions: '상담',
      input: {},
      responseSchema: { type: 'object', properties: {} },
    })).rejects.toThrow('no budget');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(afterOutcome).not.toHaveBeenCalled();
  });

  it('fails closed and records a non-JSON response without leaking it', async () => {
    const fetchImpl = vi.fn<OpenAiSajuConsultationShadowFetchV1>(
      async () => new Response('bad upstream response', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const { port, afterOutcome } = fixture(fetchImpl);
    await expect(port.generate({
      instructions: '상담',
      input: {},
      responseSchema: { type: 'object', properties: {} },
    })).rejects.toThrow('non-JSON');
    expect(afterOutcome).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'invalid_response',
      usage: { inputTokens: null, outputTokens: null, cachedInputTokens: null },
    }));
  });

  it('rejects missing metering/budget hooks instead of making unaccounted model calls', () => {
    expect(() => createOpenAiSajuConsultationShadowPortV1({
      apiKey: 'offline-test-secret',
      generationModel: 'test-generation-model',
      reviewModel: 'test-review-model',
      beforeDispatch: undefined as never,
      afterOutcome: undefined as never,
    })).toThrow('requires governed budget');
  });
});
