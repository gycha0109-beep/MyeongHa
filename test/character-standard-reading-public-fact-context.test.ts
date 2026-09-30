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
import {
  prepareCharacterStandardReadingPublicFactGenerationContextV1,
} from '../apps/api/src/character-standard-reading-public-fact-context.js';
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
const CHARACTER_ID = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!.characterId;

function genuinePreflight(): CharacterStandardReadingChatTurnPreflightV1 {
  const entry = {
    release: {
      releaseId: RELEASE_ID,
      bundleId: BUNDLE_ID,
      contentVersion: 'public-fact-context-test-v1',
    },
    characters: {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'public-fact-context-test-v1',
    },
    world: {
      ...DEV_WORLD_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'public-fact-context-test-v1',
    },
    lifecycle: 'active',
  } as unknown as ContentReleaseRuntimeEntry;
  const releaseRuntime = {
    assertPinnedClientCompatible: vi.fn(() => entry),
  } as unknown as ContentReleaseRuntime;
  const receivePlan = prepareChatReceiveCommand({
    request: {
      threadId: THREAD_ID,
      clientTurnId: 'public-fact-context-turn-1',
      text: '캐릭터에 대해 알려주세요.',
      clientCapability: 'public-fact-context-test-capability',
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
    contentVersion: 'public-fact-context-test-v1',
    publicCharacterFacts: Object.freeze([]),
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

function row(
  factKey: string,
  overrides: Partial<CharacterFactRegistryAuthorityRowV1> = {},
): CharacterFactRegistryAuthorityRowV1 {
  return {
    releaseId: RELEASE_ID,
    characterId: CHARACTER_ID,
    factKey,
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'PUBLIC',
    sourceSection: 'B1',
    sourceBibleDocument: 'CHARACTER_BIBLE_TEST.md',
    sourceBibleRevision: 'source-revision-test',
    value: factKey,
    ...overrides,
  };
}

class MapFactAuthorityPort implements CharacterFactRegistryReadAuthorityPortV1 {
  readonly calls: string[] = [];

  constructor(
    readonly rows: ReadonlyMap<string, CharacterFactRegistryAuthorityRowV1>,
  ) {}

  async readFact(input: {
    readonly releaseId: string;
    readonly characterId: string;
    readonly factKey: string;
  }): Promise<CharacterFactRegistryAuthorityRowV1 | null> {
    this.calls.push(input.factKey);
    return this.rows.get(input.factKey) ?? null;
  }
}

describe('Character Standard Reading public fact generation context', () => {
  it('attaches only admitted PUBLIC facts and keeps blocked decisions out of renderer context', async () => {
    const publicFact = row('identity.birthday', { value: '3월 18일' });
    const gatedFact = row('past_romance.existence', {
      disclosureDefault: 'FAMILIAR',
      value: '과거 연애 경험 있음',
    });
    const worldDependent = row('principle_calling.binding', {
      sourceAuthority: 'WORLD_DEPENDENT',
      characterKnowledge: 'NOT_APPLICABLE',
      disclosureDefault: 'NOT_APPLICABLE',
      policy: '별도 World authority',
    });
    const { value: _worldValue, ...worldDependentWithoutValue } = worldDependent;

    const authorityPort = new MapFactAuthorityPort(new Map([
      [publicFact.factKey, publicFact],
      [gatedFact.factKey, gatedFact],
      [worldDependentWithoutValue.factKey, worldDependentWithoutValue],
    ]));
    const preflight = genuinePreflight();

    const result =
      await prepareCharacterStandardReadingPublicFactGenerationContextV1({
        preflight,
        factKeys: [
          'identity.birthday',
          'past_romance.existence',
          'principle_calling.binding',
        ],
        authorityPort,
      });

    expect(result.context.publicCharacterFacts).toEqual([{
      factKey: 'identity.birthday',
      sourceAuthority: 'CANON',
      value: '3월 18일',
      sourceReleaseId: RELEASE_ID,
      sourceSection: 'B1',
      sourceBibleDocument: 'CHARACTER_BIBLE_TEST.md',
      sourceBibleRevision: 'source-revision-test',
    }]);
    expect(result.decisions.map((decision) => ({
      factKey: decision.factKey,
      status: decision.status,
      reason: decision.status === 'blocked' ? decision.reason : null,
    }))).toEqual([
      { factKey: 'identity.birthday', status: 'available', reason: null },
      {
        factKey: 'past_romance.existence',
        status: 'blocked',
        reason: 'relationship_disclosure_authority_unresolved',
      },
      {
        factKey: 'principle_calling.binding',
        status: 'blocked',
        reason: 'source_authority_unresolved',
      },
    ]);
    expect(preflight.runtime.context.publicCharacterFacts).toEqual([]);
  });

  it('preserves exact SOFT_CANON wording in the generation context', async () => {
    const authorityPort = new MapFactAuthorityPort(new Map([
      ['identity.mbti_self_report', row('identity.mbti_self_report', {
        sourceAuthority: 'SOFT_CANON',
        value: '과거 검사 ESFP / 현재 큰 관심 없음',
      })],
    ]));

    const result =
      await prepareCharacterStandardReadingPublicFactGenerationContextV1({
        preflight: genuinePreflight(),
        factKeys: ['identity.mbti_self_report'],
        authorityPort,
      });

    expect(result.context.publicCharacterFacts[0]).toMatchObject({
      factKey: 'identity.mbti_self_report',
      sourceAuthority: 'SOFT_CANON',
      value: '과거 검사 ESFP / 현재 큰 관심 없음',
    });
  });

  it('rejects duplicate selectors before reading registry authority', async () => {
    const authorityPort = new MapFactAuthorityPort(new Map());

    await expect(
      prepareCharacterStandardReadingPublicFactGenerationContextV1({
        preflight: genuinePreflight(),
        factKeys: ['identity.name', ' identity.name '],
        authorityPort,
      }),
    ).rejects.toThrow(/Duplicate Character fact selector/u);

    expect(authorityPort.calls).toEqual([]);
  });
});
