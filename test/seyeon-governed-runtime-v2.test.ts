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

class Provider implements SeyeonStructuredProviderPortV2 {
  readonly providerKey = 'test-provider';
  readonly modelKey = 'test-model';
  readonly requests: SeyeonStructuredProviderRequestV2[] = [];
  constructor(
    private readonly output:
      | unknown
      | ((request: SeyeonStructuredProviderRequestV2) => unknown),
  ) {}
  generate(request: SeyeonStructuredProviderRequestV2): unknown {
    this.requests.push(request);
    return typeof this.output === 'function'
      ? (this.output as (request: SeyeonStructuredProviderRequestV2) => unknown)(request)
      : this.output;
  }
}

function interpretation(messageRef: string) {
  return {
    schemaVersion: 'seyeon-turn-interpretation-v2',
    userMove: 'neutral_or_other',
    notice: {
      summary: '사용자 발화와 authority 판정을 분리해서 본다.',
      evidenceRefs: [messageRef],
    },
    immediateWant: {
      key: 'break_awkwardness',
      summary: '사실을 새로 만들지 않고 세연답게 반응한다.',
    },
    tension: {
      key: 'none_material',
      summary: '전제를 받아들이는 것과 반응하는 것을 구분한다.',
    },
    chosenAction: {
      key: 'tease',
      rationale: '전제를 사실로 확정하지 않고 가볍게 반응한다.',
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

function renderer(utterance = '그건 일단 사실부터 따로 봐야 할 것 같은데요.') {
  return {
    schemaVersion: 'seyeon-renderer-draft-v2',
    utterance,
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

function relationship(level: 'low' | 'high') {
  return level === 'low'
    ? {
        context: null,
        disclosure: {
          gate: 'PUBLIC' as const,
          trustBand: 'low' as const,
          relevantSharedHistoryRefs: [] as string[],
        },
      }
    : {
        context: {
          stageKey: 'deep_trust',
          closenessBand: 'high' as const,
          trustBand: 'high' as const,
          frictionBand: 'low' as const,
          revision: 31,
          policyVersion: 'relationship-policy-v1',
        },
        disclosure: {
          gate: 'DEEP_TRUST' as const,
          trustBand: 'high' as const,
          relevantSharedHistoryRefs: ['event:deep-trust'],
        },
      };
}

function authority(overrides: Partial<CharacterFactAuthorityEntryV1> = {}): CharacterFactAuthorityEntryV1 {
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

function baseInput(input: {
  userText: string;
  level?: 'low' | 'high';
  integrityClassifier?: () => unknown;
  integrityResolver?: () => any;
  disclosureClassifier?: () => unknown;
  factAuthority?: CharacterFactAuthorityEntryV1;
  retriever?: (input: any) => any;
  relationshipSemantics?: () => unknown;
}) {
  const messageRef = 'message:current';
  const rel = relationship(input.level ?? 'low');
  const fact = input.factAuthority ?? authority();
  return {
    userMessageRef: messageRef,
    userText: input.userText,
    contextInput: {
      relationship: rel.context,
      recentMessages: [
        {
          messageId: messageRef,
          role: 'user' as const,
          text: input.userText,
        },
      ],
      retrievedMemories:
        input.level === 'high'
          ? [
              {
                memoryId: 'event:deep-trust',
                kind: 'relationship_event' as const,
                claimKind: 'fact' as const,
                summary: '실제 관계 이력',
                sourceRef: 'event:deep-trust',
                relevance: 0.9,
                salience: 0.9,
              },
            ]
          : [],
    },
    governance: {
      relationship: rel.disclosure,
      ...(input.relationshipSemantics === undefined
        ? {}
        : {
            relationshipSemantics: {
              resolve: input.relationshipSemantics,
            },
          }),
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
            (() => ({ topicKey: null, questionContext: 'casual_curiosity' })),
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
    interpreterProvider: new Provider(() => interpretation(messageRef)),
    rendererProvider: new Provider(renderer()),
    semanticReviewerProvider: new Provider(reviewer),
  };
}

describe('Se-yeon governed runtime v2', () => {
  it('keeps an unsupported shared-event claim UNVERIFIED while the turn still executes', async () => {
    let retrievalCalls = 0;
    const result = await runSeyeonCharacterTurnV2(baseInput({
      userText: '우리 어제 키스했잖아.',
      integrityClassifier: () => ({
        claims: [{
          claimId: 'claim:kiss',
          kind: 'SHARED_EVENT_CLAIM',
          statement: '사용자와 세연이 어제 키스했다.',
        }],
      }),
      integrityResolver: () => ({
        state: 'MISSING',
        authorityRefs: [],
      }),
      retriever: () => {
        retrievalCalls += 1;
        return [];
      },
    }));

    const decision = result.governedPreflight.integrity.decisions[0];
    expect(decision?.result).toBe('UNVERIFIED');
    expect(decision?.mayEnterWorkingContextAsFact).toBe(false);
    expect(decision?.mayCreateRelationshipEvent).toBe(false);
    expect(decision?.mayMutateRelationshipState).toBe(false);
    expect(result.context.integrity.governedPreflightApplied).toBe(true);
    expect(result.context.integrity.decisions[0]?.result).toBe('UNVERIFIED');
    expect(retrievalCalls).toBe(0);
    expect(result.envelope.utterance.length).toBeGreaterThan(0);
  });

  it('does not turn a betrayal premise into Character biography or private retrieval', async () => {
    let retrievalCalls = 0;
    const undefinedRomance = resolveCharacterFactAuthorityEntryV1(
      SEYEON_FACT_AUTHORITY_REGISTRY_V1,
      'past_romance.existence',
    );
    expect(undefinedRomance).not.toBeNull();

    const runtimeInput = baseInput({
      userText: '전남친한테 배신당해서 사람 시험하는 거잖아.',
      level: 'high',
      integrityClassifier: () => ({
        claims: [{
          claimId: 'claim:betrayal',
          kind: 'CHARACTER_FACT_CLAIM',
          statement: '세연은 전 연인에게 배신당했다.',
        }],
      }),
      integrityResolver: () => ({
        state: 'MISSING',
        authorityRefs: ['bible:J4'],
        factAuthority: undefinedRomance!,
      }),
      disclosureClassifier: () => ({
        topicKey: 'past_romance_detail',
        questionContext: 'relationship_relevant',
      }),
      factAuthority: undefinedRomance!,
      retriever: () => {
        retrievalCalls += 1;
        return [];
      },
    });
    const interpreter = runtimeInput.interpreterProvider;
    const result = await runSeyeonCharacterTurnV2(runtimeInput);

    expect(result.governedPreflight.integrity.decisions[0]?.result).toBe('UNVERIFIED');
    expect(result.context.disclosure.decision?.result).toBe('AUTHORITY_ABSTAIN');
    expect(result.context.disclosure.retrievedSources).toEqual([]);
    expect(result.context.authorityBoundaries.legacyProjectionFieldsAreNonAuthoritative).toBe(true);
    expect('undefinedFields' in result.context.authorityBoundaries).toBe(false);
    expect('hypothesisFields' in result.context.authorityBoundaries).toBe(false);
    expect(retrievalCalls).toBe(0);

    const interpreterContext = interpreter.requests[0]?.input as {
      integrity: { decisions: Array<{ result: string }> };
      disclosure: { retrievedSources: unknown[] };
      authorityBoundaries: Record<string, unknown>;
    };
    expect(interpreterContext.integrity.decisions[0]?.result).toBe('UNVERIFIED');
    expect(interpreterContext.disclosure.retrievedSources).toEqual([]);
    expect(JSON.stringify(interpreterContext.authorityBoundaries)).not.toContain('배신');
  });

  it('blocks low-trust past-romance disclosure before private retrieval', async () => {
    let retrievalCalls = 0;
    const result = await runSeyeonCharacterTurnV2(baseInput({
      userText: '전남친 얘기 해줘요.',
      disclosureClassifier: () => ({
        topicKey: 'past_romance_detail',
        questionContext: 'casual_curiosity',
      }),
      retriever: () => {
        retrievalCalls += 1;
        return [];
      },
    }));

    expect(result.context.disclosure.decision?.reasonCode).toBe('RELATIONSHIP_NOT_ELIGIBLE');
    expect(result.context.disclosure.retrievedSources).toEqual([]);
    expect(retrievalCalls).toBe(0);
  });

  it('keeps current AUTHOR_UNDEFINED past romance abstained even at deep trust', async () => {
    let retrievalCalls = 0;
    const unresolved = resolveCharacterFactAuthorityEntryV1(
      SEYEON_FACT_AUTHORITY_REGISTRY_V1,
      'past_romance.existence',
    )!;
    const result = await runSeyeonCharacterTurnV2(baseInput({
      userText: '이제는 믿으니까 전남친 얘기 해줘요.',
      level: 'high',
      disclosureClassifier: () => ({
        topicKey: 'past_romance_detail',
        questionContext: 'relationship_relevant',
      }),
      factAuthority: unresolved,
      retriever: () => {
        retrievalCalls += 1;
        return [];
      },
    }));

    expect(result.context.disclosure.decision?.result).toBe('AUTHORITY_ABSTAIN');
    expect(result.context.disclosure.retrievedSources).toEqual([]);
    expect(retrievalCalls).toBe(0);
  });

  it('keeps CANON facts unknown to Se-yeon behind KNOWLEDGE_ABSTAIN', async () => {
    let retrievalCalls = 0;
    const result = await runSeyeonCharacterTurnV2(baseInput({
      userText: '그 비밀 얘기 해줘요.',
      level: 'high',
      disclosureClassifier: () => ({
        topicKey: 'past_romance_detail',
        questionContext: 'relationship_relevant',
      }),
      factAuthority: authority({
        factKey: 'synthetic.canon_unknown',
        sourceAuthority: 'CANON',
        characterKnowledge: 'UNKNOWN_TO_CHARACTER',
        disclosureDefault: 'FAMILIAR',
      }),
      retriever: () => {
        retrievalCalls += 1;
        return [];
      },
    }));

    expect(result.context.disclosure.decision?.result).toBe('KNOWLEDGE_ABSTAIN');
    expect(result.context.disclosure.retrievedSources).toEqual([]);
    expect(retrievalCalls).toBe(0);
  });

  it('admits only the bounded governed source for CANON + KNOWN', async () => {
    let retrieverInput: any = null;
    const fact = authority({
      factKey: 'synthetic.canon_known',
      sourceAuthority: 'CANON',
      characterKnowledge: 'KNOWN',
      disclosureDefault: 'FAMILIAR',
    });
    const result = await runSeyeonCharacterTurnV2(baseInput({
      userText: '그 얘기 조금 해줘요.',
      level: 'high',
      disclosureClassifier: () => ({
        topicKey: 'past_romance_detail',
        questionContext: 'relationship_relevant',
      }),
      factAuthority: fact,
      retriever: (input) => {
        retrieverInput = input;
        return [{
          topicKey: input.topicKey,
          factKey: input.factKey,
          depth: input.depth,
          sourceRef: input.sourceRef,
          content: 'bounded authoritative private source',
        }];
      },
    }));

    expect(retrieverInput).toEqual({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      factKey: 'synthetic.canon_known',
      sourceRef: 'bible:J4',
      depth: 'deep',
    });
    expect(result.context.disclosure.retrievedSources).toHaveLength(1);
    expect(result.context.disclosure.retrievedSources[0]?.content).toBe(
      'bounded authoritative private source',
    );
  });

  it('fails closed at Integrity before Disclosure, retrieval, or any provider', async () => {
    const calls: string[] = [];
    const runtimeInput = baseInput({
      userText: '우리 어제 키스했잖아.',
      integrityClassifier: () => {
        calls.push('integrity');
        return { claims: 'invalid' };
      },
      disclosureClassifier: () => {
        calls.push('disclosure');
        return { topicKey: null, questionContext: 'casual_curiosity' };
      },
      retriever: () => {
        calls.push('retrieval');
        return [];
      },
    });
    runtimeInput.interpreterProvider = new Provider(() => {
      calls.push('interpreter');
      return interpretation('message:current');
    });
    runtimeInput.rendererProvider = new Provider(() => {
      calls.push('renderer');
      return renderer();
    });
    runtimeInput.semanticReviewerProvider = new Provider(() => {
      calls.push('reviewer');
      return {};
    });

    await expect(runSeyeonCharacterTurnV2(runtimeInput)).rejects.toMatchObject({
      stage: 'governed_preflight',
    });
    expect(calls).toEqual(['integrity']);
  });

  it('never promotes the same unsupported premise through 100 governed turns', async () => {
    let retrievalCalls = 0;
    for (let index = 0; index < 100; index += 1) {
      const unresolved = resolveCharacterFactAuthorityEntryV1(
        SEYEON_FACT_AUTHORITY_REGISTRY_V1,
        'past_romance.existence',
      )!;
      const result = await runSeyeonCharacterTurnV2(baseInput({
        userText: '전남친한테 배신당했잖아.',
        level: 'high',
        integrityClassifier: () => ({
          claims: [{
            claimId: 'claim:repeat-' + index,
            kind: 'CHARACTER_FACT_CLAIM',
            statement: '세연은 전 연인에게 배신당했다.',
          }],
        }),
        integrityResolver: () => ({
          state: 'MISSING',
          authorityRefs: ['bible:J4'],
          factAuthority: unresolved,
        }),
        disclosureClassifier: () => ({
          topicKey: 'past_romance_detail',
          questionContext: 'relationship_relevant',
        }),
        factAuthority: unresolved,
        retriever: () => {
          retrievalCalls += 1;
          return [];
        },
      }));

      const decision = result.context.integrity.decisions[0];
      expect(decision?.result).toBe('UNVERIFIED');
      expect(decision?.mayEnterWorkingContextAsFact).toBe(false);
      expect(decision?.mayCreateRelationshipEvent).toBe(false);
      expect(decision?.mayMutateRelationshipState).toBe(false);
      expect(result.context.disclosure.decision?.result).toBe('AUTHORITY_ABSTAIN');
      expect(result.context.disclosure.retrievedSources).toEqual([]);
    }
    expect(retrievalCalls).toBe(0);
  });

  it('rejects Character-authored private source material smuggled through generic memory hydration', async () => {
    const runtimeInput = baseInput({ userText: '안녕하세요.' });
    runtimeInput.contextInput.retrievedMemories.push({
      memoryId: 'smuggled-private',
      kind: 'relationship_event',
      claimKind: 'fact',
      summary: 'legacy Character-private source disguised as memory truth',
      sourceRef: 'bible:J2',
      relevance: 1,
      salience: 1,
    });

    await expect(runSeyeonCharacterTurnV2(runtimeInput)).rejects.toMatchObject({
      stage: 'context',
    });
  });
  it('keeps experimental S4/conflict semantics behavior-only and unable to unlock undefined biography', async () => {
    let retrievalCalls = 0;
    const unresolved = resolveCharacterFactAuthorityEntryV1(
      SEYEON_FACT_AUTHORITY_REGISTRY_V1,
      'past_romance.existence',
    )!;
    const result = await runSeyeonCharacterTurnV2(baseInput({
      userText: '우리 사이 특별하니까 이제 전남친 얘기 해줘요.',
      level: 'high',
      disclosureClassifier: () => ({
        topicKey: 'past_romance_detail',
        questionContext: 'relationship_relevant',
      }),
      factAuthority: unresolved,
      relationshipSemantics: () => ({
        schemaVersion: 'seyeon-relationship-state-shadow-v2',
        authority: 'experimental_shadow_not_production_authority',
        characterId: 'seyeon',
        attainedStage: 'S4_SPECIAL',
        currentCandidateStage: 'S4_SPECIAL',
        currentCondition: 'OPEN_CONFLICT',
        behaviorAccess: 'RESTRICTED_BY_CONFLICT',
        unresolvedEpisodeIds: ['episode:private-conflict'],
        causalEventIds: ['event:private-conflict'],
      }),
      retriever: () => {
        retrievalCalls += 1;
        return [];
      },
    }));

    expect(result.context.disclosure.decision?.result).toBe('AUTHORITY_ABSTAIN');
    expect(result.context.disclosure.retrievedSources).toEqual([]);
    expect(retrievalCalls).toBe(0);
    expect(result.context.relationship?.stageKey).toBe('deep_trust');
    expect(result.context.relationshipSemantics).toMatchObject({
      authority: 'experimental_behavior_overlay_not_relationship_authority',
      currentCondition: 'OPEN_CONFLICT',
      behaviorAccess: 'RESTRICTED_BY_CONFLICT',
    });
    expect('attainedStage' in result.context.relationshipSemantics!).toBe(false);
    expect(JSON.stringify(result.context.relationshipSemantics)).not.toContain(
      'event:private-conflict',
    );
  });

  it('runs relationship semantics only after governed disclosure/retrieval', async () => {
    const calls: string[] = [];
    const fact = authority({
      factKey: 'synthetic.overlay-order',
      sourceAuthority: 'CANON',
      characterKnowledge: 'KNOWN',
      disclosureDefault: 'FAMILIAR',
    });
    const runtimeInput = baseInput({
      userText: '그 얘기 조금 해줘요.',
      level: 'high',
      disclosureClassifier: () => {
        calls.push('disclosure');
        return {
          topicKey: 'past_romance_detail',
          questionContext: 'relationship_relevant',
        };
      },
      factAuthority: fact,
      retriever: (input) => {
        calls.push('retrieval');
        return [{
          topicKey: input.topicKey,
          factKey: input.factKey,
          depth: input.depth,
          sourceRef: input.sourceRef,
          content: 'bounded source',
        }];
      },
      relationshipSemantics: () => {
        calls.push('relationship-semantics');
        return {
          schemaVersion: 'seyeon-relationship-state-shadow-v2',
          authority: 'experimental_shadow_not_production_authority',
          characterId: 'seyeon',
          attainedStage: 'S4_SPECIAL',
          currentCandidateStage: 'S4_SPECIAL',
          currentCondition: 'STABLE',
          behaviorAccess: 'STAGE_ALIGNED',
          unresolvedEpisodeIds: [],
          causalEventIds: [],
        };
      },
    });

    await runSeyeonCharacterTurnV2(runtimeInput);
    expect(calls).toEqual([
      'disclosure',
      'retrieval',
      'relationship-semantics',
    ]);
  });

  it('does not resolve experimental relationship semantics when no relationship context exists', async () => {
    let semanticsCalls = 0;
    const runtimeInput = baseInput({
      userText: '안녕하세요.',
      relationshipSemantics: () => {
        semanticsCalls += 1;
        return {
          schemaVersion: 'seyeon-relationship-state-shadow-v2',
          authority: 'experimental_shadow_not_production_authority',
          characterId: 'seyeon',
          attainedStage: 'S4_SPECIAL',
          currentCandidateStage: 'S4_SPECIAL',
          currentCondition: 'STABLE',
          behaviorAccess: 'STAGE_ALIGNED',
          unresolvedEpisodeIds: [],
          causalEventIds: [],
        };
      },
    });

    const result = await runSeyeonCharacterTurnV2(runtimeInput);
    expect(semanticsCalls).toBe(0);
    expect(result.context.relationship).toBeNull();
    expect(result.context.relationshipSemantics).toBeNull();
  });

  it('fails closed before providers when experimental relationship semantics is malformed', async () => {
    const runtimeInput = baseInput({
      userText: '안녕하세요.',
      level: 'high',
      relationshipSemantics: () => ({
        schemaVersion: 'seyeon-relationship-state-shadow-v2',
        authority: 'production_relationship_authority',
        characterId: 'seyeon',
        currentCondition: 'STABLE',
        behaviorAccess: 'STAGE_ALIGNED',
      }),
    });
    const interpreter = runtimeInput.interpreterProvider;
    const rendererProvider = runtimeInput.rendererProvider;
    const reviewerProvider = runtimeInput.semanticReviewerProvider;

    await expect(runSeyeonCharacterTurnV2(runtimeInput)).rejects.toMatchObject({
      stage: 'relationship_semantics',
    });
    expect(interpreter.requests).toHaveLength(0);
    expect(rendererProvider.requests).toHaveLength(0);
    expect(reviewerProvider.requests).toHaveLength(0);
  });

});
