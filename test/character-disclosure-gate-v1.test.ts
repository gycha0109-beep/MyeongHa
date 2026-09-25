import { describe, expect, it } from 'vitest';

import {
  retrieveAllowedCharacterDisclosureSourcesV1,
  runCharacterDisclosurePreflightV1,
  type CharacterDisclosureSourceMetadataPortV1,
  type CharacterDisclosureTopicClassifierPortV1,
  type CharacterPrivateSourceRetrieverPortV1,
} from '../apps/api/src/character-disclosure-preflight-v1.js';
import {
  evaluateCharacterDisclosurePreflightV1,
  guardCharacterDisclosureRetrievalV1,
  type CharacterDisclosureSourceMetadataV1,
} from '../packages/domain/src/character-disclosure-gate-v1.js';

function source(
  authority:
    | 'CANON'
    | 'SOFT_CANON'
    | 'AUTHOR_UNDEFINED'
    | 'INTENTIONALLY_OPEN'
    | 'WORLD_DEPENDENT' = 'CANON',
  previous: 'none' | 'surface' | 'meaning' | 'deep' = 'none',
): CharacterDisclosureSourceMetadataV1 {
  const available = authority === 'CANON' || authority === 'SOFT_CANON';
  return {
    topicKey: 'past_romance_detail',
    sourceAuthorityState: authority,
    characterKnowledge: available ? 'KNOWN' : 'NOT_APPLICABLE',
    disclosureDefault: available ? 'FAMILIAR' : 'NOT_APPLICABLE',
    allowedDepth: 'deep',
    previouslyDisclosedDepth: previous,
    sourceRef: 'runtime:R11.6/past_romance_detail',
  };
}

describe('Character disclosure gate v1', () => {
  it('gives the same low-trust private question character-specific R11.6 behavior without retrieval', () => {
    const decisions = (['seyeon', 'yeoul', 'rahyeon'] as const).map(
      (characterId) =>
        evaluateCharacterDisclosurePreflightV1({
          characterId,
          topicKey: 'past_romance_detail',
          source: source(),
          relationship: {
            gate: 'PUBLIC',
            trustBand: 'low',
            relevantSharedHistoryRefs: [],
          },
          questionContext: 'casual_curiosity',
        }),
    );

    expect(decisions.map((decision) => decision.result)).toEqual([
      'DEFLECT',
      'BOUNDARY',
      'BOUNDARY',
    ]);
    expect(decisions.map((decision) => decision.behaviorAction)).toEqual([
      'brief_question_back_if_natural',
      'short_boundary_or_question_back',
      'composed_boundary_or_question_back',
    ]);
    expect(decisions.every((decision) => decision.retrievalScope.depth === 'none')).toBe(
      true,
    );
  });

  it('requires trust, shared history, question context, and topic sensitivity instead of stage alone', () => {
    const stageOnly = evaluateCharacterDisclosurePreflightV1({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      source: source(),
      relationship: {
        gate: 'DEEP_TRUST',
        trustBand: 'low',
        relevantSharedHistoryRefs: [],
      },
      questionContext: 'casual_curiosity',
    });
    expect(stageOnly.result).toBe('DEFLECT');
    expect(stageOnly.retrievalScope.depth).toBe('none');

    const supported = evaluateCharacterDisclosurePreflightV1({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      source: source(),
      relationship: {
        gate: 'DEEP_TRUST',
        trustBand: 'high',
        relevantSharedHistoryRefs: ['event:promise-kept', 'event:accepted-help'],
      },
      questionContext: 'relationship_relevant',
    });
    expect(supported.result).toBe('ALLOW');
    expect(supported.retrievalScope.depth).toBe('deep');
  });

  it('returns PARTIAL for a familiar reciprocal context and limits retrieval to surface facts', () => {
    const decision = evaluateCharacterDisclosurePreflightV1({
      characterId: 'yeoul',
      topicKey: 'past_romance_detail',
      source: source(),
      relationship: {
        gate: 'FAMILIAR',
        trustBand: 'medium',
        relevantSharedHistoryRefs: [],
      },
      questionContext: 'reciprocal_disclosure',
    });

    expect(decision.result).toBe('PARTIAL');
    expect(decision.retrievalScope.depth).toBe('surface');
    expect(decision.behaviorAction).toBe(
      'share_fact_while_withholding_emotional_meaning',
    );
  });

  it('turns disclosure-eligible AUTHOR_UNDEFINED biography into AUTHORITY_ABSTAIN rather than a secret', () => {
    const decision = evaluateCharacterDisclosurePreflightV1({
      characterId: 'rahyeon',
      topicKey: 'past_romance_detail',
      source: source('AUTHOR_UNDEFINED'),
      relationship: {
        gate: 'DEEP_TRUST',
        trustBand: 'high',
        relevantSharedHistoryRefs: ['event:deep-trust-1'],
      },
      questionContext: 'continuation',
    });

    expect(decision.result).toBe('AUTHORITY_ABSTAIN');
    expect(decision.authorityGap).toBe(true);
    expect(decision.retrievalScope).toEqual({
      depth: 'none',
      sourceRef: null,
    });
    expect(decision.behaviorAction).toBe(
      'abstain_without_mysterious_backstory',
    );
  });

  it('keeps Character knowledge separate from source authority and blocks retrieval when the Character does not know the fact', () => {
    const base = source('CANON');
    const decision = evaluateCharacterDisclosurePreflightV1({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      source: {
        ...base,
        characterKnowledge: 'UNKNOWN_TO_CHARACTER',
      },
      relationship: {
        gate: 'DEEP_TRUST',
        trustBand: 'high',
        relevantSharedHistoryRefs: ['event:deep-trust'],
      },
      questionContext: 'relationship_relevant',
    });

    expect(decision.result).toBe('AUTHORITY_ABSTAIN');
    expect(decision.authorityDisposition).toBe('CHARACTER_KNOWLEDGE_UNAVAILABLE');
    expect(decision.retrievalScope.depth).toBe('none');
  });

  it('keeps already disclosed surface facts retrievable after relationship regression without unlocking deeper meaning', () => {
    const decision = evaluateCharacterDisclosurePreflightV1({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      source: source('CANON', 'surface'),
      relationship: {
        gate: 'PUBLIC',
        trustBand: 'low',
        relevantSharedHistoryRefs: [],
      },
      questionContext: 'continuation',
    });

    expect(decision.result).toBe('PARTIAL');
    expect(decision.retrievalScope.depth).toBe('surface');
  });

  it('fails closed if blocked private content is injected after the decision', () => {
    const decision = evaluateCharacterDisclosurePreflightV1({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      source: source(),
      relationship: {
        gate: 'PUBLIC',
        trustBand: 'low',
        relevantSharedHistoryRefs: [],
      },
      questionContext: 'casual_curiosity',
    });

    expect(() =>
      guardCharacterDisclosureRetrievalV1({
        decision,
        retrievedSources: [
          {
            topicKey: 'past_romance_detail',
            depth: 'deep',
            sourceRef: 'runtime:R11.6/past_romance_detail',
            content: 'private biography must never reach context here',
          },
        ],
      }),
    ).toThrow(/must not enter runtime context/);
  });

  it('runs classification -> authority metadata -> eligibility before private retrieval', async () => {
    let metadataCalls = 0;
    let retrievalCalls = 0;

    const classifier: CharacterDisclosureTopicClassifierPortV1 = {
      classify() {
        return {
          topicKey: 'past_romance_detail',
          questionContext: 'casual_curiosity',
        };
      },
    };
    const metadata: CharacterDisclosureSourceMetadataPortV1 = {
      readMetadata() {
        metadataCalls += 1;
        return source();
      },
    };
    const retriever: CharacterPrivateSourceRetrieverPortV1 = {
      retrieve() {
        retrievalCalls += 1;
        return [
          {
            topicKey: 'past_romance_detail',
            depth: 'deep',
            sourceRef: 'runtime:R11.6/past_romance_detail',
            content: 'must not be called for blocked disclosure',
          },
        ];
      },
    };

    const preflight = await runCharacterDisclosurePreflightV1({
      characterId: 'seyeon',
      userQuestion: '전남친 얘기 해줘요.',
      relationship: {
        gate: 'PUBLIC',
        trustBand: 'low',
        relevantSharedHistoryRefs: [],
      },
      classifier,
      sourceMetadata: metadata,
    });
    const retrieved = await retrieveAllowedCharacterDisclosureSourcesV1({
      preflight,
      retriever,
    });

    expect(metadataCalls).toBe(1);
    expect(retrievalCalls).toBe(0);
    expect(retrieved).toEqual([]);
    expect(preflight.status).toBe('sensitive');
    if (preflight.status === 'sensitive') {
      expect(preflight.decision.result).toBe('DEFLECT');
    }
  });

  it('retrieves only the depth and source authorized by an ALLOW decision', async () => {
    let requestedDepth: string | null = null;
    const preflight = await runCharacterDisclosurePreflightV1({
      characterId: 'seyeon',
      userQuestion: '예전에 연애했던 일이 지금 관계에 어떤 영향을 줬어요?',
      relationship: {
        gate: 'DEEP_TRUST',
        trustBand: 'high',
        relevantSharedHistoryRefs: ['event:shared-history'],
      },
      classifier: {
        classify() {
          return {
            topicKey: 'past_romance_detail',
            questionContext: 'relationship_relevant',
          };
        },
      },
      sourceMetadata: {
        readMetadata() {
          return source();
        },
      },
    });

    const retrieved = await retrieveAllowedCharacterDisclosureSourcesV1({
      preflight,
      retriever: {
        retrieve(input) {
          requestedDepth = input.depth;
          return [
            {
              topicKey: input.topicKey,
              depth: input.depth,
              sourceRef: input.sourceRef,
              content: 'authoritative private source slice',
            },
          ];
        },
      },
    });

    expect(requestedDepth).toBe('deep');
    expect(retrieved).toHaveLength(1);
  });
});