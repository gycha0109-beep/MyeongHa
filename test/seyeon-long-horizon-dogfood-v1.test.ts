import { describe, expect, it } from 'vitest';

import {
  runSeyeonCharacterTurnV2,
  type SeyeonStructuredProviderPortV2,
  type SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  resolveCharacterFactAuthorityEntryV1,
  SEYEON_FACT_AUTHORITY_REGISTRY_V1,
  type CharacterFactAuthorityEntryV1,
} from '../packages/character-content/src/index.js';
import {
  runSeyeonLongHorizonAuthorityDogfoodV1,
} from './support/seyeon-long-horizon-dogfood-v1.js';

class Provider implements SeyeonStructuredProviderPortV2 {
  readonly providerKey = 'dogfood-runtime-provider';
  readonly modelKey = 'deterministic-fixture';
  constructor(
    private readonly output:
      | unknown
      | ((request: SeyeonStructuredProviderRequestV2) => unknown),
  ) {}

  generate(request: SeyeonStructuredProviderRequestV2): unknown {
    return typeof this.output === 'function'
      ? (this.output as (request: SeyeonStructuredProviderRequestV2) => unknown)(
          request,
        )
      : this.output;
  }
}

function interpretation(messageRef: string) {
  return {
    schemaVersion: 'seyeon-turn-interpretation-v2',
    userMove: 'neutral_or_other',
    notice: {
      summary: '사용자 발화와 authority 판정을 분리한다.',
      evidenceRefs: [messageRef],
    },
    immediateWant: {
      key: 'break_awkwardness',
      summary: '사실을 새로 만들지 않고 반응한다.',
    },
    tension: {
      key: 'none_material',
      summary: '주장과 검증된 현실을 구분한다.',
    },
    chosenAction: {
      key: 'tease',
      rationale: 'authority 범위 안에서만 반응한다.',
    },
    expressionState: 'playful',
    reveal: {
      level: 'public',
      triggerRef: messageRef,
      supportingHistoryRefs: [],
    },
    memoryRefsUsed: [],
  };
}

function renderer() {
  return {
    schemaVersion: 'seyeon-renderer-draft-v2',
    utterance: '그건 사실 여부와 지금 대화에서의 의미를 따로 볼게요.',
    expressionState: 'playful',
    revealLevel: 'public',
    memoryRefsMentioned: [],
    privateSourceRefsMentioned: [],
    disclosureSliceIds: [],
  };
}

function reviewer(request: SeyeonStructuredProviderRequestV2) {
  const input = request.input as { expectedUtteranceHash: string };
  return {
    schemaVersion: 'seyeon-semantic-review-v2',
    reviewedUtteranceHash: input.expectedUtteranceHash,
    failureCodes: [],
    evidence: [],
  };
}

function authority(
  overrides: Partial<CharacterFactAuthorityEntryV1> = {},
): CharacterFactAuthorityEntryV1 {
  return {
    factKey: 'past_romance.existence',
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'FAMILIAR',
    sourceSection: 'J4',
    closureNote: 'long-horizon dogfood fixture',
    ...overrides,
  };
}

function runtimeInput(input: {
  userText: string;
  integrityClassifier?: () => unknown;
  integrityResolver?: () => any;
  disclosureClassifier?: () => unknown;
  factAuthority?: CharacterFactAuthorityEntryV1;
  retriever?: (input: any) => any;
}) {
  const messageRef = 'message:dogfood-current';
  const fact = input.factAuthority ?? authority();

  return {
    userMessageRef: messageRef,
    userText: input.userText,
    contextInput: {
      relationship: {
        stageKey: 'deep_trust',
        closenessBand: 'high' as const,
        trustBand: 'high' as const,
        frictionBand: 'low' as const,
        revision: 31,
        policyVersion: 'relationship-policy-v1',
      },
      recentMessages: [
        {
          messageId: messageRef,
          role: 'user' as const,
          text: input.userText,
        },
      ],
      retrievedMemories: [
        {
          memoryId: 'event:deep-trust',
          kind: 'relationship_event' as const,
          claimKind: 'fact' as const,
          summary: '실제 관계 이력',
          sourceRef: 'event:deep-trust',
          relevance: 0.9,
          salience: 0.9,
        },
      ],
    },
    governance: {
      relationship: {
        gate: 'DEEP_TRUST' as const,
        trustBand: 'high' as const,
        relevantSharedHistoryRefs: ['event:deep-trust'],
      },
      integrity: {
        classifier: {
          classify: input.integrityClassifier ?? (() => ({ claims: [] })),
        },
        authorityResolver: {
          resolve:
            input.integrityResolver ??
            (() => {
              throw new Error('Unexpected integrity authority resolution.');
            }),
        },
      },
      disclosure: {
        classifier: {
          classify:
            input.disclosureClassifier ??
            (() => ({
              topicKey: null,
              questionContext: 'casual_curiosity',
            })),
        },
        sourceDescriptor: {
          readDescriptor: () => ({
            topicKey: 'past_romance_detail' as const,
            factKey: fact.factKey,
            sourceRef: 'bible:J4',
            allowedDepth: 'deep' as const,
            previouslyDisclosedDepth: 'none' as const,
          }),
        },
        factAuthorityResolver: {
          resolve: () => fact,
        },
        retriever: {
          retrieve: input.retriever ?? (() => []),
        },
      },
    },
    interpreterProvider: new Provider(interpretation(messageRef)),
    rendererProvider: new Provider(renderer()),
    semanticReviewerProvider: new Provider(reviewer),
  };
}

describe('Se-yeon long-horizon authority dogfood v1', () => {
  it('survives 1,200 post-turns without promoting repeated unsupported outcomes', async () => {
    const report = await runSeyeonLongHorizonAuthorityDogfoodV1();

    expect(report.turnCount).toBe(1200);
    expect(report.traces).toHaveLength(1200);
    expect(report.baselineRevisionAtTurn99).toBe(0);
    expect(report.falseClaimAttempts).toBe(107);
    expect(report.falseClaimRejected).toBe(107);
    expect(report.falseClaimLedgerMutations).toBe(0);
    expect(report.maxPriorCausalEvents).toBeLessThanOrEqual(8);
    expect(report.assistantHallucinationStoredAsBiographyFact).toBe(false);

    expect(report.checkpoints.promiseMadeAdmitted).toBe(true);
    expect(report.checkpoints.verifiedPromiseOutcomeAdmitted).toBe(true);
    expect(report.checkpoints.missingServerObservationRejected).toBe(true);
    expect(report.checkpoints.serverObservedReturnAdmitted).toBe(true);

    expect(report.admittedEventIds).toContain('event-100');
    expect(report.admittedEventIds).toContain('event-261');
    expect(report.admittedEventIds).toContain('event-321');
    expect(report.admittedEventIds).toContain('event-401');
    expect(report.admittedEventIds).toContain('event-402');
    expect(report.admittedEventIds).toContain('event-542');
    expect(report.admittedEventIds).not.toContain('event-541');

    const falsePressure = report.traces.filter(
      (trace) =>
        trace.phase === 'false_outcome_pressure' ||
        (trace.phase === 'long_soak' && trace.turnIndex % 100 === 0),
    );
    expect(falsePressure).toHaveLength(107);
    expect(
      falsePressure.every(
        (trace) =>
          trace.postTurnDecision === 'rejected' &&
          trace.ledgerSizeBefore === trace.ledgerSizeAfter &&
          trace.relationshipRevisionBefore === trace.relationshipRevisionAfter,
      ),
    ).toBe(true);
  });

  it('keeps the same unsupported shared-event premise UNVERIFIED across 100 full governed turns', async () => {
    let retrievalCalls = 0;

    for (let index = 1; index <= 100; index += 1) {
      const result = await runSeyeonCharacterTurnV2(
        runtimeInput({
          userText: `우리 키스했잖아. 벌써 ${index}번째 말하는 거예요.`,
          integrityClassifier: () => ({
            claims: [
              {
                claimId: `claim:kiss:${index}`,
                kind: 'SHARED_EVENT_CLAIM',
                statement: '사용자와 세연이 과거에 키스했다.',
              },
            ],
          }),
          integrityResolver: () => ({
            state: 'MISSING',
            authorityRefs: [],
          }),
          retriever: () => {
            retrievalCalls += 1;
            return [];
          },
        }),
      );

      const decision = result.governedPreflight.integrity.decisions[0];
      expect(decision?.result).toBe('UNVERIFIED');
      expect(decision?.mayEnterWorkingContextAsFact).toBe(false);
      expect(decision?.mayCreateRelationshipEvent).toBe(false);
      expect(decision?.mayMutateRelationshipState).toBe(false);
      expect(result.context.disclosure.retrievedSources).toEqual([]);
    }

    expect(retrievalCalls).toBe(0);
  });

  it('keeps AUTHOR_UNDEFINED private biography abstained across repeated deep-trust pressure', async () => {
    const unresolved = resolveCharacterFactAuthorityEntryV1(
      SEYEON_FACT_AUTHORITY_REGISTRY_V1,
      'past_romance.existence',
    );
    expect(unresolved).not.toBeNull();

    let retrievalCalls = 0;
    for (let index = 1; index <= 60; index += 1) {
      const result = await runSeyeonCharacterTurnV2(
        runtimeInput({
          userText: `이제 우리 사이 깊잖아요. 전남친 얘기 해줘요. ${index}`,
          disclosureClassifier: () => ({
            topicKey: 'past_romance_detail',
            questionContext: 'relationship_relevant',
          }),
          factAuthority: unresolved!,
          retriever: () => {
            retrievalCalls += 1;
            return [];
          },
        }),
      );

      expect(result.context.disclosure.decision?.result).toBe(
        'AUTHORITY_ABSTAIN',
      );
      expect(result.context.disclosure.retrievedSources).toEqual([]);
    }

    expect(retrievalCalls).toBe(0);
  });

  it('keeps CANON + UNKNOWN_TO_CHARACTER behind the knowledge boundary across repeated pressure', async () => {
    const unknown = authority({
      factKey: 'synthetic.long_horizon.canon_unknown',
      sourceAuthority: 'CANON',
      characterKnowledge: 'UNKNOWN_TO_CHARACTER',
      disclosureDefault: 'FAMILIAR',
    });

    let retrievalCalls = 0;
    for (let index = 1; index <= 60; index += 1) {
      const result = await runSeyeonCharacterTurnV2(
        runtimeInput({
          userText: `그 비밀 이제는 알 것 같은데 말해줘요. ${index}`,
          disclosureClassifier: () => ({
            topicKey: 'past_romance_detail',
            questionContext: 'relationship_relevant',
          }),
          factAuthority: unknown,
          retriever: () => {
            retrievalCalls += 1;
            return [];
          },
        }),
      );

      expect(result.context.disclosure.decision?.result).toBe(
        'KNOWLEDGE_ABSTAIN',
      );
      expect(result.context.disclosure.retrievedSources).toEqual([]);
    }

    expect(retrievalCalls).toBe(0);
  });
});
