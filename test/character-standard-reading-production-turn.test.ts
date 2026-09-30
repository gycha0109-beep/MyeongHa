import { describe, expect, it, vi } from 'vitest';

import type { CharacterRuntimeContextV1 } from '../packages/domain/src/index.js';
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
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from '../apps/api/src/character-standard-reading-chat-turn-preflight.js';
import {
  CharacterStandardReadingProductionTurnErrorV1,
  runCharacterStandardReadingProductionTurnV1,
  type CharacterProductionCommittedTurnV1,
  type CharacterProductionRendererInputV1,
  type CharacterProductionRendererPortV1,
  type CharacterProductionTurnPersistencePortV1,
} from '../apps/api/src/character-standard-reading-production-turn.js';

const RELEASE_ID = '88888888-8888-4888-8888-888888888888';
const BUNDLE_ID = '77777777-7777-4777-8777-777777777777';
const THREAD_ID = '66666666-6666-4666-8666-666666666666';
const TURN_ID = '55555555-5555-4555-8555-555555555555';
const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const CHARACTER_ID = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!.characterId;

function genuinePreflight(): CharacterStandardReadingChatTurnPreflightV1 {
  const entry = {
    release: {
      releaseId: RELEASE_ID,
      bundleId: BUNDLE_ID,
      contentVersion: 'production-turn-test-v1',
    },
    characters: {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'production-turn-test-v1',
    },
    world: {
      ...DEV_WORLD_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'production-turn-test-v1',
    },
    lifecycle: 'active',
  } as unknown as ContentReleaseRuntimeEntry;

  const releaseRuntime = {
    assertPinnedClientCompatible: vi.fn(() => entry),
  } as unknown as ContentReleaseRuntime;

  const receivePlan = prepareChatReceiveCommand({
    request: {
      threadId: THREAD_ID,
      clientTurnId: 'production-turn-client-1',
      text: '생일이 언제예요?',
      clientCapability: 'production-turn-test-capability',
    },
    releaseRuntime,
    trustedThread: {
      threadId: THREAD_ID,
      pinnedReleaseId: RELEASE_ID,
      participantCharacterIds: [CHARACTER_ID],
    },
  });

  const context = {
    schemaVersion: 'v1',
    characterId: CHARACTER_ID,
    contentBundleId: BUNDLE_ID,
    contentVersion: 'production-turn-test-v1',
    rendererPolicy: {
      allowedEmotionIds: ['neutral'],
      allowedAnimationCueIds: ['idle'],
    },
    publicCharacterFacts: Object.freeze([]),
    saju: null,
  } as unknown as CharacterRuntimeContextV1;

  return {
    receivePlan,
    runtime: {
      threadBinding: {
        threadId: THREAD_ID,
        status: 'active',
        activeContentReleaseId: RELEASE_ID,
        activeContentBundleId: BUNDLE_ID,
        contentRevision: 1,
        participantCharacterIds: [CHARACTER_ID],
      },
      source: {},
      context,
    },
  } as unknown as CharacterStandardReadingChatTurnPreflightV1;
}

function publicFact(): CharacterFactRegistryAuthorityRowV1 {
  return {
    releaseId: RELEASE_ID,
    characterId: CHARACTER_ID,
    factKey: 'identity.birthday',
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'PUBLIC',
    sourceSection: 'B1',
    sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
    sourceBibleRevision: 'private-source-revision-test',
    value: '3월 18일',
  };
}

class StaticCatalogPort implements CharacterPublicFactCatalogReadAuthorityPortV1 {
  calls = 0;

  async readPublicFacts() {
    this.calls += 1;
    return [publicFact()];
  }
}

class CapturingRenderer implements CharacterProductionRendererPortV1 {
  readonly providerKey = 'production-renderer-test';
  readonly modelKey = 'production-model-test';
  readonly calls: CharacterProductionRendererInputV1[] = [];

  constructor(readonly output: unknown) {}

  async render(input: CharacterProductionRendererInputV1): Promise<unknown> {
    this.calls.push(input);
    return this.output;
  }
}

class RecordingPersistence implements CharacterProductionTurnPersistencePortV1 {
  readonly events: string[] = [];
  existing: CharacterProductionCommittedTurnV1 | null = null;

  async readCommitted() {
    this.events.push('read_committed');
    return this.existing;
  }

  async allocateAttempt() {
    this.events.push('allocate_attempt');
    return {
      attemptId: ATTEMPT_ID,
      attemptNo: 1,
      replayed: false,
    };
  }

  async markContextReady() {
    this.events.push('context_ready');
  }

  async stageGenerated() {
    this.events.push('generated');
  }

  async stageValidationPassed() {
    this.events.push('validated');
  }

  async recordContextFailure() {
    this.events.push('context_failed');
  }

  async recordGenerationFailure() {
    this.events.push('generation_failed');
  }

  async recordValidationFailure() {
    this.events.push('validation_failed');
  }

  async commitValidated(input: Parameters<CharacterProductionTurnPersistencePortV1['commitValidated']>[0]) {
    this.events.push('committed');
    return {
      turnId: input.turnId,
      attemptId: input.attemptId,
      messageId: MESSAGE_ID,
      sequenceNo: 2,
      providerKey: input.providerKey,
      modelKey: input.modelKey,
      envelope: input.envelope,
    };
  }
}

function validRendererOutput() {
  return {
    schemaVersion: 'v1',
    framingBefore: '제 생일은 3월 18일이에요.',
    emotion: 'neutral',
    animationCue: 'idle',
    memoryProposals: [],
    relationshipEventProposals: [],
    suggestedActions: [],
  };
}

describe('Production Standard Reading Character turn orchestration', () => {
  it('runs authoritative context -> provider -> guard -> commit in DB-compatible order', async () => {
    const catalog = new StaticCatalogPort();
    const renderer = new CapturingRenderer(validRendererOutput());
    const persistence = new RecordingPersistence();

    const result = await runCharacterStandardReadingProductionTurnV1({
      resolvedSubjectId: SUBJECT_ID,
      turnId: TURN_ID,
      plannerVersion: 'production-planner-v1',
      preflight: genuinePreflight(),
      catalogAuthorityPort: catalog,
      renderer,
      persistence,
      allowedSuggestedActionKeys: [],
    });

    expect(result.status).toBe('delivered');
    expect(result.replayedCommittedTurn).toBe(false);
    expect(persistence.events).toEqual([
      'read_committed',
      'allocate_attempt',
      'context_ready',
      'generated',
      'validated',
      'committed',
    ]);
    expect(catalog.calls).toBe(1);
    expect(renderer.calls).toHaveLength(1);
    expect(renderer.calls[0]?.request.text).toBe('생일이 언제예요?');
    expect(renderer.calls[0]?.context.publicCharacterFacts).toEqual([
      {
        factKey: 'identity.birthday',
        sourceAuthority: 'CANON',
        value: '3월 18일',
      },
    ]);

    const providerFacts = JSON.stringify(
      renderer.calls[0]?.context.publicCharacterFacts,
    );
    expect(providerFacts).not.toContain(RELEASE_ID);
    expect(providerFacts).not.toContain('SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md');
    expect(providerFacts).not.toContain('private-source-revision-test');

    expect(result.committed.envelope.framingBefore).toBe(
      '제 생일은 3월 18일이에요.',
    );
  });

  it('replays an already committed turn without catalog lookup or provider generation', async () => {
    const catalog = new StaticCatalogPort();
    const renderer = new CapturingRenderer(validRendererOutput());
    const persistence = new RecordingPersistence();
    persistence.existing = {
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      messageId: MESSAGE_ID,
      sequenceNo: 2,
      providerKey: 'existing-provider',
      modelKey: 'existing-model',
      envelope: {
        schemaVersion: 'v1',
        framingBefore: '이미 커밋된 응답',
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
    };

    const result = await runCharacterStandardReadingProductionTurnV1({
      resolvedSubjectId: SUBJECT_ID,
      turnId: TURN_ID,
      plannerVersion: 'production-planner-v1',
      preflight: genuinePreflight(),
      catalogAuthorityPort: catalog,
      renderer,
      persistence,
      allowedSuggestedActionKeys: [],
    });

    expect(result.replayedCommittedTurn).toBe(true);
    expect(persistence.events).toEqual(['read_committed']);
    expect(catalog.calls).toBe(0);
    expect(renderer.calls).toHaveLength(0);
  });

  it('persists Output Guard failure and never commits rejected provider output', async () => {
    const catalog = new StaticCatalogPort();
    const renderer = new CapturingRenderer({
      ...validRendererOutput(),
      protectedSajuSegments: [{ text: 'provider-injected' }],
    });
    const persistence = new RecordingPersistence();

    await expect(
      runCharacterStandardReadingProductionTurnV1({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        plannerVersion: 'production-planner-v1',
        preflight: genuinePreflight(),
        catalogAuthorityPort: catalog,
        renderer,
        persistence,
        allowedSuggestedActionKeys: [],
      }),
    ).rejects.toMatchObject({
      name: 'CharacterStandardReadingProductionTurnErrorV1',
      stage: 'validate',
    });

    expect(persistence.events).toEqual([
      'read_committed',
      'allocate_attempt',
      'context_ready',
      'validation_failed',
    ]);
    expect(persistence.events).not.toContain('committed');
  });

  it('records context failure after attempt allocation instead of leaving an in-flight attempt', async () => {
    const catalog: CharacterPublicFactCatalogReadAuthorityPortV1 = {
      async readPublicFacts() {
        throw new Error('synthetic catalog outage');
      },
    };
    const renderer = new CapturingRenderer(validRendererOutput());
    const persistence = new RecordingPersistence();

    await expect(
      runCharacterStandardReadingProductionTurnV1({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        plannerVersion: 'production-planner-v1',
        preflight: genuinePreflight(),
        catalogAuthorityPort: catalog,
        renderer,
        persistence,
        allowedSuggestedActionKeys: [],
      }),
    ).rejects.toBeInstanceOf(CharacterStandardReadingProductionTurnErrorV1);

    expect(persistence.events).toEqual([
      'read_committed',
      'allocate_attempt',
      'context_failed',
    ]);
    expect(renderer.calls).toHaveLength(0);
  });
});
