import { describe, expect, it, vi } from 'vitest';
import type { CharacterContentDefinition } from '../packages/character-content/src/index.js';
import { DEV_CHARACTER_CONTENT_BUNDLE } from '../packages/test-fixtures/src/index.js';
import {
  CharacterStandardReadingChatContextErrorV1,
  assemblePreparedCharacterStandardReadingRuntimeContextV1,
  prepareCharacterStandardReadingChatContextV1,
  type CharacterRuntimeContextAssemblyInputV1,
  type CharacterStandardReadingChatBaseContextInputV1,
} from '../apps/api/src/index.js';
import { assembleCharacterRuntimeContext } from '../packages/domain/src/index.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from '../apps/api/src/character-standard-reading-knowledge.js';

const READING_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const SUBJECT_ID = '33333333-3333-4333-8333-333333333333';

function responseSnapshot() {
  return {
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    reading: {
      readingId: READING_ID,
      calculationSummary: {},
      sections: [
        {
          sectionType: 'career',
          title: '직업 · 일',
          blocks: [{ type: 'paragraph', text: '공식 직업 Reading의 핵심 내용입니다.' }],
        },
      ],
      disclosures: [
        {
          type: 'scope_limitation',
          text: '이 결과는 현재 공식 Reading 범위에 한정됩니다.',
        },
      ],
    },
  };
}

function ports() {
  const accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1 = {
    readAccessibleReadings: vi.fn(async () => [
      {
        readingId: READING_ID,
        readingSessionId: '44444444-4444-4444-8444-444444444444',
        productId: PRODUCT_ID,
        topicKey: 'career',
        sajuDomain: 'career',
        readingPeriod: 'original',
        readingVariant: 'standard',
        sourceBirthRevisionId: '55555555-5555-4555-8555-555555555555',
        productSpecVersion: 'standard-reading-v1',
        domainCapabilityVersion: 'career-v1',
        readingContractVersion: 'myeonghwa-product-reading-response-v2',
        sajuEngineVersion: 'saju-engine-v1',
        responseHash: 'sha256:v1:official-reading-response',
      },
    ]),
  };
  const artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1 = {
    readArtifactSource: vi.fn(async () => [
      {
        readingId: READING_ID,
        productId: PRODUCT_ID,
        readerCharacterId: 'baekheon',
        readingContractVersion: 'myeonghwa-product-reading-response-v2',
        productResponseState: 'delivered',
        responseSnapshotJsonb: responseSnapshot(),
        responseHash: 'sha256:v1:official-reading-response',
        completedAt: '2026-09-21T00:00:00.000Z',
      },
    ]),
  };
  return { accessAuthorityPort, artifactAuthorityPort };
}

function authoredCharacter(characterId = 'baekheon'): CharacterContentDefinition {
  const base = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!;
  return {
    ...base,
    characterId,
    displayName: 'Official Reading Runtime Test Reader',
    deityProxyLabel: 'official_reading_runtime_test',
    shortDescriptor: 'official reading runtime test only',
    personalityTraits: ['observant'],
    flaws: ['overchecks continuity'],
    values: ['truth'],
    emotionIds: ['neutral', 'serious'],
    animationCueIds: ['idle'],
    canon: {
      worldRole: 'record witness',
      origin: 'record hall',
      apparentAgeBand: 'adult',
      deityBond: {
        deityId: 'deity-official-reading-runtime-test',
        representationRole: 'witness',
        oath: 'Keep the record intact.',
        acceptedDoctrine: ['Records matter.'],
        resistedDoctrine: ['Records do not own people.'],
      },
      worldview: {
        coreValues: ['truth'],
        humanTheory: 'People repeat and revise themselves.',
        agencyTheory: 'People can act on what they learn.',
        truthTheory: 'Claims need provenance.',
      },
      psychology: {
        desire: 'Understand continuity.',
        fear: 'Confusing preservation with control.',
        flaw: 'Overchecks continuity.',
        contradiction: 'Questions change in order to protect it.',
        hiddenMotivation: 'Wants to see change survive memory.',
      },
    },
    persona: {
      communication: {
        register: 'measured',
        sentenceRhythm: 'short',
        verbosity: 'medium',
        humorStyle: 'dry',
        metaphorStyle: 'records',
        profanityIntensity: 'none',
        politenessStyle: 'reserved',
      },
      cognition: {
        thinkingTempo: 'slow',
        ambiguityTolerance: 'high',
        conclusionStyle: 'evidence_first',
        contradictionSensitivity: 'high',
      },
      questioning: {
        preferredStrategies: ['chronology'],
        avoidedStrategies: ['forced_binary'],
        followUpDepth: 'deep',
      },
      emotion: {
        expressiveness: 'restrained',
        empathyStyle: 'recall',
        angerStyle: 'precise',
        embarrassmentStyle: 'deflect',
      },
      conflict: {
        confrontationStyle: 'direct',
        apologyStyle: 'specific',
        withdrawalStyle: 'temporary',
      },
      intimacy: {
        pace: 'slow',
        selfDisclosure: 'selective',
        boundaryStyle: 'clear',
        attachmentExpression: 'remembering',
      },
    },
    behavior: {
      policyVersion: 'behavior-v1',
      questionPriorities: ['chronology'],
      supportPriorities: ['witness'],
      rules: [],
    },
    sajuProfile: {
      profileVersion: 'saju-profile-v1',
      attentionAxes: ['continuity'],
      followUpQuestionStrategies: ['chronology'],
      framingStyle: 'record_first',
      uncertaintyResponseStyle: 'preserve',
      insufficientEvidenceResponseStyle: 'state_limit',
      referralBehavior: {
        maySuggestAnotherCharacter: false,
        conditions: [],
      },
    },
    relationshipBehavior: {
      behaviorVersion: 'relationship-behavior-v1',
      defaultMode: {
        distance: 'reserved',
        questionDepth: 'medium',
        selfDisclosure: 'low',
        humorIntensity: 'low',
        directness: 'medium',
        memoryReferenceFrequency: 'low',
        nicknameBehavior: 'formal',
        conflictSensitivity: 'medium',
      },
      rules: [],
    },
    capabilities: [
      {
        domain: 'career',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'career-v1',
      },
    ],
    developmentPlaceholder: undefined as never,
  };
}

function baseContext(characterId = 'baekheon') {
  return {
    character: authoredCharacter(characterId),
    contentBundleId: 'bundle-v1',
    relationshipState: {
      closeness: 40,
      trust: 40,
      friction: 10,
      stage: 'familiar',
      revision: 1,
      policyVersion: 'relationship-policy-v1',
    },
    recentRelationshipEventKeys: [],
    relationshipProjectionPolicy: {
      version: 'relationship-render-v1',
      closeness: { lowMax: 20, mediumMax: 60 },
      trust: { lowMax: 20, mediumMax: 60 },
      friction: { lowMax: 20, mediumMax: 60 },
    },
    worldRelations: [],
    grantedLifeFacts: [],
    grantedMemories: [],
    recentMessages: [],
  } as CharacterStandardReadingChatBaseContextInputV1;
}

describe('Official Reading -> Reader Chat context composition', () => {
  it('re-resolves server authority and injects exact Official Reading protected content', async () => {
    const authority = ports();

    const plan = await prepareCharacterStandardReadingChatContextV1({
      resolvedSubjectId: SUBJECT_ID,
      readerCharacterId: 'baekheon',
      readingId: READING_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z',
      ...authority,
      contextInput: baseContext(),
    });

    expect(authority.accessAuthorityPort.readAccessibleReadings).toHaveBeenCalledWith({
      subjectId: SUBJECT_ID,
      readerCharacterId: 'baekheon',
      effectiveAt: '2026-09-21T00:01:00.000Z',
    });
    expect(authority.artifactAuthorityPort.readArtifactSource).toHaveBeenCalledWith({
      subjectId: SUBJECT_ID,
      readingId: READING_ID,
      readerCharacterId: 'baekheon',
      effectiveAt: '2026-09-21T00:01:00.000Z',
    });
    expect(plan.source.readerCharacterId).toBe('baekheon');
    expect(plan.contextInput.saju?.readingRef).toBe(READING_ID);
    expect(plan.contextInput.saju?.domain).toBe('career');
    expect(plan.contextInput.saju?.protectedSegments.map((segment) => segment.text)).toEqual([
      '공식 직업 Reading의 핵심 내용입니다.',
    ]);
    expect(plan.contextInput.saju?.disclosures[0]?.text).toBe(
      '이 결과는 현재 공식 Reading 범위에 한정됩니다.',
    );
  });

  it('rejects a different active Character instead of borrowing another Reader Reading', async () => {
    const authority = ports();

    await expect(
      prepareCharacterStandardReadingChatContextV1({
        resolvedSubjectId: SUBJECT_ID,
        readerCharacterId: 'baekheon',
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contextInput: baseContext('seyeon'),
      }),
    ).rejects.toThrow(/Reader does not match the active Character context/u);
  });

  it('rejects any caller-supplied Saju context before authority lookup', async () => {
    const authority = ports();
    const contextInput = {
      ...baseContext(),
      saju: {
        readingRef: 'forged',
        domain: 'career',
        coverageState: 'complete',
        protectedSegments: [],
        disclosures: [],
        ambiguity: [],
      },
    } as unknown as Omit<CharacterRuntimeContextAssemblyInputV1, 'saju'>;

    await expect(
      prepareCharacterStandardReadingChatContextV1({
        resolvedSubjectId: SUBJECT_ID,
        readerCharacterId: 'baekheon',
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contextInput,
      }),
    ).rejects.toBeInstanceOf(CharacterStandardReadingChatContextErrorV1);

    expect(authority.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects a Reader whose published Character capability does not cover the Reading domain', async () => {
    const authority = ports();
    const contextInput = {
      ...baseContext(),
      character: {
        ...(baseContext().character as object),
        characterId: 'baekheon',
        capabilities: [
          {
            domain: 'wealth',
            role: 'primary',
            canInitiate: true,
            capabilityVersion: 'wealth-v1',
          },
        ],
      },
    } as unknown as Omit<CharacterRuntimeContextAssemblyInputV1, 'saju'>;

    await expect(
      prepareCharacterStandardReadingChatContextV1({
        resolvedSubjectId: SUBJECT_ID,
        readerCharacterId: 'baekheon',
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contextInput,
      }),
    ).rejects.toThrow(/does not authorize the Official Reading domain/u);
  });

  it('assembles the server-minted Official Reading plan in Production without opening direct Saju injection', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const plan = await prepareCharacterStandardReadingChatContextV1({
        resolvedSubjectId: SUBJECT_ID,
        readerCharacterId: 'baekheon',
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...ports(),
        contextInput: baseContext(),
      });

      expect(() => assembleCharacterRuntimeContext(plan.contextInput)).toThrow(
        /Direct Saju context assembly is blocked outside development\/test fixtures/u,
      );

      const context =
        assemblePreparedCharacterStandardReadingRuntimeContextV1(plan);
      expect(context.characterId).toBe('baekheon');
      expect(context.saju?.readingRef).toBe(READING_ID);
      expect(context.saju?.protectedSegments.map((segment) => segment.text)).toEqual([
        '공식 직업 Reading의 핵심 내용입니다.',
      ]);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('rejects a structural lookalike instead of treating a caller-forged plan as server authority', async () => {
    const plan = await prepareCharacterStandardReadingChatContextV1({
      resolvedSubjectId: SUBJECT_ID,
      readerCharacterId: 'baekheon',
      readingId: READING_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z',
      ...ports(),
      contextInput: baseContext(),
    });
    const forgedPlan = Object.freeze({
      source: plan.source,
      contextInput: plan.contextInput,
    });

    expect(() =>
      assemblePreparedCharacterStandardReadingRuntimeContextV1(forgedPlan),
    ).toThrow(/was not minted by server authority/u);
  });
});
