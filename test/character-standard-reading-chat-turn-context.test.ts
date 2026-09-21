import { describe, expect, it, vi } from 'vitest';
import type { CharacterContentDefinition } from '../packages/character-content/src/index.js';
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
  type CharacterStandardReadingChatBaseContextInputV1,
} from '../apps/api/src/index.js';
import type { ChatThreadRuntimeBindingReadAuthorityPortV1 } from '../apps/api/src/chat-thread-runtime-binding-read.js';
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
      attentionAxes: ['continuity'],
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

function authorities(participants: readonly string[] = ['baekheon']) {
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
  return {
    threadBindingAuthorityPort,
    accessAuthorityPort,
    artifactAuthorityPort,
  };
}

function compatibleReceiveRuntime(
  releaseId = RELEASE_ID,
  bundleId = BUNDLE_ID,
): ContentReleaseRuntime {
  const entry = {
    release: {
      releaseId,
      bundleId,
      contentVersion: 'reader-follow-up-test-v1',
    },
    characters: DEV_CHARACTER_CONTENT_BUNDLE,
    world: DEV_WORLD_CONTENT_BUNDLE,
    lifecycle: 'active',
  } as unknown as ContentReleaseRuntimeEntry;

  return {
    assertPinnedClientCompatible: vi.fn(() => entry),
    resolveForNewThread: vi.fn(() => entry),
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
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
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
        contextInput: contextInput(),
      });

      expect(result.receivePlan).toBe(receivePlan);
      expect(result.runtime.threadBinding.threadId).toBe(THREAD_ID);
      expect(result.runtime.threadBinding.activeContentReleaseId).toBe(RELEASE_ID);
      expect(result.runtime.threadBinding.activeContentBundleId).toBe(BUNDLE_ID);
      expect(result.runtime.source.readerCharacterId).toBe('baekheon');
      expect(result.runtime.context.saju?.readingRef).toBe(READING_ID);
      expect(result.runtime.context.saju?.protectedSegments.map((segment) => segment.text)).toEqual([
        '서버가 다시 읽은 공식 직업 Reading입니다.',
      ]);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
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
        contextInput: contextInput(),
      }),
    ).rejects.toThrow(/not minted by server receive authority/u);

    expect(authority.threadBindingAuthorityPort.readRuntimeBinding).not.toHaveBeenCalled();
    expect(authority.accessAuthorityPort.readAccessibleReadings).not.toHaveBeenCalled();
    expect(authority.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
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
        contextInput: contextInput(),
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
        contextInput: contextInput(),
      }),
    ).rejects.toThrow(/requires an existing server-bound thread/u);

    expect(authority.threadBindingAuthorityPort.readRuntimeBinding).not.toHaveBeenCalled();
  });
});

