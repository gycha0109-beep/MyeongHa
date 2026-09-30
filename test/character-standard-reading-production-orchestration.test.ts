import { describe, expect, it, vi } from 'vitest';

import type { CharacterContentDefinition } from '../packages/character-content/src/index.js';
import {
  assembleCharacterRuntimeContext,
  canonicalJson,
  type CharacterDialogueEnvelopeV1,
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
  prepareChatReceiveCommand,
} from '../apps/api/src/chat-receive.js';
import type {
  CharacterFactRegistryAuthorityRowV1,
} from '../apps/api/src/character-fact-registry-authority.js';
import type {
  CharacterPublicFactCatalogReadAuthorityPortV1,
} from '../apps/api/src/character-public-fact-catalog-authority.js';
import {
  CharacterStandardReadingProductionTurnErrorV1,
  runCharacterStandardReadingProductionTurnV1,
  type CharacterStandardReadingCommittedTurnV1,
  type CharacterStandardReadingExecutionLeaseV1,
  type CharacterStandardReadingProductionRendererPortV1,
  type CharacterStandardReadingTurnPersistenceAuthorityPortV1,
} from '../apps/api/src/character-standard-reading-production-orchestration.js';
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from '../apps/api/src/character-standard-reading-chat-turn-preflight.js';

const RELEASE_ID = '88888888-8888-4888-8888-888888888888';
const BUNDLE_ID = '77777777-7777-4777-8777-777777777777';
const THREAD_ID = '66666666-6666-4666-8666-666666666666';
const TURN_ID = '55555555-5555-4555-8555-555555555555';
const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';

function authoredCharacter(): CharacterContentDefinition {
  const base = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!;
  return {
    ...base,
    contentVersion: 'production-orchestration-test-v1',
    displayName: 'Production Orchestration Test Character',
    representativeTitle: 'production_orchestration_test',
    shortDescriptor: 'test-only authored Character',
    personalityTraits: ['observant'],
    flaws: ['overchecks boundaries'],
    values: ['truth'],
    emotionIds: ['neutral', 'serious'],
    animationCueIds: ['idle'],
    canon: {
      worldRole: 'test representative',
      origin: 'test fixture',
      apparentAgeBand: 'adult',
      callingBond: {
        authorityState: 'world_dependent',
        note: 'Principle/Calling intentionally unresolved.',
      },
      worldview: {
        coreValues: ['truth'],
        humanTheory: 'People retain agency.',
        agencyTheory: 'People choose for themselves.',
        truthTheory: 'Claims require provenance.',
      },
      psychology: {
        desire: 'Help without replacing choice.',
        fear: 'Overstepping authority.',
        flaw: 'Overchecks boundaries.',
        contradiction: 'Acts quickly but guards authority.',
        hiddenMotivation: 'Keep the interaction grounded.',
      },
    },
    persona: {
      communication: {
        register: 'measured',
        sentenceRhythm: 'short',
        verbosity: 'medium',
        humorStyle: 'dry',
        metaphorStyle: 'plain',
        profanityIntensity: 'none',
        politenessStyle: 'reserved',
      },
      cognition: {
        thinkingTempo: 'medium',
        ambiguityTolerance: 'high',
        conclusionStyle: 'evidence_first',
        contradictionSensitivity: 'high',
      },
      questioning: {
        preferredStrategies: ['chronology'],
        avoidedStrategies: ['forced_binary'],
        followUpDepth: 'medium',
      },
      emotion: {
        expressiveness: 'moderate',
        empathyStyle: 'attentive',
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
      supportPriorities: ['grounding'],
      rules: [],
    },
    sajuProfile: {
      profileVersion: 'saju-profile-v1',
      attentionAxes: ['continuity'],
      followUpQuestionStrategies: ['chronology'],
      framingStyle: 'plain',
      uncertaintyResponseStyle: 'preserve_uncertainty',
      insufficientEvidenceResponseStyle: 'state_limit',
      referralBehavior: {
        maySuggestAnotherCharacter: false,
        conditions: [],
      },
    },
    relationshipBehavior: {
      behaviorVersion: 'relationship-v1',
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
    developmentPlaceholder: undefined as never,
  };
}

function genuinePreflight(): CharacterStandardReadingChatTurnPreflightV1 {
  const character = authoredCharacter();
  const entry = {
    release: {
      releaseId: RELEASE_ID,
      bundleId: BUNDLE_ID,
      contentVersion: 'production-orchestration-test-v1',
    },
    characters: {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'production-orchestration-test-v1',
      characters: [character],
    },
    world: {
      ...DEV_WORLD_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'production-orchestration-test-v1',
      characterRelations: [],
    },
    lifecycle: 'active',
  } as unknown as ContentReleaseRuntimeEntry;

  const releaseRuntime = {
    assertPinnedClientCompatible: vi.fn(() => entry),
  } as unknown as ContentReleaseRuntime;

  const receivePlan = prepareChatReceiveCommand({
    request: {
      threadId: THREAD_ID,
      clientTurnId: 'production-orchestration-client-turn-1',
      text: '생일이 언제예요?',
      clientCapability: 'production-orchestration-test-capability',
    },
    releaseRuntime,
    trustedThread: {
      threadId: THREAD_ID,
      pinnedReleaseId: RELEASE_ID,
      participantCharacterIds: [character.characterId],
    },
  });

  const context = assembleCharacterRuntimeContext({
    character,
    contentBundleId: BUNDLE_ID,
    relationshipState: {
      closeness: 10,
      trust: 10,
      friction: 0,
      stage: 'source-unresolved-stage',
      revision: 1,
      policyVersion: 'relationship-policy-test',
    },
    recentRelationshipEventKeys: [],
    relationshipProjectionPolicy: {
      version: 'relationship-render-test',
      closeness: { lowMax: 20, mediumMax: 60 },
      trust: { lowMax: 20, mediumMax: 60 },
      friction: { lowMax: 20, mediumMax: 60 },
    },
    worldRelations: [],
    grantedLifeFacts: [],
    grantedMemories: [],
    recentMessages: [],
  });

  return {
    receivePlan,
    runtime: {
      threadBinding: {
        threadId: THREAD_ID,
        status: 'active',
        activeContentReleaseId: RELEASE_ID,
        activeContentBundleId: BUNDLE_ID,
        contentRevision: 1,
        participantCharacterIds: [character.characterId],
      },
      source: {
        readingId: 'reading-production-orchestration-test',
      },
      context,
    },
  } as unknown as CharacterStandardReadingChatTurnPreflightV1;
}

function publicFact(
  factKey: string,
  value: unknown,
): CharacterFactRegistryAuthorityRowV1 {
  const characterId = authoredCharacter().characterId;
  return {
    releaseId: RELEASE_ID,
    characterId,
    factKey,
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'PUBLIC',
    sourceSection: 'B1',
    sourceBibleDocument: 'CHARACTER_BIBLE_TEST.md',
    sourceBibleRevision: 'private-revision-test',
    value,
  };
}

class CatalogPort implements CharacterPublicFactCatalogReadAuthorityPortV1 {
  constructor(
    readonly rows: readonly CharacterFactRegistryAuthorityRowV1[],
  ) {}

  async readPublicFacts() {
    return this.rows;
  }
}

class Renderer implements CharacterStandardReadingProductionRendererPortV1 {
  readonly providerKey = 'test-provider';
  readonly modelKey = 'test-model';
  readonly calls: unknown[] = [];

  constructor(readonly output: unknown) {}

  async render(input: Parameters<CharacterStandardReadingProductionRendererPortV1['render']>[0]) {
    this.calls.push(input);
    return this.output;
  }
}

class Persistence implements CharacterStandardReadingTurnPersistenceAuthorityPortV1 {
  readonly events: string[] = [];
  readonly failures: unknown[] = [];

  constructor(
    readonly lease: CharacterStandardReadingExecutionLeaseV1 = {
      mode: 'execute',
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
    },
  ) {}

  async acquireExecution(): Promise<CharacterStandardReadingExecutionLeaseV1> {
    this.events.push('acquire');
    return this.lease;
  }

  async markContextReady(): Promise<void> {
    this.events.push('context_ready');
  }

  async commitValidatedEnvelope(input: {
    readonly turnId: string;
    readonly attemptId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
    readonly envelopeHash: string;
  }): Promise<CharacterStandardReadingCommittedTurnV1> {
    this.events.push('commit');
    return {
      turnId: input.turnId,
      attemptId: input.attemptId,
      messageId: '33333333-3333-4333-8333-333333333333',
      envelope: input.envelope,
      providerKey: input.providerKey,
      modelKey: input.modelKey,
      envelopeHash: input.envelopeHash,
    };
  }

  async markFailed(input: unknown): Promise<void> {
    this.events.push('failed');
    this.failures.push(input);
  }
}


const allowPromotion = {
  async resolvePromotion() {
    return {
      allowed: true,
      authorityVersion: 'production-promotion-test-v1',
    };
  },
} as const;

function validRendererOutput() {
  return {
    schemaVersion: 'v1',
    framingBefore: '제 생일은 3월 18일이에요.',
    emotion: 'neutral',
    memoryProposals: [],
    relationshipEventProposals: [],
    suggestedActions: [],
  };
}

describe('Standard Reading production Character turn orchestration', () => {
  it('passes only renderer-safe PUBLIC facts to provider and commits guarded output', async () => {
    const renderer = new Renderer(validRendererOutput());
    const persistence = new Persistence();
    const catalog = new CatalogPort([
      publicFact('identity.birthday', '3월 18일'),
    ]);

    const result = await runCharacterStandardReadingProductionTurnV1({
      preflight: genuinePreflight(),
      catalogAuthorityPort: catalog,
      promotionAuthorityPort: allowPromotion,
      renderer,
      persistence,
      allowedSuggestedActionKeys: [],
    });

    expect(result.status).toBe('delivered');
    if (result.status !== 'delivered') throw new Error('Expected delivered result.');
    expect(result.admittedPublicFactCount).toBe(1);
    expect(persistence.events).toEqual(['acquire', 'context_ready', 'commit']);

    const providerInput = renderer.calls[0] as {
      text: string;
      context: { publicCharacterFacts: readonly Record<string, unknown>[] };
    };
    expect(providerInput.text).toBe('생일이 언제예요?');
    expect(providerInput.context.publicCharacterFacts).toEqual([
      {
        factKey: 'identity.birthday',
        sourceAuthority: 'CANON',
        value: '3월 18일',
      },
    ]);

    const serialized = canonicalJson(providerInput);
    expect(serialized).not.toContain(RELEASE_ID);
    expect(serialized).not.toContain('CHARACTER_BIBLE_TEST.md');
    expect(serialized).not.toContain('private-revision-test');
    expect(result.committed.envelope.framingBefore).toBe(
      '제 생일은 3월 18일이에요.',
    );
  });

  it('replays committed authority without catalog lookup or provider invocation', async () => {
    const committed: CharacterStandardReadingCommittedTurnV1 = {
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      messageId: '33333333-3333-4333-8333-333333333333',
      envelope: {
        schemaVersion: 'v1',
        framingBefore: '이미 저장된 응답',
        protectedSajuSegments: [],
        protectedSajuDisclosures: [],
        calculationAmbiguity: [],
        framingAfter: null,
        emotion: 'neutral',
        animationCue: null,
        memoryProposals: [],
        relationshipEventProposals: [],
        suggestedActions: [],
      },
      providerKey: 'stored-provider',
      modelKey: 'stored-model',
      envelopeHash: 'sha256:v1:stored',
    };
    const persistence = new Persistence({
      mode: 'replay_committed',
      committed,
    });
    const renderer = new Renderer(validRendererOutput());
    const catalog = {
      readPublicFacts: vi.fn(async () => []),
    } satisfies CharacterPublicFactCatalogReadAuthorityPortV1;

    const result = await runCharacterStandardReadingProductionTurnV1({
      preflight: genuinePreflight(),
      catalogAuthorityPort: catalog,
      promotionAuthorityPort: allowPromotion,
      renderer,
      persistence,
      allowedSuggestedActionKeys: [],
    });

    expect(result).toEqual({
      status: 'replayed',
      committed,
    });
    expect(renderer.calls).toEqual([]);
    expect(catalog.readPublicFacts).not.toHaveBeenCalled();
    expect(persistence.events).toEqual(['acquire']);
  });

  it('does not commit Output Guard failures and records a final validation failure', async () => {
    const renderer = new Renderer({
      ...validRendererOutput(),
      emotion: 'not-published',
    });
    const persistence = new Persistence();

    await expect(
      runCharacterStandardReadingProductionTurnV1({
        preflight: genuinePreflight(),
        catalogAuthorityPort: new CatalogPort([]),
        promotionAuthorityPort: allowPromotion,
        renderer,
        persistence,
        allowedSuggestedActionKeys: [],
      }),
    ).rejects.toMatchObject({
      stage: 'validate',
    });

    expect(persistence.events).toEqual([
      'acquire',
      'context_ready',
      'failed',
    ]);
    expect(persistence.failures).toEqual([
      expect.objectContaining({
        stage: 'validate',
        retryable: false,
        errorCode: 'CHARACTER_STANDARD_READING_VALIDATE_FAILED',
      }),
    ]);
  });

  it('marks renderer outage retryable and never commits', async () => {
    const renderer: CharacterStandardReadingProductionRendererPortV1 = {
      providerKey: 'test-provider',
      modelKey: 'test-model',
      async render() {
        throw new Error('synthetic provider outage');
      },
    };
    const persistence = new Persistence();

    await expect(
      runCharacterStandardReadingProductionTurnV1({
        preflight: genuinePreflight(),
        catalogAuthorityPort: new CatalogPort([]),
        promotionAuthorityPort: allowPromotion,
        renderer,
        persistence,
        allowedSuggestedActionKeys: [],
      }),
    ).rejects.toBeInstanceOf(CharacterStandardReadingProductionTurnErrorV1);

    expect(persistence.events).toEqual([
      'acquire',
      'context_ready',
      'failed',
    ]);
    expect(persistence.failures).toEqual([
      expect.objectContaining({
        stage: 'render',
        retryable: true,
      }),
    ]);
  });

  it('rejects structured-action turns before allocating a production attempt', async () => {
    const base = genuinePreflight();
    const structured = {
      ...base,
      receivePlan: {
        ...base.receivePlan,
        normalizedRequest: {
          threadId: THREAD_ID,
          clientTurnId: 'structured-turn',
          structuredAction: {
            type: 'SELECT_SAJU_DOMAIN',
            domain: 'career',
          },
          clientCapability: 'production-orchestration-test-capability',
        },
      },
    } as CharacterStandardReadingChatTurnPreflightV1;
    const persistence = new Persistence();

    await expect(
      runCharacterStandardReadingProductionTurnV1({
        preflight: structured,
        catalogAuthorityPort: new CatalogPort([]),
        promotionAuthorityPort: allowPromotion,
        renderer: new Renderer(validRendererOutput()),
        persistence,
        allowedSuggestedActionKeys: [],
      }),
    ).rejects.toMatchObject({
      stage: 'receive',
    });

    expect(persistence.events).toEqual([]);
  });

  it('does not allocate execution while Standard Reading Character injection remains unpromoted', async () => {
    const persistence = new Persistence();
    const renderer = new Renderer(validRendererOutput());

    await expect(
      runCharacterStandardReadingProductionTurnV1({
        preflight: genuinePreflight(),
        catalogAuthorityPort: new CatalogPort([]),
        promotionAuthorityPort: {
          async resolvePromotion() {
            return {
              allowed: false,
              authorityVersion: 'production-hold-test-v1',
            };
          },
        },
        renderer,
        persistence,
        allowedSuggestedActionKeys: [],
      }),
    ).rejects.toMatchObject({
      stage: 'receive',
    });

    expect(persistence.events).toEqual([]);
    expect(renderer.calls).toEqual([]);
  });


  it('blocks memory or relationship side-effect proposals until persistence authority is bound', async () => {
    const renderer = new Renderer({
      ...validRendererOutput(),
      relationshipEventProposals: ['RETURN_VISIT'],
    });
    const persistence = new Persistence();

    await expect(
      runCharacterStandardReadingProductionTurnV1({
        preflight: genuinePreflight(),
        catalogAuthorityPort: new CatalogPort([]),
        promotionAuthorityPort: allowPromotion,
        renderer,
        persistence,
        allowedSuggestedActionKeys: [],
      }),
    ).rejects.toMatchObject({
      stage: 'validate',
    });

    expect(persistence.events).toEqual([
      'acquire',
      'context_ready',
      'failed',
    ]);
    expect(persistence.failures).toEqual([
      expect.objectContaining({
        stage: 'validate',
        retryable: false,
      }),
    ]);
  });


  it('rejects forged receive-plan provenance before promotion authority lookup', async () => {
    const base = genuinePreflight();
    const forged = {
      ...base,
      receivePlan: Object.freeze({
        ...base.receivePlan,
        resolvedContent: Object.freeze({
          ...base.receivePlan.resolvedContent,
        }),
      }),
    } as CharacterStandardReadingChatTurnPreflightV1;
    const promotionAuthorityPort = {
      resolvePromotion: vi.fn(async () => ({
        allowed: true,
        authorityVersion: 'must-not-be-used',
      })),
    };
    const persistence = new Persistence();

    await expect(
      runCharacterStandardReadingProductionTurnV1({
        preflight: forged,
        catalogAuthorityPort: new CatalogPort([]),
        promotionAuthorityPort,
        renderer: new Renderer(validRendererOutput()),
        persistence,
        allowedSuggestedActionKeys: [],
      }),
    ).rejects.toThrow(/not minted by server receive authority/u);

    expect(promotionAuthorityPort.resolvePromotion).not.toHaveBeenCalled();
    expect(persistence.events).toEqual([]);
  });

});
