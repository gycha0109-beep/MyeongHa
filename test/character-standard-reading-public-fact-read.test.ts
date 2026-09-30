import { describe, expect, it, vi } from 'vitest';

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
  type ChatReceivePlan,
} from '../apps/api/src/chat-receive.js';
import {
  readCharacterPublicFactForStandardReadingChatV1,
} from '../apps/api/src/character-standard-reading-public-fact-read.js';
import type {
  CharacterFactRegistryAuthorityRowV1,
  CharacterFactRegistryReadAuthorityPortV1,
} from '../apps/api/src/character-fact-registry-authority.js';
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from '../apps/api/src/character-standard-reading-chat-turn-preflight.js';

const RELEASE_ID = '88888888-8888-4888-8888-888888888888';
const BUNDLE_ID = '77777777-7777-4777-8777-777777777777';
const THREAD_ID = '66666666-6666-4666-8666-666666666666';
const CHARACTER_ID = 'baekheon';

function receivePlan(): ChatReceivePlan {
  const entry = {
    release: {
      releaseId: RELEASE_ID,
      bundleId: BUNDLE_ID,
      contentVersion: 'public-fact-chat-test-v1',
    },
    characters: {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'public-fact-chat-test-v1',
    },
    world: {
      ...DEV_WORLD_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'public-fact-chat-test-v1',
    },
    lifecycle: 'active',
  } as unknown as ContentReleaseRuntimeEntry;

  const releaseRuntime = {
    assertPinnedClientCompatible: vi.fn(() => entry),
  } as unknown as ContentReleaseRuntime;

  return prepareChatReceiveCommand({
    request: {
      threadId: THREAD_ID,
      clientTurnId: 'public-fact-chat-turn-1',
      text: '생일이 언제예요?',
      clientCapability: 'public-fact-chat-test-capability',
    },
    releaseRuntime,
    trustedThread: {
      threadId: THREAD_ID,
      pinnedReleaseId: RELEASE_ID,
      participantCharacterIds: [CHARACTER_ID],
    },
  });
}

function preflight(
  plan = receivePlan(),
): CharacterStandardReadingChatTurnPreflightV1 {
  return {
    receivePlan: plan,
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
      context: {
        characterId: CHARACTER_ID,
        relationship: {
          // Deliberately arbitrary. Public fact read must not interpret this
          // while SRC-22 stage semantics remain unresolved.
          stageKey: 'caller-must-not-map-this',
        },
      },
    },
  } as unknown as CharacterStandardReadingChatTurnPreflightV1;
}

function fact(
  overrides: Partial<CharacterFactRegistryAuthorityRowV1> = {},
): CharacterFactRegistryAuthorityRowV1 {
  return {
    releaseId: RELEASE_ID,
    characterId: CHARACTER_ID,
    factKey: 'identity.birthday',
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'PUBLIC',
    sourceSection: 'B1',
    sourceBibleDocument: 'BAEKHEON_CHARACTER_BIBLE_DRAFT_TEST.md',
    sourceBibleRevision: 'source-revision-test',
    value: '11월 3일',
    ...overrides,
  };
}

class StaticFactAuthorityPort implements CharacterFactRegistryReadAuthorityPortV1 {
  readonly calls: {
    releaseId: string;
    characterId: string;
    factKey: string;
  }[] = [];

  constructor(readonly row: CharacterFactRegistryAuthorityRowV1 | null) {}

  async readFact(input: {
    readonly releaseId: string;
    readonly characterId: string;
    readonly factKey: string;
  }): Promise<CharacterFactRegistryAuthorityRowV1 | null> {
    this.calls.push({ ...input });
    return this.row;
  }
}

describe('Character Standard Reading public fact Chat read', () => {
  it('returns only exact PUBLIC + KNOWN + resolved registry value', async () => {
    const authorityPort = new StaticFactAuthorityPort(fact());

    await expect(
      readCharacterPublicFactForStandardReadingChatV1({
        preflight: preflight(),
        factKey: 'identity.birthday',
        authorityPort,
      }),
    ).resolves.toEqual({
      schemaVersion: 'v1',
      status: 'available',
      characterId: CHARACTER_ID,
      releaseId: RELEASE_ID,
      factKey: 'identity.birthday',
      sourceAuthority: 'CANON',
      value: '11월 3일',
      provenance: {
        sourceSection: 'B1',
        sourceBibleDocument: 'BAEKHEON_CHARACTER_BIBLE_DRAFT_TEST.md',
        sourceBibleRevision: 'source-revision-test',
      },
    });

    expect(authorityPort.calls).toEqual([{
      releaseId: RELEASE_ID,
      characterId: CHARACTER_ID,
      factKey: 'identity.birthday',
    }]);
  });

  it('allows SOFT_CANON only as its exact source-owned public value', async () => {
    const authorityPort = new StaticFactAuthorityPort(
      fact({
        factKey: 'identity.mbti_self_report',
        sourceAuthority: 'SOFT_CANON',
        value: '과거 검사 ESFP / 현재 큰 관심 없음',
      }),
    );

    await expect(
      readCharacterPublicFactForStandardReadingChatV1({
        preflight: preflight(),
        factKey: 'identity.mbti_self_report',
        authorityPort,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      sourceAuthority: 'SOFT_CANON',
      value: '과거 검사 ESFP / 현재 큰 관심 없음',
    });
  });

  it('blocks relationship-gated facts instead of mapping unresolved Relationship stage semantics', async () => {
    const authorityPort = new StaticFactAuthorityPort(
      fact({
        factKey: 'past_romance.existence',
        disclosureDefault: 'FAMILIAR',
        value: '과거 연애 경험 있음',
      }),
    );

    await expect(
      readCharacterPublicFactForStandardReadingChatV1({
        preflight: preflight(),
        factKey: 'past_romance.existence',
        authorityPort,
      }),
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'relationship_disclosure_authority_unresolved',
    });
  });

  it('keeps WORLD_DEPENDENT Principle/Calling empty and blocked', async () => {
    const unresolved = fact({
      factKey: 'principle_calling.binding',
      sourceAuthority: 'WORLD_DEPENDENT',
      characterKnowledge: 'NOT_APPLICABLE',
      disclosureDefault: 'NOT_APPLICABLE',
      policy: '미정',
    });
    const { value: _value, ...withoutValue } = unresolved;
    const authorityPort = new StaticFactAuthorityPort(withoutValue);

    await expect(
      readCharacterPublicFactForStandardReadingChatV1({
        preflight: preflight(),
        factKey: 'principle_calling.binding',
        authorityPort,
      }),
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'source_authority_unresolved',
    });
  });

  it.each([
    ['PARTIAL', 'partial_knowledge_projection_unresolved'],
    ['UNKNOWN_TO_CHARACTER', 'unknown_to_character'],
    ['NOT_APPLICABLE', 'character_knowledge_not_applicable'],
  ] as const)(
    'blocks %s Character knowledge without synthesizing a projection',
    async (characterKnowledge, reason) => {
      const authorityPort = new StaticFactAuthorityPort(
        fact({ characterKnowledge }),
      );

      await expect(
        readCharacterPublicFactForStandardReadingChatV1({
          preflight: preflight(),
          factKey: 'identity.birthday',
          authorityPort,
        }),
      ).resolves.toMatchObject({
        status: 'blocked',
        reason,
      });
    },
  );

  it.each([
    ['NEVER', 'never_disclose'],
    ['NOT_APPLICABLE', 'disclosure_not_applicable'],
  ] as const)(
    'blocks %s disclosure without reading relationship stage',
    async (disclosureDefault, reason) => {
      const authorityPort = new StaticFactAuthorityPort(
        fact({ disclosureDefault }),
      );

      await expect(
        readCharacterPublicFactForStandardReadingChatV1({
          preflight: preflight(),
          factKey: 'identity.birthday',
          authorityPort,
        }),
      ).resolves.toMatchObject({
        status: 'blocked',
        reason,
      });
    },
  );

  it('rejects a structural receive-plan lookalike before registry authority lookup', async () => {
    const genuine = receivePlan();
    const forged = Object.freeze({
      ...genuine,
      resolvedContent: Object.freeze({ ...genuine.resolvedContent }),
    });
    const authorityPort = new StaticFactAuthorityPort(fact());

    await expect(
      readCharacterPublicFactForStandardReadingChatV1({
        preflight: preflight(forged),
        factKey: 'identity.birthday',
        authorityPort,
      }),
    ).rejects.toThrow(/not minted by server receive authority/u);

    expect(authorityPort.calls).toEqual([]);
  });

  it('rejects runtime release provenance that diverges from the server-minted receive plan', async () => {
    const base = preflight();
    const forged = {
      ...base,
      runtime: {
        ...base.runtime,
        threadBinding: {
          ...base.runtime.threadBinding,
          activeContentReleaseId: '99999999-9999-4999-8999-999999999999',
        },
      },
    } as CharacterStandardReadingChatTurnPreflightV1;
    const authorityPort = new StaticFactAuthorityPort(fact());

    await expect(
      readCharacterPublicFactForStandardReadingChatV1({
        preflight: forged,
        factKey: 'identity.birthday',
        authorityPort,
      }),
    ).rejects.toThrow(/release provenance is inconsistent/u);

    expect(authorityPort.calls).toEqual([]);
  });
});
