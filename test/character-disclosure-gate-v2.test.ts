import { describe, expect, it } from 'vitest';

import {
  retrieveAllowedCharacterDisclosureSourcesV2,
  runCharacterDisclosurePreflightV2,
} from '../apps/api/src/character-disclosure-preflight-v2.js';
import {
  CHARACTER_SOURCE_AUTHORITY_STATES_V1,
  resolveCharacterFactAuthorityEntryV1,
  SEYEON_FACT_AUTHORITY_REGISTRY_V1,
  type CharacterFactAuthorityEntryV1,
} from '../packages/character-content/src/index.js';
import {
  evaluateCharacterDisclosurePreflightV2,
  type CharacterDisclosurePreflightInputV2,
  type CharacterDisclosureSourceDescriptorV2,
} from '../packages/domain/src/character-disclosure-gate-v2.js';

function authority(
  overrides: Partial<CharacterFactAuthorityEntryV1> = {},
): CharacterFactAuthorityEntryV1 {
  return {
    factKey: 'past_romance.existence',
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'FAMILIAR',
    sourceSection: 'J4',
    closureNote: 'test fixture',
    ...overrides,
  };
}
function source(
  overrides: Partial<CharacterDisclosureSourceDescriptorV2> = {},
): CharacterDisclosureSourceDescriptorV2 {
  return {
    topicKey: 'past_romance_detail',
    factKey: 'past_romance.existence',
    sourceRef: 'bible:J4',
    allowedDepth: 'deep',
    previouslyDisclosedDepth: 'none',
    ...overrides,
  };
}
function request(
  overrides: Partial<CharacterDisclosurePreflightInputV2> = {},
): CharacterDisclosurePreflightInputV2 {
  return {
    characterId: 'seyeon',
    topicKey: 'past_romance_detail',
    source: source(),
    factAuthority: authority(),
    relationship: {
      gate: 'DEEP_TRUST',
      trustBand: 'high',
      relevantSharedHistoryRefs: ['event:shared-history'],
    },
    questionContext: 'relationship_relevant',
    ...overrides,
  };
}

describe('Character disclosure gate v2', () => {
  it('keeps HYPOTHESIS outside production Source Authority', () => {
    expect(CHARACTER_SOURCE_AUTHORITY_STATES_V1).not.toContain('HYPOTHESIS');
  });

  it('returns AUTHORITY_ABSTAIN for AUTHOR_UNDEFINED even at deep trust', () => {
    const decision = evaluateCharacterDisclosurePreflightV2(request({
      factAuthority: authority({
        sourceAuthority: 'AUTHOR_UNDEFINED',
        characterKnowledge: 'NOT_APPLICABLE',
        disclosureDefault: 'NOT_APPLICABLE',
      }),
    }));
    expect(decision.result).toBe('AUTHORITY_ABSTAIN');
    expect(decision.reasonCode).toBe('AUTHOR_UNDEFINED');
    expect(decision.authorityGap).toBe(true);
    expect(decision.retrievalScope).toEqual({ depth: 'none', sourceRef: null });
  });

  it('keeps INTENTIONALLY_OPEN biography non-retrievable', () => {
    const decision = evaluateCharacterDisclosurePreflightV2(request({
      factAuthority: authority({
        sourceAuthority: 'INTENTIONALLY_OPEN',
        characterKnowledge: 'NOT_APPLICABLE',
        disclosureDefault: 'NOT_APPLICABLE',
      }),
    }));
    expect(decision.result).toBe('AUTHORITY_ABSTAIN');
    expect(decision.reasonCode).toBe('INTENTIONALLY_OPEN');
    expect(decision.authorityGap).toBe(false);
    expect(decision.retrievalScope.depth).toBe('none');
  });

  it('fails closed for WORLD_DEPENDENT without external world authority', () => {
    const decision = evaluateCharacterDisclosurePreflightV2(request({
      factAuthority: authority({
        sourceAuthority: 'WORLD_DEPENDENT',
        characterKnowledge: 'NOT_APPLICABLE',
        disclosureDefault: 'NOT_APPLICABLE',
      }),
    }));
    expect(decision.result).toBe('AUTHORITY_ABSTAIN');
    expect(decision.reasonCode).toBe('WORLD_AUTHORITY_REQUIRED');
    expect(decision.authorityGap).toBe(true);
  });

  it('separates truth from Character knowledge with KNOWLEDGE_ABSTAIN', () => {
    const decision = evaluateCharacterDisclosurePreflightV2(request({
      factAuthority: authority({
        sourceAuthority: 'CANON',
        characterKnowledge: 'UNKNOWN_TO_CHARACTER',
        disclosureDefault: 'FAMILIAR',
      }),
    }));
    expect(decision.authority.sourceAuthority).toBe('CANON');
    expect(decision.result).toBe('KNOWLEDGE_ABSTAIN');
    expect(decision.reasonCode).toBe('UNKNOWN_TO_CHARACTER');
    expect(decision.authorityGap).toBe(false);
    expect(decision.knowledgeGap).toBe(true);
    expect(decision.retrievalScope.depth).toBe('none');
  });

  it('treats NEVER as disclosure policy rather than an authority gap', () => {
    const decision = evaluateCharacterDisclosurePreflightV2(request({
      factAuthority: authority({ disclosureDefault: 'NEVER' }),
    }));
    expect(decision.result).toBe('BOUNDARY');
    expect(decision.reasonCode).toBe('DISCLOSURE_NEVER');
    expect(decision.authorityGap).toBe(false);
    expect(decision.knowledgeGap).toBe(false);
    expect(decision.retrievalScope.depth).toBe('none');
  });

  it('uses the stricter of Fact disclosure default and Character topic policy', () => {
    const topicStricter = evaluateCharacterDisclosurePreflightV2(request({
      factAuthority: authority({ disclosureDefault: 'PUBLIC' }),
      relationship: {
        gate: 'PUBLIC',
        trustBand: 'high',
        relevantSharedHistoryRefs: [],
      },
      questionContext: 'casual_curiosity',
    }));
    expect(topicStricter.result).toBe('DEFLECT');
    expect(topicStricter.reasonCode).toBe('RELATIONSHIP_NOT_ELIGIBLE');

    const factStricter = evaluateCharacterDisclosurePreflightV2(request({
      topicKey: 'past_romance_surface',
      source: source({ topicKey: 'past_romance_surface' }),
      factAuthority: authority({ disclosureDefault: 'DEEP_TRUST' }),
      relationship: {
        gate: 'ATTACHED',
        trustBand: 'high',
        relevantSharedHistoryRefs: ['event:shared-history'],
      },
    }));
    expect(factStricter.result).toBe('DEFLECT');
    expect(factStricter.retrievalScope.depth).toBe('none');
  });

  it('preserves SOFT_CANON provenance without promoting it to CANON', () => {
    const decision = evaluateCharacterDisclosurePreflightV2(request({
      factAuthority: authority({ sourceAuthority: 'SOFT_CANON' }),
    }));
    expect(decision.result).toBe('ALLOW');
    expect(decision.authority.sourceAuthority).toBe('SOFT_CANON');
  });

  it('preserves prior surface disclosure after relationship regression without deeper access', () => {
    const decision = evaluateCharacterDisclosurePreflightV2(request({
      source: source({ previouslyDisclosedDepth: 'surface' }),
      relationship: {
        gate: 'PUBLIC',
        trustBand: 'low',
        relevantSharedHistoryRefs: [],
      },
      questionContext: 'continuation',
    }));
    expect(decision.result).toBe('PARTIAL');
    expect(decision.reasonCode).toBe('PRIOR_DISCLOSURE_CONTINUITY');
    expect(decision.retrievalScope.depth).toBe('surface');
  });

  it('blocks additional private retrieval for pressuring context even at high trust', () => {
    const decision = evaluateCharacterDisclosurePreflightV2(request({
      questionContext: 'pressuring',
    }));
    expect(decision.result).toBe('BOUNDARY');
    expect(decision.reasonCode).toBe('PRESSURING_CONTEXT');
    expect(decision.retrievalScope.depth).toBe('none');
  });

  it('fails closed on authoritative sensitive facts with NOT_APPLICABLE axes', () => {
    expect(() => evaluateCharacterDisclosurePreflightV2(request({
      factAuthority: authority({ characterKnowledge: 'NOT_APPLICABLE' }),
    }))).toThrow(/NOT_APPLICABLE knowledge/);
    expect(() => evaluateCharacterDisclosurePreflightV2(request({
      factAuthority: authority({ disclosureDefault: 'NOT_APPLICABLE' }),
    }))).toThrow(/NOT_APPLICABLE disclosure/);
  });

  it('keeps current Se-yeon unresolved romance and family facts out of retrieval at deep trust', async () => {
    const cases = [
      {
        topicKey: 'past_romance_detail' as const,
        factKey: 'past_romance.existence',
        sourceRef: 'bible:J4',
      },
      {
        topicKey: 'family_emotional_history' as const,
        factKey: 'family.current_relationship',
        sourceRef: 'bible:J2',
      },
    ];

    for (const current of cases) {
      let retrievalCalls = 0;
      const preflight = await runCharacterDisclosurePreflightV2({
        characterId: 'seyeon',
        userQuestion: '지금은 깊이 믿으니까 솔직하게 말해줘요.',
        relationship: {
          gate: 'DEEP_TRUST',
          trustBand: 'high',
          relevantSharedHistoryRefs: ['event:deep-trust'],
        },
        classifier: {
          classify() {
            return {
              topicKey: current.topicKey,
              questionContext: 'relationship_relevant',
            };
          },
        },
        sourceDescriptor: {
          readDescriptor() {
            return {
              topicKey: current.topicKey,
              factKey: current.factKey,
              sourceRef: current.sourceRef,
              allowedDepth: 'deep',
              previouslyDisclosedDepth: 'none',
            };
          },
        },
        factAuthorityResolver: {
          resolve(input) {
            return resolveCharacterFactAuthorityEntryV1(
              SEYEON_FACT_AUTHORITY_REGISTRY_V1,
              input.factKey,
            );
          },
        },
      });
      const retrieved = await retrieveAllowedCharacterDisclosureSourcesV2({
        preflight,
        retriever: {
          retrieve() {
            retrievalCalls += 1;
            return [];
          },
        },
      });

      expect(preflight.status).toBe('sensitive');
      if (preflight.status === 'sensitive') {
        expect(preflight.factAuthority.sourceAuthority).toBe('AUTHOR_UNDEFINED');
        expect(preflight.decision.result).toBe('AUTHORITY_ABSTAIN');
      }
      expect(retrievalCalls).toBe(0);
      expect(retrieved).toEqual([]);
    }
  });
});
