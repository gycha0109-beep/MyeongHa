import { describe, expect, it } from 'vitest';

import {
  buildSeyeonEventExtractorRequestV2,
  extractSeyeonEventCandidateV2,
} from '../apps/api/src/seyeon-event-extractor-v2.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import type { SeyeonEventExtractionContextV2 } from '../packages/domain/src/index.js';

function context(): SeyeonEventExtractionContextV2 {
  return {
    turnId: 'turn-1',
    messages: [
      {
        messageId: 'user-1',
        role: 'user',
        text: '그때 말한 거 기억하고 있었어요.',
      },
      {
        messageId: 'assistant-1',
        role: 'assistant',
        text: '그걸 기억하고 계셨네요.',
      },
    ],
    priorEvents: [],
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2',
      userMove: 'remembered_seyeon_detail',
      notice: {
        summary: '사용자가 이전 세연의 말을 기억했다.',
        evidenceRefs: ['user-1'],
      },
      immediateWant: {
        key: 'continue_promise',
        summary: '현재 대화에 자연스럽게 이어간다.',
      },
      tension: {
        key: 'remember_vs_memory_showoff',
        summary: '관계 의미를 과장하지 않는다.',
      },
      chosenAction: {
        key: 'remember_naturally',
        rationale: '현재 장면에 필요한 만큼만 반응한다.',
      },
      expressionState: 'embarrassed',
      reveal: {
        level: 'familiar',
        triggerRef: 'user-1',
        supportingHistoryRefs: [],
      },
      memoryRefsUsed: [],
    },
    envelope: {
      schemaVersion: 'seyeon-dialogue-envelope-v2',
      utterance: '그걸 기억하고 계셨네요.',
      expressionState: 'embarrassed',
      revealLevel: 'familiar',
      memoryRefsMentioned: [],
      privateSourceRefsMentioned: [],
      disclosureSliceIds: [],
      interpretationSchemaVersion: 'seyeon-turn-interpretation-v2',
      semanticReviewHash: 'sha256:v1:test',
    },
    relationshipBefore: {
      schemaVersion: 'seyeon-relationship-projection-exp-v2',
      authority: 'derived_experimental_projection',
      characterId: 'seyeon',
      policyVersion: 'seyeon-relationship-evidence-policy-exp-v0.1',
      revision: 0,
      evidence: {
        familiarity: 0,
        trust: 0,
        reciprocity: 0,
        disclosure: 0,
        agencyRespect: 0,
      },
      conflictState: 'none',
      repairState: 'none',
      causalEventIds: {
        familiarity: [],
        trust: [],
        reciprocity: [],
        disclosure: [],
        agencyRespect: [],
        conflict: [],
        repair: [],
      },
      lastMeaningfulEventAt: null,
    },
  };
}

describe('Se-yeon event extractor provider adapter v2', () => {
  it('uses a distinct structured provider purpose and strict event/none schema', () => {
    const request = buildSeyeonEventExtractorRequestV2(context());

    expect(request.purpose).toBe('event_extraction');
    expect(request.responseSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });

  it('guards provider output before returning a durable event candidate', async () => {
    const requests: SeyeonStructuredProviderRequestV2[] = [];
    const provider: SeyeonStructuredProviderPortV2 = {
      providerKey: 'mock-event-extractor',
      modelKey: 'cheap-structured-v1',
      generate(request) {
        requests.push(request);
        return {
          schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
          decision: 'event',
          reason: '세연의 작은 말을 사용자가 기억한 관계 사건.',
          eventKind: 'USER_REMEMBERED_SEYEON_DETAIL',
          sourceMessageRefs: ['user-1', 'assistant-1'],
          causalPredecessorEventIds: [],
          facts: [
            {
              factKey: 'user_remembered_seyeon_detail',
              statement: '사용자가 이전 세연의 말을 기억했다고 직접 말했다.',
              sourceRefs: ['user-1'],
            },
          ],
          characterInterpretation: {
            statement: '세연은 이를 관계적으로 의미 있게 받아들였다.',
            confidence: 0.8,
            sourceRefs: ['user-1', 'assistant-1'],
          },
          salience: 0.8,
          confidence: 0.95,
          dedupeBasis: 'turn-1:user_remembered_seyeon_detail',
        };
      },
    };

    const candidate = await extractSeyeonEventCandidateV2({
      context: context(),
      provider,
    });

    expect(candidate.decision).toBe('event');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.purpose).toBe('event_extraction');
  });

  it('fails closed when provider invents a source message', async () => {
    const provider: SeyeonStructuredProviderPortV2 = {
      providerKey: 'mock-event-extractor',
      modelKey: 'bad',
      generate() {
        return {
          schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
          decision: 'event',
          reason: 'bad',
          eventKind: 'PROMISE_MADE',
          sourceMessageRefs: ['invented-message'],
          causalPredecessorEventIds: [],
          facts: [
            {
              factKey: 'promise',
              statement: '근거 없는 약속',
              sourceRefs: ['invented-message'],
            },
          ],
          characterInterpretation: null,
          salience: 0.8,
          confidence: 0.9,
          dedupeBasis: 'bad',
        };
      },
    };

    await expect(
      extractSeyeonEventCandidateV2({
        context: context(),
        provider,
      }),
    ).rejects.toThrow(/absent from the extraction context/);
  });
});