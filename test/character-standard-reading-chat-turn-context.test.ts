import { describe, expect, it, vi } from 'vitest';
import { prepareCharacterStandardReadingChatTurnPreflightV2 } from '../apps/api/src/character-standard-reading-chat-turn-preflight-v2.js';
import {
  prepareCharacterStandardChatGroundingV2,
  assertServerPreparedStandardChatGroundingV2,
} from '../apps/api/src/character-standard-reading-chat-grounding-v2.js';
import { selectCharacterStandardFollowupEvidenceV1 } from '../apps/api/src/character-standard-reading-chat-followup-evidence-v1.js';
import { runThreadBoundReaderInterpretationPreviewV2 } from '../apps/api/src/reader-interpretation-preview-runtime-v2.js';
import type { CharacterContentDefinition } from '../packages/character-content/src/index.js';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  hashCharacterSajuGroundingBundleMaterialV1,
  type CharacterSajuGroundingBundleViewV1,
} from '../packages/domain/src/index.js';
import {
  DEV_CHARACTER_CONTENT_BUNDLE,
  DEV_WORLD_CONTENT_BUNDLE,
} from '../packages/test-fixtures/src/index.js';
import {
  ContentReleaseRuntime,
  type ContentReleaseRuntimeEntry,
} from '../packages/world-content/src/index.js';
import {
  CharacterStandardReadingChatTurnPreflightErrorV1,
  CharacterStandardReadingThreadRuntimeErrorV1,
  prepareCharacterStandardReadingChatTurnPreflightV1,
  prepareCharacterStandardReadingThreadRuntimeV1,
  prepareChatReceiveCommand,
  runThreadBoundReaderInterpretationPreviewV1,
  type CharacterStandardReadingChatBaseContextInputV1,
  type CharacterStandardReadingChatTurnServerContextInputV1,
} from '../apps/api/src/index.js';
import {
  runReaderInterpretationPreviewHttpV1,
} from '../apps/api/src/reader-interpretation-preview-http.js';
import {
  SAJU_CHARACTER_GROUNDING_ADMISSION_HEADER_V1,
  SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1,
  createSajuCharacterGroundingHttpAdapterV1,
} from '../apps/api/src/saju-character-grounding-http-adapter.js';
import type {
  SajuProductionCalculationHttpRequestInitV1,
} from '../apps/api/src/saju-production-calculation-http-adapter.js';
import type { ChatThreadRuntimeBindingReadAuthorityPortV1 } from '../apps/api/src/chat-thread-runtime-binding-read.js';
import type { CharacterRelationshipReadAuthorityPortV1 } from '../apps/api/src/character-relationship-read.js';
import type { MemoryItemsReadAuthorityPortV1 } from '../apps/api/src/memory-items-read.js';
import type { MemoryGrantsReadAuthorityPortV1 } from '../apps/api/src/memory-grants-read.js';
import type { ReaderContextNonMemoryReadAuthorityPortV1 } from '../apps/api/src/reader-context-non-memory-read.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from '../apps/api/src/character-standard-reading-knowledge.js';

const SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
const THREAD_ID = '66666666-6666-4666-8666-666666666666';
const READING_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const BUNDLE_ID = '77777777-7777-4777-8777-777777777777';
const RELEASE_ID = '88888888-8888-4888-8888-888888888888';

function authoredCharacter(characterId = 'baekheon'): CharacterContentDefinition {
  const base = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!;
  return {
    ...base,
    characterId,
    displayName: 'Thread-bound Official Reading Test Reader',
    deityProxyLabel: 'thread_bound_official_reading_test',
    shortDescriptor: 'thread-bound official reading test only',
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
        deityId: 'deity-thread-bound-test',
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
      attentionAxes: ['long_cycle', 'accumulated_consequence', 'endurance'],
      followUpQuestionStrategies: ['chronology'],
      framingStyle: 'record_first',
      uncertaintyResponseStyle: 'preserve',
      insufficientEvidenceResponseStyle: 'state_limit',
      referralBehavior: { maySuggestAnotherCharacter: false, conditions: [] },
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

function contextInput(
  characterId = 'baekheon',
  contentBundleId = BUNDLE_ID,
): CharacterStandardReadingChatBaseContextInputV1 {
  return {
    character: authoredCharacter(characterId),
    contentBundleId,
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
  };
}

function serverContextInput(): CharacterStandardReadingChatTurnServerContextInputV1 {
  const {
    character: _character,
    contentBundleId: _contentBundleId,
    worldRelations: _worldRelations,
    relationshipState: _relationshipState,
    grantedLifeFacts: _grantedLifeFacts,
    grantedMemories: _grantedMemories,
    ...context
  } = contextInput();
  return context;
}

function authorities(
  participants: readonly string[] = ['baekheon'],
  readerContentBundleId = BUNDLE_ID,
) {
  const threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1 = {
    readRuntimeBinding: vi.fn(async () => [{
      threadId: THREAD_ID,
      status: 'active',
      activeContentReleaseId: RELEASE_ID,
      activeContentBundleId: BUNDLE_ID,
      contentRevision: 4,
      participantCharacterIds: participants,
    }]),
  };
  const accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1 = {
    readAccessibleReadings: vi.fn(async () => [{
      subjectId: SUBJECT_ID,
      readingId: READING_ID,
      readingSessionId: '44444444-4444-4444-8444-444444444444',
      productId: PRODUCT_ID,
      readerCharacterId: 'baekheon',
      readerContentBundleId,
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
    }]),
  };
  const artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1 = {
    readArtifactSource: vi.fn(async () => [{
      readingId: READING_ID,
      productId: PRODUCT_ID,
      readerCharacterId: 'baekheon',
      readingContractVersion: 'myeonghwa-product-reading-response-v2',
      productResponseState: 'delivered',
      responseSnapshotJsonb: {
        responseVersion: 'myeonghwa-product-reading-response-v2',
        state: 'delivered',
        reading: {
          readingId: READING_ID,
          calculationSummary: {},
          sections: [{
            sectionType: 'career',
            title: '직업 · 일',
            blocks: [{ type: 'paragraph', text: '서버가 다시 읽은 공식 직업 Reading입니다.' }],
          }],
          disclosures: [],
        },
      },
      responseHash: 'sha256:v1:official-reading-response',
      completedAt: '2026-09-21T00:00:00.000Z',
    }]),
  };
  const relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1 = {
    readCurrentRelationship: vi.fn(async () => [{
      stateId: '99999999-9999-4999-8999-999999999991',
      characterId: 'baekheon',
      closeness: 47,
      trust: 52,
      friction: 8,
      relationshipStage: 'familiar',
      policyVersion: 'relationship-policy-v1',
      revision: 7,
      lastInteractionAt: '2026-09-21T00:01:30.000Z',
      updatedAt: '2026-09-21T00:01:30.000Z',
    }]),
  };
  const memoryItemsAuthorityPort: MemoryItemsReadAuthorityPortV1 = {
    readCurrentItems: vi.fn(async () => [
      {
        memoryItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        memoryType: 'reader_memory',
        schemaVersion: 'v1',
        contentJsonb: { summary: '사용자가 직업 선택을 고민하고 있다고 말했다.' },
        createdByCharacterId: 'baekheon',
        createdAt: '2026-09-21T00:01:20.000Z',
      },
      {
        memoryItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        memoryType: 'private_memory',
        schemaVersion: 'v1',
        contentJsonb: { summary: '다른 Reader에게만 공유된 기억' },
        createdByCharacterId: 'seyeon',
        createdAt: '2026-09-21T00:01:10.000Z',
      },
    ]),
  };
  const memoryGrantsAuthorityPort: MemoryGrantsReadAuthorityPortV1 = {
    readActiveGrants: vi.fn(async ({ memoryItemId }) => (
      memoryItemId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
        ? [{
            grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
            characterId: 'baekheon',
            grantReason: 'user_explicit',
            grantedAt: '2026-09-21T00:01:25.000Z',
          }]
        : [{
            grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
            characterId: 'seyeon',
            grantReason: 'user_explicit',
            grantedAt: '2026-09-21T00:01:15.000Z',
          }]
    )),
  };
  const nonMemoryContextAuthorityPort: ReaderContextNonMemoryReadAuthorityPortV1 = {
    readGrantedLifeFacts: vi.fn(async () => [{
      factId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      factType: 'occupation',
      schemaVersion: 'life-fact-v1',
      value: { value: 'designer' },
      grantId: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
      granteeCharacterId: 'baekheon',
    }]),
    readRelationshipEvents: vi.fn(async () => []),
    readRecentMessages: vi.fn(async () => []),
  };
  // Synthetic Product/Commerce approval for legacy Reader Preview integration
  // fixtures only; production has no implicit approved Product policy.
  const productReaderEligibilityAuthorityPort = {
    readApprovedRule: vi.fn(async () => ({
      status: 'approved' as const,
      rule: {
        kind: 'standard_all_readers' as const,
        productId: PRODUCT_ID,
        productSpecVersion: 'standard-reading-v1',
        sajuDomain: 'career' as const,
        ruleVersion: 'synthetic-test-reader-policy-v1',
        approvedPolicyRevision: 'synthetic-test-revision-v1',
      },
    })),
  };
  return {
    threadBindingAuthorityPort,
    accessAuthorityPort,
    artifactAuthorityPort,
    productReaderEligibilityAuthorityPort,
    relationshipAuthorityPort,
    memoryItemsAuthorityPort,
    memoryGrantsAuthorityPort,
    nonMemoryContextAuthorityPort,
  };
}

function compatibleReceiveRuntime(
  releaseId = RELEASE_ID,
  bundleId = BUNDLE_ID,
): ContentReleaseRuntime {
  const contentVersion = 'reader-follow-up-test-v1';
  const entry = {
    release: {
      releaseId,
      bundleId,
      contentVersion,
    },
    characters: {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      bundleId,
      contentVersion,
      characters: [authoredCharacter('baekheon')],
    },
    world: {
      ...DEV_WORLD_CONTENT_BUNDLE,
      bundleId,
      contentVersion,
      characterRelations: [],
      episodes: [],
    },
    lifecycle: 'active',
  } as unknown as ContentReleaseRuntimeEntry;

  return {
    assertPinnedClientCompatible: vi.fn(() => entry),
    resolveForNewThread: vi.fn(() => entry),
    resolvePinned: vi.fn(() => entry),
  } as unknown as ContentReleaseRuntime;
}

function existingThreadReceivePlan(
  releaseId = RELEASE_ID,
  bundleId = BUNDLE_ID,
) {
  return prepareChatReceiveCommand({
    request: {
      threadId: THREAD_ID,
      clientTurnId: 'turn-reader-follow-up-1',
      text: '방금 본 직업 해석을 조금 더 설명해 주세요.',
      clientCapability: 'source-authorized-test-capability',
    },
    releaseRuntime: compatibleReceiveRuntime(releaseId, bundleId),
    trustedThread: {
      threadId: THREAD_ID,
      pinnedReleaseId: releaseId,
      participantCharacterIds: ['baekheon'],
    },
  });
}

function previewGrounding(): CharacterSajuGroundingBundleViewV1 {
  const withoutHash = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: READING_ID,
    productResponseVersion: 'myeonghwa-product-reading-response-v2',
    engineVersion: 'saju-engine-v1',
    readingDomain: 'career' as const,
    sourceResponseHash: 'a'.repeat(64),
    units: [
      {
        unitId: `grounding_unit_${'1'.repeat(24)}`,
        domain: 'career' as const,
        axis: 'timing' as const,
        narrativeRole: 'primary' as const,
        semanticKey: 'career:timing',
        canonicalMeaning: '긴 시간축에서 반복되는 직업 흐름을 먼저 확인합니다.',
        sourceBlockRefs: ['sections.0.blocks.0'],
        requiredCompanionUnitRefs: [],
        requiredDisclosureRefs: [],
        realizationPolicyRef: 'bounded_semantic_paraphrase_v1' as const,
      },
      {
        unitId: `grounding_unit_${'2'.repeat(24)}`,
        domain: 'career' as const,
        axis: 'tension' as const,
        narrativeRole: 'tension' as const,
        semanticKey: 'career:tension',
        canonicalMeaning: '누적된 부담이 선택에 함께 작동할 수 있습니다.',
        sourceBlockRefs: ['sections.0.blocks.0'],
        requiredCompanionUnitRefs: [],
        requiredDisclosureRefs: [],
        realizationPolicyRef: 'bounded_semantic_paraphrase_v1' as const,
      },
      {
        unitId: `grounding_unit_${'3'.repeat(24)}`,
        domain: 'career' as const,
        axis: 'strength' as const,
        narrativeRole: 'supporting' as const,
        semanticKey: 'career:strength',
        canonicalMeaning: '지속 가능한 힘이 직업 선택의 한 축입니다.',
        sourceBlockRefs: ['sections.0.blocks.0'],
        requiredCompanionUnitRefs: [],
        requiredDisclosureRefs: [],
        realizationPolicyRef: 'bounded_semantic_paraphrase_v1' as const,
      },
    ],
    disclosures: [],
    ambiguities: [],
  };
  return {
    ...withoutHash,
    groundingHash: hashCharacterSajuGroundingBundleMaterialV1(withoutHash),
  };
}

describe('thread-bound Official Reading Reader runtime', () => {
  it('derives Reader identity from the owned thread and assembles the exact Official Reading context', async () => {
    const authority = authorities();
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const result = await prepareCharacterStandardReadingThreadRuntimeV1({
        resolvedSubjectId: SUBJECT_ID,
        threadId: THREAD_ID,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contextInput: contextInput(),
      });

      expect(result.threadBinding.participantCharacterIds).toEqual(['baekheon']);
      expect(result.source.readerCharacterId).toBe('baekheon');
      expect(result.context.characterId).toBe('baekheon');
      expect(result.context.saju?.readingRef).toBe(READING_ID);
      expect(result.context.saju?.protectedSegments.map((segment) => segment.text)).toEqual([
        '서버가 다시 읽은 공식 직업 Reading입니다.',
      ]);
      expect(authority.accessAuthorityPort.readAccessibleReadings).toHaveBeenCalledWith({
        subjectId: SUBJECT_ID,
        readerCharacterId: 'baekheon',
        effectiveAt: '2026-09-21T00:01:00.000Z',
      });
    } finally {
      if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('rejects multi-Character threads before Reader Knowledge lookup', async () => {
    const authority = authorities(['baekheon', 'seyeon']);

    await expect(
      prepareCharacterStandardReadingThreadRuntimeV1({
        resolvedSubjectId: SUBJECT_ID,
        threadId: THREAD_ID,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contextInput: contextInput(),
      }),
    ).rejects.toBeInstanceOf(CharacterStandardReadingThreadRuntimeErrorV1);

    expect(authority.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects a Character context that does not match the active thread Reader', async () => {
    const authority = authorities();

    await expect(
      prepareCharacterStandardReadingThreadRuntimeV1({
        resolvedSubjectId: SUBJECT_ID,
        threadId: THREAD_ID,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contextInput: contextInput('seyeon'),
      }),
    ).rejects.toThrow(/does not match the active thread Reader/u);

    expect(authority.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
  });

  it('runs Reader Interpretation with Reader identity derived from the owner-authorized thread', async () => {
    const authority = authorities();
    const bundle = previewGrounding();
    const groundingProjectionPort = {
      projectGrounding: vi.fn(async () => bundle),
    };

    const result = await runThreadBoundReaderInterpretationPreviewV1({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      officialReadingId: READING_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z',
      ...authority,
      contentReleaseRuntime: compatibleReceiveRuntime(),
      contextInput: serverContextInput(),
      groundingProjectionPort,
    });

    expect(result.readerCharacterId).toBe('baekheon');
    expect(result.readerContentBundleId).toBe(BUNDLE_ID);
    expect(result.officialReadingId).toBe(READING_ID);
    expect(result.sourceResponseHash).toBe(bundle.sourceResponseHash);
    expect(result.interpretationHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
    expect(groundingProjectionPort.projectGrounding).toHaveBeenCalledTimes(1);
  });

  it('joins owner-authorized Official Reading to a real bounded Saju HTTP transport and Reader HTTP scene', async () => {
    const authority = authorities();
    const bundle = previewGrounding();
    const httpFetch = vi.fn(async (
      _url: string,
      _init: SajuProductionCalculationHttpRequestInitV1,
    ) => ({
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        [SAJU_CHARACTER_GROUNDING_ADMISSION_HEADER_V1]:
          SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1,
      }),
      body: null,
      text: async () => JSON.stringify(bundle),
    }));
    const resolveContext = vi.fn(async () => ({
      relationshipProjectionPolicy: serverContextInput().relationshipProjectionPolicy,
    }));

    const response = await runReaderInterpretationPreviewHttpV1({
      resolvedSubjectId: SUBJECT_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z',
      body: { threadId: THREAD_ID, officialReadingId: READING_ID },
      contextAuthorityPort: { resolveContext },
      contentReleaseRuntime: compatibleReceiveRuntime(),
      ...authority,
      groundingProjectionPort: createSajuCharacterGroundingHttpAdapterV1({
        baseUrl: 'https://saju.example',
        bearerToken: 'synthetic-test-only-bearer',
        fetchImpl: httpFetch,
      }),
    });

    expect(response.lifecycle).toBe('preview');
    expect(response.readerCharacterId).toBe('baekheon');
    expect(response.officialReadingId).toBe(READING_ID);
    expect(response.interpretationHash).toBeTruthy();
    expect(httpFetch).toHaveBeenCalledTimes(1);
    expect(httpFetch.mock.calls[0]?.[0]).toBe('https://saju.example/api/character-grounding');
    const outbound = httpFetch.mock.calls[0]![1];
    expect(outbound.method).toBe('POST');
    expect(outbound.redirect).toBe('manual');
    expect(outbound.headers.authorization).toBe('Bearer synthetic-test-only-bearer');
    expect(JSON.parse(outbound.body)).toEqual({
      response: expect.objectContaining({
        responseVersion: 'myeonghwa-product-reading-response-v2',
        state: 'delivered',
      }),
      engineVersion: 'saju-engine-v1',
      readingDomain: 'career',
    });
    expect(outbound.body).not.toContain(SUBJECT_ID);
    expect(outbound.body).not.toContain('baekheon');
    expect(response).not.toHaveProperty('groundingHash');
    expect(response).not.toHaveProperty('sourceResponseHash');
    expect(response).not.toHaveProperty('responseSnapshotJsonb');
  });

  it('blocks revoked Reader access before dispatching a Saju grounding HTTP request', async () => {
    const authority = authorities();
    authority.accessAuthorityPort.readAccessibleReadings = vi.fn(async () => []);
    const httpFetch = vi.fn();
    await expect(runReaderInterpretationPreviewHttpV1({
      resolvedSubjectId: SUBJECT_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z',
      body: { threadId: THREAD_ID, officialReadingId: READING_ID },
      contextAuthorityPort: {
        resolveContext: vi.fn(async () => ({
          relationshipProjectionPolicy: serverContextInput().relationshipProjectionPolicy,
        })),
      },
      contentReleaseRuntime: compatibleReceiveRuntime(),
      ...authority,
      groundingProjectionPort: createSajuCharacterGroundingHttpAdapterV1({
        baseUrl: 'https://saju.example',
        bearerToken: 'synthetic-test-only-bearer',
        fetchImpl: httpFetch,
      }),
    })).rejects.toThrow();

    expect(httpFetch).not.toHaveBeenCalled();
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied same-id Character profile authority before Preview grounding', async () => {
    const authority = authorities();
    const groundingProjectionPort = {
      projectGrounding: vi.fn(async () => previewGrounding()),
    };
    const forgedContext = {
      ...serverContextInput(),
      character: {
        ...authoredCharacter('baekheon'),
        sajuProfile: {
          ...authoredCharacter('baekheon').sajuProfile!,
          attentionAxes: ['short_term_signal'],
        },
      },
      contentBundleId: BUNDLE_ID,
      relationshipState: {
        closeness: 999,
        trust: 999,
        friction: 0,
        stage: 'caller-forged',
        revision: 999,
        policyVersion: 'caller-forged',
      },
      grantedMemories: [{
        memoryItemId: 'caller-memory',
        memoryType: 'caller-memory',
        schemaVersion: 'v1',
        content: { forged: true },
        grantId: 'caller-grant',
        granteeCharacterId: 'baekheon',
      }],
    } as unknown as CharacterStandardReadingChatTurnServerContextInputV1;

    await expect(
      runThreadBoundReaderInterpretationPreviewV1({
        resolvedSubjectId: SUBJECT_ID,
        threadId: THREAD_ID,
        officialReadingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contentReleaseRuntime: compatibleReceiveRuntime(),
        contextInput: forgedContext,
        groundingProjectionPort,
      }),
    ).rejects.toMatchObject({
      code: 'AUTHORITY_CONFLICT',
    });

    expect(groundingProjectionPort.projectGrounding).not.toHaveBeenCalled();
    expect(authority.relationshipAuthorityPort.readCurrentRelationship).not.toHaveBeenCalled();
    expect(authority.memoryItemsAuthorityPort.readCurrentItems).not.toHaveBeenCalled();
  });

  it('rejects Preview when exact Reader access bundle differs from the pinned release', async () => {
    const authority = authorities(
      ['baekheon'],
      '99999999-9999-4999-8999-999999999999',
    );
    const groundingProjectionPort = {
      projectGrounding: vi.fn(async () => previewGrounding()),
    };

    await expect(
      runThreadBoundReaderInterpretationPreviewV1({
        resolvedSubjectId: SUBJECT_ID,
        threadId: THREAD_ID,
        officialReadingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contentReleaseRuntime: compatibleReceiveRuntime(),
        contextInput: serverContextInput(),
        groundingProjectionPort,
      }),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });

    expect(groundingProjectionPort.projectGrounding).not.toHaveBeenCalled();
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects revoked Reader access on the hardened Preview path before grounding', async () => {
    const authority = authorities();
    authority.accessAuthorityPort.readAccessibleReadings = vi.fn(async () => []);
    const groundingProjectionPort = {
      projectGrounding: vi.fn(async () => previewGrounding()),
    };

    await expect(
      runThreadBoundReaderInterpretationPreviewV1({
        resolvedSubjectId: SUBJECT_ID,
        threadId: THREAD_ID,
        officialReadingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contentReleaseRuntime: compatibleReceiveRuntime(),
        contextInput: serverContextInput(),
        groundingProjectionPort,
      }),
    ).rejects.toThrow();

    expect(groundingProjectionPort.projectGrounding).not.toHaveBeenCalled();
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects thread-valid context when exact Reader access points at another content bundle', async () => {
    const authority = authorities(
      ['baekheon'],
      '99999999-9999-4999-8999-999999999999',
    );

    await expect(
      prepareCharacterStandardReadingThreadRuntimeV1({
        resolvedSubjectId: SUBJECT_ID,
        threadId: THREAD_ID,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contextInput: contextInput(),
      }),
    ).rejects.toThrow(/content bundle does not match/u);
  });

  it('rejects a stale/different content bundle before Official Reading lookup', async () => {
    const authority = authorities();

    await expect(
      prepareCharacterStandardReadingThreadRuntimeV1({
        resolvedSubjectId: SUBJECT_ID,
        threadId: THREAD_ID,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:01:00.000Z',
        ...authority,
        contextInput: contextInput(
          'baekheon',
          '99999999-9999-4999-8999-999999999999',
        ),
      }),
    ).rejects.toThrow(/bundle does not match the active thread bundle/u);

    expect(authority.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
  });
});

describe('Official Reading Reader Chat turn preflight', () => {
  it('denies Product HOLD before reading the raw Official artifact or Saju', async () => {
    const authority = {
      ...authorities(),
      productReaderEligibilityAuthorityPort: {
        readApprovedRule: vi.fn(async () => ({
          status: 'withheld' as const, reason: 'unclassified' as const,
        })),
      },
    };
    await expect(prepareCharacterStandardReadingChatTurnPreflightV1({
      resolvedSubjectId: SUBJECT_ID,
      receivePlan: existingThreadReceivePlan(),
      readingId: READING_ID,
      effectiveAt: '2026-09-21T00:02:00.000Z',
      ...authority,
      contextInput: serverContextInput(),
    })).rejects.toBeInstanceOf(CharacterStandardReadingChatTurnPreflightErrorV1);
    expect(authority.accessAuthorityPort.readAccessibleReadings).toHaveBeenCalledTimes(1);
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
    expect(authority.relationshipAuthorityPort.readCurrentRelationship).not.toHaveBeenCalled();
  });


  it('joins a server-minted receive plan to a fresh thread-bound Official Reading runtime without generation or commit', async () => {
    const authority = authorities();
    const receivePlan = existingThreadReceivePlan();
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const result = await prepareCharacterStandardReadingChatTurnPreflightV1({
        resolvedSubjectId: SUBJECT_ID,
        receivePlan,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:02:00.000Z',
        ...authority,
        contextInput: serverContextInput(),
      });

      expect(result.receivePlan).toBe(receivePlan);
      expect(result.runtime.threadBinding.threadId).toBe(THREAD_ID);
      expect(result.runtime.threadBinding.activeContentReleaseId).toBe(RELEASE_ID);
      expect(result.runtime.threadBinding.activeContentBundleId).toBe(BUNDLE_ID);
      expect(result.runtime.source.readerCharacterId).toBe('baekheon');
      expect(result.runtime.context.saju?.readingRef).toBe(READING_ID);
      expect(result.runtime.context.relationship.relationshipRevision).toBe(7);
      expect(result.runtime.context.relationship.stageKey).toBe('familiar');
      expect(result.runtime.context.lifeFacts).toEqual([{
        factId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
        factType: 'occupation',
        schemaVersion: 'life-fact-v1',
        value: { value: 'designer' },
        grantId: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        granteeCharacterId: 'baekheon',
      }]);
      expect(authority.nonMemoryContextAuthorityPort.readGrantedLifeFacts).toHaveBeenCalledWith({
        subjectId: SUBJECT_ID,
        characterId: 'baekheon',
      });
      expect(result.runtime.context.memories).toEqual([{
        memoryItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        memoryType: 'reader_memory',
        schemaVersion: 'v1',
        content: { summary: '사용자가 직업 선택을 고민하고 있다고 말했다.' },
        grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        granteeCharacterId: 'baekheon',
      }]);
      expect(authority.relationshipAuthorityPort.readCurrentRelationship).toHaveBeenCalledWith({
        subjectId: SUBJECT_ID,
        characterId: 'baekheon',
      });
      expect(result.runtime.context.saju?.protectedSegments.map((segment) => segment.text)).toEqual([
        '서버가 다시 읽은 공식 직업 Reading입니다.',
      ]);
    } finally {
      if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('rejects a structural receive-plan lookalike before any Reader Knowledge authority lookup', async () => {
    const authority = authorities();
    const genuinePlan = existingThreadReceivePlan();
    const forgedPlan = Object.freeze({
      ...genuinePlan,
      resolvedContent: Object.freeze({ ...genuinePlan.resolvedContent }),
    });

    await expect(
      prepareCharacterStandardReadingChatTurnPreflightV1({
        resolvedSubjectId: SUBJECT_ID,
        receivePlan: forgedPlan,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:02:00.000Z',
        ...authority,
        contextInput: serverContextInput(),
      }),
    ).rejects.toThrow(/not minted by server receive authority/u);

    expect(authority.threadBindingAuthorityPort.readRuntimeBinding).not.toHaveBeenCalled();
    expect(authority.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied Character/world/relationship authority before thread or Reader Knowledge lookup', async () => {
    const authority = authorities();
    const receivePlan = existingThreadReceivePlan();
    const forgedContext = {
      ...serverContextInput(),
      character: authoredCharacter('seyeon'),
      contentBundleId: 'caller-bundle',
      worldRelations: [],
      relationshipState: {
        closeness: 999,
        trust: 999,
        friction: 0,
        stage: 'caller-forged',
        revision: 999,
        policyVersion: 'caller-forged',
      },
    } as unknown as CharacterStandardReadingChatTurnServerContextInputV1;

    await expect(
      prepareCharacterStandardReadingChatTurnPreflightV1({
        resolvedSubjectId: SUBJECT_ID,
        receivePlan,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:02:00.000Z',
        ...authority,
        contextInput: forgedContext,
      }),
    ).rejects.toThrow(/does not accept caller-supplied character authority/u);

    expect(authority.threadBindingAuthorityPort.readRuntimeBinding).not.toHaveBeenCalled();
    expect(authority.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('fails closed when no stored current relationship projection exists', async () => {
    const authority = authorities();
    authority.relationshipAuthorityPort.readCurrentRelationship = vi.fn(async () => []);
    const receivePlan = existingThreadReceivePlan();

    await expect(
      prepareCharacterStandardReadingChatTurnPreflightV1({
        resolvedSubjectId: SUBJECT_ID,
        receivePlan,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:02:00.000Z',
        ...authority,
        contextInput: serverContextInput(),
      }),
    ).rejects.toThrow(/requires a stored current relationship projection/u);

    // A2 verifies the exact Reader Grant and Product rule before the
    // downstream relationship/memory authority is resolved.
    expect(authority.accessAuthorityPort.readAccessibleReadings).toHaveBeenCalledTimes(1);
    expect(authority.artifactAuthorityPort.readArtifactSource).toHaveBeenCalledTimes(1);
  });

  it('rejects caller-supplied granted Memory context before authority lookup', async () => {
    const authority = authorities();
    const receivePlan = existingThreadReceivePlan();
    const forgedContext = {
      ...serverContextInput(),
      grantedMemories: [{
        memoryItemId: 'caller-memory',
        memoryType: 'caller-memory',
        schemaVersion: 'v1',
        content: { forged: true },
        grantId: 'caller-grant',
        granteeCharacterId: 'baekheon',
      }],
    } as unknown as CharacterStandardReadingChatTurnServerContextInputV1;

    await expect(
      prepareCharacterStandardReadingChatTurnPreflightV1({
        resolvedSubjectId: SUBJECT_ID,
        receivePlan,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:02:00.000Z',
        ...authority,
        contextInput: forgedContext,
      }),
    ).rejects.toThrow(/does not accept caller-supplied grantedMemories authority/u);

    expect(authority.memoryItemsAuthorityPort.readCurrentItems).not.toHaveBeenCalled();
    expect(authority.memoryGrantsAuthorityPort.readActiveGrants).not.toHaveBeenCalled();
  });

  it('fails closed when Memory authority returns duplicate active grants for the same Reader', async () => {
    const authority = authorities();
    authority.memoryGrantsAuthorityPort.readActiveGrants = vi.fn(async () => [
      {
        grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        characterId: 'baekheon',
        grantReason: 'user_explicit',
        grantedAt: '2026-09-21T00:01:25.000Z',
      },
      {
        grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
        characterId: 'baekheon',
        grantReason: 'user_explicit',
        grantedAt: '2026-09-21T00:01:26.000Z',
      },
    ]);
    const receivePlan = existingThreadReceivePlan();

    await expect(
      prepareCharacterStandardReadingChatTurnPreflightV1({
        resolvedSubjectId: SUBJECT_ID,
        receivePlan,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:02:00.000Z',
        ...authority,
        contextInput: serverContextInput(),
      }),
    ).rejects.toThrow(/multiple active grants for the current Reader/u);

    // A2 verifies the exact Reader Grant and Product rule before the
    // downstream relationship/memory authority is resolved.
    expect(authority.accessAuthorityPort.readAccessibleReadings).toHaveBeenCalledTimes(1);
    expect(authority.artifactAuthorityPort.readArtifactSource).toHaveBeenCalledTimes(1);
  });

  it('rejects a receive plan whose release no longer matches the freshly reread owned thread', async () => {
    const authority = authorities();
    const receivePlan = existingThreadReceivePlan(
      '99999999-9999-4999-8999-999999999999',
      BUNDLE_ID,
    );

    await expect(
      prepareCharacterStandardReadingChatTurnPreflightV1({
        resolvedSubjectId: SUBJECT_ID,
        receivePlan,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:02:00.000Z',
        ...authority,
        contextInput: serverContextInput(),
      }),
    ).rejects.toBeInstanceOf(CharacterStandardReadingChatTurnPreflightErrorV1);
  });

  it('rejects a new-thread receive plan because Reader follow-up must stay bound to an owned existing thread', async () => {
    const authority = authorities();
    const receivePlan = prepareChatReceiveCommand({
      request: {
        clientTurnId: 'turn-reader-follow-up-new',
        text: '이 해석을 이어서 이야기해 주세요.',
        clientCapability: 'source-authorized-test-capability',
      },
      releaseRuntime: compatibleReceiveRuntime(),
      orderedReleaseIdsForNewThread: [RELEASE_ID],
    });

    await expect(
      prepareCharacterStandardReadingChatTurnPreflightV1({
        resolvedSubjectId: SUBJECT_ID,
        receivePlan,
        readingId: READING_ID,
        effectiveAt: '2026-09-21T00:02:00.000Z',
        ...authority,
        contextInput: serverContextInput(),
      }),
    ).rejects.toThrow(/requires an existing server-bound thread/u);

    expect(authority.threadBindingAuthorityPort.readRuntimeBinding).not.toHaveBeenCalled();
  });
});


describe('A3-gamma server-only Thread-bound official standard V2 Preview (public OFF)', () => {
  function nonspecialistReleaseRuntime(): ContentReleaseRuntime {
    const original = compatibleReceiveRuntime();
    const pinned = original.resolvePinned(RELEASE_ID);
    const released = {
      ...pinned,
      characters: {
        ...pinned.characters,
        characters: [{
          ...authoredCharacter('baekheon'),
          capabilities: [],
        }],
      },
    } as ContentReleaseRuntimeEntry;
    return {
      ...original,
      resolvePinned: vi.fn(() => released),
    } as unknown as ContentReleaseRuntime;
  }

  it('uses exact A2/A3 standard rule with zero Character specialist capabilities', async () => {
    const authority = authorities();
    const bundle = previewGrounding();
    const projectGrounding = vi.fn(async () => bundle);
    const result = await runThreadBoundReaderInterpretationPreviewV2({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      officialReadingId: READING_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z',
      ...authority,
      contentReleaseRuntime: nonspecialistReleaseRuntime(),
      contextInput: serverContextInput(),
      groundingProjectionPort: { projectGrounding },
    });
    expect(result.readerCharacterId).toBe('baekheon');
    expect(result.readerContentBundleId).toBe(BUNDLE_ID);
    expect(result.officialReadingId).toBe(READING_ID);
    expect(result.sourceResponseHash).toBe(bundle.sourceResponseHash);
    expect(projectGrounding).toHaveBeenCalledTimes(1);
    expect(authority.productReaderEligibilityAuthorityPort.readApprovedRule).toHaveBeenCalled();
  });

  it('refuses a premium Product rule before Saju grounding, even for a known Reader', async () => {
    const authority = authorities();
    authority.productReaderEligibilityAuthorityPort.readApprovedRule.mockResolvedValue({
      status: 'approved',
      rule: {
        kind: 'premium_restricted',
        productId: PRODUCT_ID,
        productSpecVersion: 'standard-reading-v1',
        sajuDomain: 'career',
        allowedReaderIds: ['baekheon'],
        ruleVersion: 'synthetic-premium-policy-v1',
        approvedPolicyRevision: 'synthetic-premium-revision-v1',
      },
    } as never);
    const projectGrounding = vi.fn(async () => previewGrounding());
    await expect(runThreadBoundReaderInterpretationPreviewV2({
      resolvedSubjectId: SUBJECT_ID, threadId: THREAD_ID, officialReadingId: READING_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z', ...authority,
      contentReleaseRuntime: nonspecialistReleaseRuntime(),
      contextInput: serverContextInput(), groundingProjectionPort: { projectGrounding },
    })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(projectGrounding).not.toHaveBeenCalled();
  });

  it('blocks revoked Reader access on A2 recheck before Saju grounding', async () => {
    const authority = authorities();
    const initialAccess = await authority.accessAuthorityPort.readAccessibleReadings({
      subjectId: SUBJECT_ID, readingId: READING_ID, readerCharacterId: 'baekheon',
    } as never);
    let accessReads = 0;
    authority.accessAuthorityPort.readAccessibleReadings = vi.fn(async () => {
      accessReads += 1;
      return accessReads === 1 ? initialAccess : [];
    });
    const projectGrounding = vi.fn(async () => previewGrounding());
    await expect(runThreadBoundReaderInterpretationPreviewV2({
      resolvedSubjectId: SUBJECT_ID, threadId: THREAD_ID, officialReadingId: READING_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z', ...authority,
      contentReleaseRuntime: nonspecialistReleaseRuntime(),
      contextInput: serverContextInput(), groundingProjectionPort: { projectGrounding },
    })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(accessReads).toBeGreaterThanOrEqual(2);
    expect(projectGrounding).not.toHaveBeenCalled();
  });

  it('blocks a withheld Product rule before Saju grounding', async () => {
    const authority = authorities();
    authority.productReaderEligibilityAuthorityPort.readApprovedRule.mockResolvedValue({
      status: 'withheld', reason: 'unclassified',
    } as never);
    const projectGrounding = vi.fn(async () => previewGrounding());
    await expect(runThreadBoundReaderInterpretationPreviewV2({
      resolvedSubjectId: SUBJECT_ID, threadId: THREAD_ID, officialReadingId: READING_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z', ...authority,
      contentReleaseRuntime: nonspecialistReleaseRuntime(),
      contextInput: serverContextInput(),
      groundingProjectionPort: { projectGrounding },
    })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(projectGrounding).not.toHaveBeenCalled();
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects forged caller Saju and content authority before requesting grounding', async () => {
    const authority = authorities();
    const projectGrounding = vi.fn(async () => previewGrounding());
    await expect(runThreadBoundReaderInterpretationPreviewV2({
      resolvedSubjectId: SUBJECT_ID, threadId: THREAD_ID, officialReadingId: READING_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z', ...authority,
      contentReleaseRuntime: nonspecialistReleaseRuntime(),
      contextInput: {
        ...serverContextInput(),
        saju: { readingRef: READING_ID },
      } as CharacterStandardReadingChatTurnServerContextInputV1,
      groundingProjectionPort: { projectGrounding },
    })).rejects.toThrow(/caller-supplied saju authority/u);
    expect(projectGrounding).not.toHaveBeenCalled();
  });

  it('rejects revision drift between A2 proof and freshly re-read Thread before Saju', async () => {
    const authority = authorities();
    let reads = 0;
    authority.threadBindingAuthorityPort.readRuntimeBinding = vi.fn(async () => {
      reads += 1;
      return [{
        threadId: THREAD_ID, status: 'active',
        activeContentReleaseId: RELEASE_ID, activeContentBundleId: BUNDLE_ID,
        contentRevision: reads < 5 ? 4 : 5,
        participantCharacterIds: ['baekheon'],
      }];
    });
    const projectGrounding = vi.fn(async () => previewGrounding());
    await expect(runThreadBoundReaderInterpretationPreviewV2({
      resolvedSubjectId: SUBJECT_ID, threadId: THREAD_ID, officialReadingId: READING_ID,
      effectiveAt: '2026-09-21T00:01:00.000Z', ...authority,
      contentReleaseRuntime: nonspecialistReleaseRuntime(),
      contextInput: serverContextInput(),
      groundingProjectionPort: { projectGrounding },
    })).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
    expect(projectGrounding).not.toHaveBeenCalled();
  });
});


describe('A3-epsilon server-only Official Standard Reader Chat V2 preflight (public OFF)', () => {
  function nonspecialistReceivePlan() {
    const runtime = compatibleReceiveRuntime();
    const original = runtime.resolvePinned(RELEASE_ID);
    const noSpecialistCapabilities = {
      ...original,
      characters: {
        ...original.characters,
        characters: [{
          ...authoredCharacter('baekheon'),
          capabilities: [],
        }],
      },
    } as ContentReleaseRuntimeEntry;
    const nonSpecialist = {
      ...runtime,
      assertPinnedClientCompatible: vi.fn(() => noSpecialistCapabilities),
    } as unknown as ContentReleaseRuntime;
    return prepareChatReceiveCommand({
      request: {
        threadId: THREAD_ID,
        clientTurnId: 'turn-standard-v2-follow-up',
        text: '방금 공식 직업 사주에 관해 더 설명해주세요.',
        clientCapability: 'source-authorized-test-capability',
      },
      releaseRuntime: nonSpecialist,
      trustedThread: {
        threadId: THREAD_ID,
        pinnedReleaseId: RELEASE_ID,
        participantCharacterIds: ['baekheon'],
      },
    });
  }

  function input() {
    const authority = authorities();
    return {
      ...authority,
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      effectiveAt: '2026-09-21T00:02:00.000Z',
      receivePlan: nonspecialistReceivePlan(),
      contextInput: serverContextInput(),
    };
  }

  it('assembles a source-bound V2 standard context with zero specialist capabilities', async () => {
    const args = input();
    const result = await prepareCharacterStandardReadingChatTurnPreflightV2(args);
    expect(result.receivePlan).toBe(args.receivePlan);
    expect(result.threadBinding.contentRevision).toBe(4);
    expect(result.scope.subjectId).toBe(SUBJECT_ID);
    expect(result.scope.threadId).toBe(THREAD_ID);
    expect(result.scope.readingId).toBe(READING_ID);
    expect(result.runtime.schemaVersion).toBe('v2');
    expect(result.runtime.characterId).toBe('baekheon');
    expect(result.runtime.saju.readingRef).toBe(READING_ID);
    expect(result.runtime.saju.domain).toBe('career');
    expect(result.runtime.saju.eligibility.source).toBe('official_standard_product_rule');
    expect(result.runtime.saju.eligibility.readerCharacterId).toBe('baekheon');
    expect(result.runtime.saju).not.toHaveProperty('capability');
    expect(result.runtime.saju.protectedSegments.map((segment) => segment.text)).toEqual([
      '서버가 다시 읽은 공식 직업 Reading입니다.',
    ]);
    expect(result.runtime.memories.map((memory) => memory.granteeCharacterId)).toEqual(['baekheon']);
    expect(args.accessAuthorityPort.readAccessibleReadings).toHaveBeenCalledTimes(2);
    expect(args.artifactAuthorityPort.readArtifactSource).toHaveBeenCalledTimes(2);
    expect(args.productReaderEligibilityAuthorityPort.readApprovedRule).toHaveBeenCalledTimes(3);
  });

  it('rejects missing approved Product authority before raw Official Reading access', async () => {
    const args = input();
    const { productReaderEligibilityAuthorityPort: _missing, ...withoutPolicy } = args;
    await expect(prepareCharacterStandardReadingChatTurnPreflightV2(withoutPolicy))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(args.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
    expect(args.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects a cloned receive plan before accessing a Reading', async () => {
    const args = input();
    await expect(prepareCharacterStandardReadingChatTurnPreflightV2({
      ...args,
      receivePlan: Object.freeze({ ...args.receivePlan }),
    })).rejects.toThrow(/not minted by server receive authority/u);
    expect(args.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
    expect(args.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects caller Saju or Memory authority before any Reader access lookup', async () => {
    const args = input();
    await expect(prepareCharacterStandardReadingChatTurnPreflightV2({
      ...args,
      contextInput: {
        ...serverContextInput(),
        saju: { readingRef: READING_ID },
      } as CharacterStandardReadingChatTurnServerContextInputV1,
    })).rejects.toThrow(/caller-supplied saju authority/u);
    expect(args.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
    expect(args.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('fails closed on a different Reading or Subject, without releasing V2 context', async () => {
    const differentReading = input();
    await expect(prepareCharacterStandardReadingChatTurnPreflightV2({
      ...differentReading,
      readingId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    const differentSubject = input();
    await expect(prepareCharacterStandardReadingChatTurnPreflightV2({
      ...differentSubject,
      resolvedSubjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });

  it('rejects Reader access revoked between A2 reads', async () => {
    const args = input();
    const accessible = await args.accessAuthorityPort.readAccessibleReadings({
      subjectId: SUBJECT_ID, readingId: READING_ID, readerCharacterId: 'baekheon',
    } as never);
    let reads = 0;
    args.accessAuthorityPort.readAccessibleReadings = vi.fn(async () => {
      reads += 1;
      return reads === 1 ? accessible : [];
    });
    await expect(prepareCharacterStandardReadingChatTurnPreflightV2(args))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(args.artifactAuthorityPort.readArtifactSource).toHaveBeenCalledTimes(1);
  });

  it('rejects a Product rule reclassified as premium immediately before A3 issuance', async () => {
    const args = input();
    let reads = 0;
    args.productReaderEligibilityAuthorityPort.readApprovedRule = vi.fn(async () => {
      reads += 1;
      return {
        status: 'approved' as const,
        rule: {
          kind: reads < 3 ? 'standard_all_readers' as const : 'premium_restricted' as const,
          productId: PRODUCT_ID,
          productSpecVersion: 'standard-reading-v1',
          sajuDomain: 'career' as const,
          ruleVersion: 'synthetic-test-reader-policy-v1',
          approvedPolicyRevision: 'synthetic-test-revision-v1',
          ...(reads < 3 ? {} : { allowedReaderIds: ['baekheon'] }),
        },
      };
    }) as never;
    await expect(prepareCharacterStandardReadingChatTurnPreflightV2(args))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(reads).toBe(3);
  });

  it('fails closed on Release mismatch before access or Content composition', async () => {
    const args = input();
    const mismatch = existingThreadReceivePlan(
      '99999999-9999-4999-8999-999999999999', BUNDLE_ID,
    );
    await expect(prepareCharacterStandardReadingChatTurnPreflightV2({
      ...args, receivePlan: mismatch,
    })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(args.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects Thread revision drift during non-Saju context assembly', async () => {
    const args = input();
    let reads = 0;
    args.threadBindingAuthorityPort.readRuntimeBinding = vi.fn(async () => {
      reads += 1;
      return [{
        threadId: THREAD_ID, status: 'active',
        activeContentReleaseId: RELEASE_ID, activeContentBundleId: BUNDLE_ID,
        contentRevision: reads <= 3 ? 4 : 5,
        participantCharacterIds: ['baekheon'],
      }];
    });
    await expect(prepareCharacterStandardReadingChatTurnPreflightV2(args))
      .rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
    expect(reads).toBeGreaterThanOrEqual(4);
  });
});


describe('A3-zeta / PR 2-A server-only Chat Grounding V2 admission (public OFF)', () => {
  async function setup() {
    const authority = authorities();
    const receivePlan = existingThreadReceivePlan();
    const preflight = await prepareCharacterStandardReadingChatTurnPreflightV2({
      resolvedSubjectId: SUBJECT_ID,
      receivePlan,
      readingId: READING_ID,
      effectiveAt: '2026-09-21T00:02:00.000Z',
      ...authority,
      contextInput: serverContextInput(),
    });
    const projectGrounding = vi.fn(async () => previewGrounding());
    return { authority, preflight, projectGrounding };
  }

  function input(f: Awaited<ReturnType<typeof setup>>) {
    return {
      preflight: f.preflight,
      threadBindingAuthorityPort: f.authority.threadBindingAuthorityPort,
      accessAuthorityPort: f.authority.accessAuthorityPort,
      artifactAuthorityPort: f.authority.artifactAuthorityPort,
      productReaderEligibilityAuthorityPort: f.authority.productReaderEligibilityAuthorityPort,
      groundingProjectionPort: { projectGrounding: f.projectGrounding },
    };
  }

  it('adopts Saju-owned source-attested grounding only after fresh A2/A3 checks on both sides', async () => {
    const f = await setup();
    const result = await prepareCharacterStandardChatGroundingV2(input(f));
    expect(result.scope.subjectId).toBe(SUBJECT_ID);
    expect(result.scope.readingId).toBe(READING_ID);
    expect(result.context.schemaVersion).toBe('v2');
    expect(result.context.characterId).toBe('baekheon');
    expect(result.context.saju).not.toHaveProperty('capability');
    expect(result.context.saju.groundingRef.readingRef).toBe(READING_ID);
    expect(result.context.saju.groundingRef.groundingHash).toBe(result.grounding.groundingHash);
    expect(result.grounding.readingDomain).toBe('career');
    expect(() => assertServerPreparedStandardChatGroundingV2(result)).not.toThrow();
    expect(() => assertServerPreparedStandardChatGroundingV2({ ...result }))
      .toThrow(/grounding is unavailable/u);
    expect(f.projectGrounding).toHaveBeenCalledTimes(1);
    expect(f.authority.accessAuthorityPort.readAccessibleReadings).toHaveBeenCalledTimes(4);
    expect(f.authority.artifactAuthorityPort.readArtifactSource).toHaveBeenCalledTimes(4);
    expect(f.authority.productReaderEligibilityAuthorityPort.readApprovedRule).toHaveBeenCalledTimes(7);
  });

  it('refuses a structural clone of the server-issued preflight before querying the raw source', async () => {
    const f = await setup();
    const port = f.authority.artifactAuthorityPort.readArtifactSource as ReturnType<typeof vi.fn>;
    port.mockClear();
    await expect(prepareCharacterStandardChatGroundingV2({
      ...input(f), preflight: { ...f.preflight },
    })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(port).not.toHaveBeenCalled();
    expect(f.projectGrounding).not.toHaveBeenCalled();
  });

  it('blocks a revoked Reader Grant before dispatching Saju Grounding projection', async () => {
    const f = await setup();
    f.authority.accessAuthorityPort.readAccessibleReadings = vi.fn(async () => []);
    await expect(prepareCharacterStandardChatGroundingV2(input(f)))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.projectGrounding).not.toHaveBeenCalled();
  });

  it('blocks a revoked Reader Grant after projection and never admits a grounded context', async () => {
    const f = await setup();
    f.projectGrounding.mockImplementationOnce(async () => {
      f.authority.accessAuthorityPort.readAccessibleReadings = vi.fn(async () => []);
      return previewGrounding();
    });
    await expect(prepareCharacterStandardChatGroundingV2(input(f)))
      .rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
    expect(f.projectGrounding).toHaveBeenCalledTimes(1);
  });

  it('rejects a premium-reclassified Product before Saju projection', async () => {
    const f = await setup();
    f.authority.productReaderEligibilityAuthorityPort.readApprovedRule.mockResolvedValue({
      status: 'approved',
      rule: {
        kind: 'premium_restricted',
        allowedReaderIds: ['baekheon'],
        productId: PRODUCT_ID,
        productSpecVersion: 'standard-reading-v1',
        sajuDomain: 'career',
        ruleVersion: 'synthetic-test-reader-policy-v1',
        approvedPolicyRevision: 'synthetic-test-revision-v1',
      },
    } as never);
    await expect(prepareCharacterStandardChatGroundingV2(input(f)))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.projectGrounding).not.toHaveBeenCalled();
  });

  it('rejects a Product reclassified while Saju service is executing', async () => {
    const f = await setup();
    f.projectGrounding.mockImplementationOnce(async () => {
      f.authority.productReaderEligibilityAuthorityPort.readApprovedRule.mockResolvedValue({
        status: 'approved',
        rule: {
          kind: 'premium_restricted',
          allowedReaderIds: ['baekheon'],
          productId: PRODUCT_ID,
          productSpecVersion: 'standard-reading-v1',
          sajuDomain: 'career',
          ruleVersion: 'synthetic-test-reader-policy-v1',
          approvedPolicyRevision: 'synthetic-test-revision-v1',
        },
      } as never);
      return previewGrounding();
    });
    await expect(prepareCharacterStandardChatGroundingV2(input(f)))
      .rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
    expect(f.projectGrounding).toHaveBeenCalledTimes(1);
  });

  it('rejects forged grounding hash and never accepts the service response as authority', async () => {
    const f = await setup();
    f.projectGrounding.mockResolvedValueOnce({
      ...previewGrounding(), groundingHash: '0'.repeat(64),
    });
    await expect(prepareCharacterStandardChatGroundingV2(input(f)))
      .rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
    expect(f.projectGrounding).toHaveBeenCalledTimes(1);
  });

  it('rejects a different Reading/domain source from the Saju service', async () => {
    const f = await setup();
    f.projectGrounding.mockResolvedValueOnce({
      ...previewGrounding(), readingRef: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });
    await expect(prepareCharacterStandardChatGroundingV2(input(f)))
      .rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
  });

  it('rejects the official source snapshot drifting while the Saju service runs', async () => {
    const f = await setup();
    let n = 0;
    const read = f.authority.artifactAuthorityPort.readArtifactSource;
    f.authority.artifactAuthorityPort.readArtifactSource = vi.fn(async (args) => {
      n++;
      const rows = await read(args);
      return n > 1
        ? rows.map(row => ({ ...row, completedAt: '2026-10-10T01:00:00.000Z' }))
        : rows;
    });
    await expect(prepareCharacterStandardChatGroundingV2(input(f)))
      .rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
    expect(f.projectGrounding).toHaveBeenCalledTimes(1);
  });

  it('fails closed when Saju projection cannot respond', async () => {
    const f = await setup();
    f.projectGrounding.mockRejectedValueOnce(new Error('synthetic transport failure'));
    await expect(prepareCharacterStandardChatGroundingV2(input(f)))
      .rejects.toMatchObject({ code: 'GROUNDING_UNAVAILABLE' });
  });
});


describe('A3-eta server-anchored follow-up evidence selection (public OFF)', () => {
  async function setup(bundle = previewGrounding()) {
    const authority = authorities();
    const preflight = await prepareCharacterStandardReadingChatTurnPreflightV2({
      resolvedSubjectId: SUBJECT_ID, receivePlan: existingThreadReceivePlan(),
      readingId: READING_ID, effectiveAt: '2026-09-21T00:02:00.000Z',
      ...authority, contextInput: serverContextInput(),
    });
    const grounded = await prepareCharacterStandardChatGroundingV2({
      preflight, threadBindingAuthorityPort: authority.threadBindingAuthorityPort,
      accessAuthorityPort: authority.accessAuthorityPort,
      artifactAuthorityPort: authority.artifactAuthorityPort,
      productReaderEligibilityAuthorityPort: authority.productReaderEligibilityAuthorityPort,
      groundingProjectionPort: { projectGrounding: vi.fn(async () => bundle) },
    });
    const ids = grounded.grounding.units.map(unit => unit.unitId);
    const anchor = {
      status: 'committed_semantic_guard_pass' as const,
      subjectId: SUBJECT_ID, threadId: THREAD_ID,
      readerCharacterId: 'baekheon', readingRef: READING_ID,
      officialArtifactResponseHash: grounded.scope.officialArtifactResponseHash,
      groundingHash: grounded.grounding.groundingHash,
      assistantMessageId: 'synthetic-validated-assistant-turn',
      sourceUnitRefs: [ids[0]!],
    };
    const readLatestValidatedAnchor = vi.fn(async () => anchor);
    return { ids, anchor, readLatestValidatedAnchor, input: {
      preflight, grounded, anchorAuthorityPort: { readLatestValidatedAnchor },
    } };
  }

  it('uses exactly a persisted validated Unit, never arbitrary user text or all Reading units', async () => {
    const f = await setup();
    const result = await selectCharacterStandardFollowupEvidenceV1(f.input);
    expect(result.mode).toBe('grounded_selection');
    if (result.mode !== 'grounded_selection') throw new Error('no validated unit');
    expect(result.selectedUnitIds).toEqual([f.ids[0]]);
    expect(result.selectionHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
    expect(f.readLatestValidatedAnchor).toHaveBeenCalledWith({
      subjectId: SUBJECT_ID, threadId: THREAD_ID,
      readerCharacterId: 'baekheon', readingRef: READING_ID,
    });
  });

  it('requires clarification when no validated prior answer is present', async () => {
    const f = await setup();
    f.readLatestValidatedAnchor.mockResolvedValueOnce(null as never);
    await expect(selectCharacterStandardFollowupEvidenceV1(f.input))
      .resolves.toMatchObject({ mode: 'hold', reason: 'clarification_required' });
  });

  it('requires explicit server-verified focus for a multi-unit prior answer', async () => {
    const f = await setup();
    f.readLatestValidatedAnchor.mockResolvedValueOnce({
      ...f.anchor, sourceUnitRefs: [f.ids[0]!, f.ids[1]!],
    } as never);
    await expect(selectCharacterStandardFollowupEvidenceV1(f.input))
      .resolves.toMatchObject({ mode: 'hold', reason: 'clarification_required' });
    f.readLatestValidatedAnchor.mockResolvedValueOnce({
      ...f.anchor, sourceUnitRefs: [f.ids[0]!, f.ids[1]!],
      focusedUnitRef: f.ids[1]!,
    } as never);
    const selected = await selectCharacterStandardFollowupEvidenceV1(f.input);
    expect(selected.mode).toBe('grounded_selection');
    if (selected.mode !== 'grounded_selection') throw new Error('no focus');
    expect(selected.selectedUnitIds).toEqual([f.ids[1]]);
  });

  it('blocks cross-Subject / cross-Reading evidence and hallucinated Unit identifiers', async () => {
    const f = await setup();
    f.readLatestValidatedAnchor.mockResolvedValueOnce({
      ...f.anchor, subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    } as never);
    await expect(selectCharacterStandardFollowupEvidenceV1(f.input))
      .rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
    f.readLatestValidatedAnchor.mockResolvedValueOnce({
      ...f.anchor, sourceUnitRefs: ['unknown-source-unit'],
    });
    await expect(selectCharacterStandardFollowupEvidenceV1(f.input))
      .rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
  });

  it('refuses forged grounded results before reading the validated assistant anchor', async () => {
    const f = await setup();
    await expect(selectCharacterStandardFollowupEvidenceV1({
      ...f.input, grounded: { ...f.input.grounded },
    })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.readLatestValidatedAnchor).not.toHaveBeenCalled();
  });

  it('retains recursively required companions, disclosures and ambiguities', async () => {
    const original = previewGrounding();
    const ids = original.units.map(unit => unit.unitId);
    const { groundingHash: _hash, ...materialWithoutHash } = original;
    const material = {
      ...materialWithoutHash,
      units: original.units.map((unit, i) => i === 0 ? {
        ...unit, requiredCompanionUnitRefs: [ids[1]!],
        requiredDisclosureRefs: ['disclosure-followup-1'],
        ambiguityRef: 'ambiguity-followup-1',
      } : unit),
      disclosures: [{
        disclosureRef: 'disclosure-followup-1', type: 'scope_limitation' as const,
        text: '현재 공식 Reading 범위의 설명입니다.', sourceDisclosureIndex: 0,
      }],
      ambiguities: [{
        ambiguityRef: 'ambiguity-followup-1', kind: 'reading_block' as const,
        sourceRef: 'sections.0.blocks.0',
        summary: '특정 시기를 확정할 수 없습니다.',
      }],
    };
    const f = await setup({
      ...material, groundingHash: hashCharacterSajuGroundingBundleMaterialV1(material),
    });
    const result = await selectCharacterStandardFollowupEvidenceV1(f.input);
    expect(result.mode).toBe('protected_only');
    if (result.mode !== 'protected_only') throw new Error('missing protected evidence');
    expect(result.selectedUnitIds).toEqual([ids[0], ids[1]]);
    expect(result.requiredDisclosureRefs).toEqual(['disclosure-followup-1']);
    expect(result.requiredAmbiguityRefs).toEqual(['ambiguity-followup-1']);
  });

  it('rejects a focus outside prior committed source refs', async () => {
    const f = await setup();
    f.readLatestValidatedAnchor.mockResolvedValueOnce({
      ...f.anchor, focusedUnitRef: f.ids[2]!,
    } as never);
    await expect(selectCharacterStandardFollowupEvidenceV1(f.input))
      .rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
  });
});
