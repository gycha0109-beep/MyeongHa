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
  CHARACTER_PUBLIC_FACT_CATALOG_MAX_ROWS_V1,
  getCharacterPublicFactCatalogV1,
  type CharacterPublicFactCatalogReadAuthorityPortV1,
} from '../apps/api/src/character-public-fact-catalog-authority.js';
import type {
  CharacterFactRegistryAuthorityRowV1,
} from '../apps/api/src/character-fact-registry-authority.js';
import {
  prepareCharacterStandardReadingRendererContextFromPublicCatalogV1,
} from '../apps/api/src/character-standard-reading-public-fact-catalog-context.js';
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from '../apps/api/src/character-standard-reading-chat-turn-preflight.js';

const RELEASE_ID = '88888888-8888-4888-8888-888888888888';
const BUNDLE_ID = '77777777-7777-4777-8777-777777777777';
const THREAD_ID = '66666666-6666-4666-8666-666666666666';
const CHARACTER_ID = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!.characterId;

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

class StaticCatalogPort implements CharacterPublicFactCatalogReadAuthorityPortV1 {
  readonly calls: { releaseId: string; characterId: string }[] = [];

  constructor(
    readonly rows: readonly CharacterFactRegistryAuthorityRowV1[],
  ) {}

  async readPublicFacts(input: {
    readonly releaseId: string;
    readonly characterId: string;
  }): Promise<readonly CharacterFactRegistryAuthorityRowV1[]> {
    this.calls.push({ ...input });
    return this.rows;
  }
}

function genuinePreflight(): CharacterStandardReadingChatTurnPreflightV1 {
  const entry = {
    release: {
      releaseId: RELEASE_ID,
      bundleId: BUNDLE_ID,
      contentVersion: 'public-fact-catalog-test-v1',
    },
    characters: {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'public-fact-catalog-test-v1',
    },
    world: {
      ...DEV_WORLD_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'public-fact-catalog-test-v1',
    },
    lifecycle: 'active',
  } as unknown as ContentReleaseRuntimeEntry;

  const releaseRuntime = {
    assertPinnedClientCompatible: vi.fn(() => entry),
  } as unknown as ContentReleaseRuntime;

  const receivePlan = prepareChatReceiveCommand({
    request: {
      threadId: THREAD_ID,
      clientTurnId: 'public-fact-catalog-turn-1',
      text: '캐릭터에 대해 알려주세요.',
      clientCapability: 'public-fact-catalog-test-capability',
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
    contentVersion: 'public-fact-catalog-test-v1',
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

describe('Character PUBLIC fact catalog authority', () => {
  it('accepts a strictly sorted bounded PUBLIC + KNOWN + resolved catalog', async () => {
    const port = new StaticCatalogPort([
      row('identity.birthday', { value: '3월 18일' }),
      row('identity.name', { value: '세연' }),
    ]);

    await expect(
      getCharacterPublicFactCatalogV1({
        releaseId: RELEASE_ID,
        characterId: CHARACTER_ID,
        authorityPort: port,
      }),
    ).resolves.toEqual([
      row('identity.birthday', { value: '3월 18일' }),
      row('identity.name', { value: '세연' }),
    ]);

    expect(port.calls).toEqual([
      { releaseId: RELEASE_ID, characterId: CHARACTER_ID },
    ]);
  });

  it('rejects unsorted, duplicate, non-PUBLIC, and wrong-provenance rows', async () => {
    await expect(
      getCharacterPublicFactCatalogV1({
        releaseId: RELEASE_ID,
        characterId: CHARACTER_ID,
        authorityPort: new StaticCatalogPort([
          row('identity.name'),
          row('identity.birthday'),
        ]),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CATALOG' });

    await expect(
      getCharacterPublicFactCatalogV1({
        releaseId: RELEASE_ID,
        characterId: CHARACTER_ID,
        authorityPort: new StaticCatalogPort([
          row('identity.name'),
          row('identity.name'),
        ]),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CATALOG' });

    await expect(
      getCharacterPublicFactCatalogV1({
        releaseId: RELEASE_ID,
        characterId: CHARACTER_ID,
        authorityPort: new StaticCatalogPort([
          row('identity.name', { disclosureDefault: 'FAMILIAR' }),
        ]),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CATALOG' });

    await expect(
      getCharacterPublicFactCatalogV1({
        releaseId: RELEASE_ID,
        characterId: CHARACTER_ID,
        authorityPort: new StaticCatalogPort([
          row('identity.name', { characterId: 'other-character' }),
        ]),
      }),
    ).rejects.toMatchObject({ code: 'PROVENANCE_MISMATCH' });
  });

  it('fails closed instead of truncating an oversized catalog', async () => {
    const rows = Array.from(
      { length: CHARACTER_PUBLIC_FACT_CATALOG_MAX_ROWS_V1 + 1 },
      (_, index) => row(`public.fact.${String(index).padStart(3, '0')}`),
    );

    await expect(
      getCharacterPublicFactCatalogV1({
        releaseId: RELEASE_ID,
        characterId: CHARACTER_ID,
        authorityPort: new StaticCatalogPort(rows),
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_TOO_LARGE' });
  });
});

describe('Standard Reading provider context from PUBLIC fact catalog', () => {
  it('attaches the complete admissible catalog and strips server provenance before provider use', async () => {
    const port = new StaticCatalogPort([
      row('identity.birthday', {
        value: '3월 18일',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'private-source-revision-test',
      }),
      row('identity.mbti_self_report', {
        sourceAuthority: 'SOFT_CANON',
        value: '과거 검사 ESFP / 현재 큰 관심 없음',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'private-source-revision-test',
      }),
    ]);

    const result =
      await prepareCharacterStandardReadingRendererContextFromPublicCatalogV1({
        preflight: genuinePreflight(),
        catalogAuthorityPort: port,
      });

    expect(result).toMatchObject({
      schemaVersion: 'v1',
      releaseId: RELEASE_ID,
      characterId: CHARACTER_ID,
      admittedPublicFactCount: 2,
    });

    expect(result.providerContext.publicCharacterFacts).toEqual([
      {
        factKey: 'identity.birthday',
        sourceAuthority: 'CANON',
        value: '3월 18일',
      },
      {
        factKey: 'identity.mbti_self_report',
        sourceAuthority: 'SOFT_CANON',
        value: '과거 검사 ESFP / 현재 큰 관심 없음',
      },
    ]);

    const serialized = JSON.stringify(result.providerContext.publicCharacterFacts);
    expect(serialized).not.toContain(RELEASE_ID);
    expect(serialized).not.toContain('SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md');
    expect(serialized).not.toContain('private-source-revision-test');
  });

  it('supports an empty PUBLIC catalog without inventing facts', async () => {
    const result =
      await prepareCharacterStandardReadingRendererContextFromPublicCatalogV1({
        preflight: genuinePreflight(),
        catalogAuthorityPort: new StaticCatalogPort([]),
      });

    expect(result.admittedPublicFactCount).toBe(0);
    expect(result.providerContext.publicCharacterFacts).toEqual([]);
  });

  it('rejects a structural receive-plan lookalike before catalog authority lookup', async () => {
    const genuine = genuinePreflight();
    const forged = {
      ...genuine,
      receivePlan: Object.freeze({
        ...genuine.receivePlan,
        resolvedContent: Object.freeze({
          ...genuine.receivePlan.resolvedContent,
        }),
      }),
    } as CharacterStandardReadingChatTurnPreflightV1;
    const port = new StaticCatalogPort([]);

    await expect(
      prepareCharacterStandardReadingRendererContextFromPublicCatalogV1({
        preflight: forged,
        catalogAuthorityPort: port,
      }),
    ).rejects.toThrow(/not minted by server receive authority/u);

    expect(port.calls).toEqual([]);
  });
});
