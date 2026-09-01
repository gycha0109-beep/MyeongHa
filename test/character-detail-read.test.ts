import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  CharacterCatalogReadAuthorityPortErrorV1,
  type CharacterCatalogReadAuthorityPortV1,
} from '../apps/api/src/character-catalog-read.js';
import {
  CharacterDetailContentAuthorityPortErrorV1,
  readCharacterDetailForResolvedBundle,
  type CharacterDetailContentAuthorityPortV1,
} from '../apps/api/src/character-detail-read.js';

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
  }
}

function catalogPort(): CharacterCatalogReadAuthorityPortV1 {
  return {
    readBundleCatalog: async () => [
      {
        characterId: 'char-other',
        catalogAvailability: 'locked',
        catalogEnabled: false,
      },
      {
        characterId: 'char-alpha',
        catalogAvailability: 'available',
        catalogEnabled: true,
      },
    ],
  };
}

function contentPort(): CharacterDetailContentAuthorityPortV1 {
  return {
    readBundleCharacterDetail: async ({ contentBundleId, characterId }) => [
      {
        contentBundleId,
        characterId,
        displayName: 'Alpha',
        deityProxyLabel: '기록의 대리자',
        shortDescriptor: '기억과 선택의 결을 읽는 대리자',
      },
    ],
  };
}

describe('resolved-bundle character detail read', () => {
  it('joins exact runtime membership to bounded immutable detail in the resolved bundle', async () => {
    const response = await readCharacterDetailForResolvedBundle({
      resolvedContentBundleId: 'bundle-resolved-001',
      characterId: 'char-alpha',
      catalogAuthorityPort: catalogPort(),
      contentAuthorityPort: contentPort(),
    });

    expect(response).toEqual({
      contentBundleId: 'bundle-resolved-001',
      character: {
        characterId: 'char-alpha',
        displayName: 'Alpha',
        deityProxyLabel: '기록의 대리자',
        shortDescriptor: '기억과 선택의 결을 읽는 대리자',
        catalogAvailability: 'available',
        catalogEnabled: true,
      },
    });
  });

  it('does not expose canon, persona, behavior, or Saju-profile internals through the detail contract', async () => {
    const response = await readCharacterDetailForResolvedBundle({
      resolvedContentBundleId: 'bundle-resolved-001',
      characterId: 'char-alpha',
      catalogAuthorityPort: catalogPort(),
      contentAuthorityPort: contentPort(),
    });

    expect(Object.keys(response.character).sort()).toEqual([
      'catalogAvailability',
      'catalogEnabled',
      'characterId',
      'deityProxyLabel',
      'displayName',
      'shortDescriptor',
    ]);
  });

  it('requires both the resolved bundle and canonical character id before consulting authorities', async () => {
    let catalogCalls = 0;
    let contentCalls = 0;
    const catalogAuthorityPort: CharacterCatalogReadAuthorityPortV1 = {
      readBundleCatalog: async () => {
        catalogCalls += 1;
        return [];
      },
    };
    const contentAuthorityPort: CharacterDetailContentAuthorityPortV1 = {
      readBundleCharacterDetail: async () => {
        contentCalls += 1;
        return [];
      },
    };

    await expectApiCode(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: ' ',
        characterId: 'char-alpha',
        catalogAuthorityPort,
        contentAuthorityPort,
      }),
      'INVALID_REQUEST',
    );
    await expectApiCode(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: ' ',
        catalogAuthorityPort,
        contentAuthorityPort,
      }),
      'INVALID_REQUEST',
    );

    expect(catalogCalls).toBe(0);
    expect(contentCalls).toBe(0);
  });

  it('returns NOT_FOUND when both authorities agree the character is absent', async () => {
    const catalogAuthorityPort: CharacterCatalogReadAuthorityPortV1 = {
      readBundleCatalog: async () => [],
    };
    const contentAuthorityPort: CharacterDetailContentAuthorityPortV1 = {
      readBundleCharacterDetail: async () => [],
    };

    await expectApiCode(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: 'char-missing',
        catalogAuthorityPort,
        contentAuthorityPort,
      }),
      'NOT_FOUND',
    );
  });

  it('fails closed when runtime catalog has the character but immutable content does not', async () => {
    const contentAuthorityPort: CharacterDetailContentAuthorityPortV1 = {
      readBundleCharacterDetail: async () => [],
    };

    await expect(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: 'char-alpha',
        catalogAuthorityPort: catalogPort(),
        contentAuthorityPort,
      }),
    ).rejects.toThrow('disagree on character membership');
  });

  it('fails closed when immutable content has the character but runtime catalog does not', async () => {
    const catalogAuthorityPort: CharacterCatalogReadAuthorityPortV1 = {
      readBundleCatalog: async () => [],
    };

    await expect(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: 'char-alpha',
        catalogAuthorityPort,
        contentAuthorityPort: contentPort(),
      }),
    ).rejects.toThrow('disagree on character membership');
  });

  it('rejects a content row from a different bundle or character identity', async () => {
    const wrongBundlePort: CharacterDetailContentAuthorityPortV1 = {
      readBundleCharacterDetail: async ({ characterId }) => [
        {
          contentBundleId: 'bundle-other',
          characterId,
          displayName: 'Alpha',
          deityProxyLabel: '기록의 대리자',
          shortDescriptor: '기억과 선택의 결을 읽는 대리자',
        },
      ],
    };
    const wrongCharacterPort: CharacterDetailContentAuthorityPortV1 = {
      readBundleCharacterDetail: async ({ contentBundleId }) => [
        {
          contentBundleId,
          characterId: 'char-other',
          displayName: 'Alpha',
          deityProxyLabel: '기록의 대리자',
          shortDescriptor: '기억과 선택의 결을 읽는 대리자',
        },
      ],
    };

    await expect(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: 'char-alpha',
        catalogAuthorityPort: catalogPort(),
        contentAuthorityPort: wrongBundlePort,
      }),
    ).rejects.toThrow('different content bundle');

    await expect(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: 'char-alpha',
        catalogAuthorityPort: catalogPort(),
        contentAuthorityPort: wrongCharacterPort,
      }),
    ).rejects.toThrow('different character identity');
  });

  it('rejects duplicate requested runtime identities and duplicate content detail rows', async () => {
    const duplicateCatalogPort: CharacterCatalogReadAuthorityPortV1 = {
      readBundleCatalog: async () => [
        {
          characterId: 'char-alpha',
          catalogAvailability: 'available',
          catalogEnabled: true,
        },
        {
          characterId: 'char-alpha',
          catalogAvailability: 'locked',
          catalogEnabled: false,
        },
      ],
    };
    const duplicateContentPort: CharacterDetailContentAuthorityPortV1 = {
      readBundleCharacterDetail: async ({ contentBundleId, characterId }) => [
        {
          contentBundleId,
          characterId,
          displayName: 'Alpha',
          deityProxyLabel: '기록의 대리자',
          shortDescriptor: '기억과 선택의 결을 읽는 대리자',
        },
        {
          contentBundleId,
          characterId,
          displayName: 'Alpha duplicate',
          deityProxyLabel: '기록의 대리자',
          shortDescriptor: '기억과 선택의 결을 읽는 대리자',
        },
      ],
    };

    await expect(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: 'char-alpha',
        catalogAuthorityPort: duplicateCatalogPort,
        contentAuthorityPort: contentPort(),
      }),
    ).rejects.toThrow('duplicate requested character identity');

    await expect(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: 'char-alpha',
        catalogAuthorityPort: catalogPort(),
        contentAuthorityPort: duplicateContentPort,
      }),
    ).rejects.toThrow('more than one detail row');
  });

  it('rejects invalid runtime availability instead of widening the catalog contract', async () => {
    const catalogAuthorityPort = {
      readBundleCatalog: async () => [
        {
          characterId: 'char-alpha',
          catalogAvailability: 'temporarily_hidden',
          catalogEnabled: true,
        },
      ],
    } as unknown as CharacterCatalogReadAuthorityPortV1;

    await expect(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: 'char-alpha',
        catalogAuthorityPort,
        contentAuthorityPort: contentPort(),
      }),
    ).rejects.toThrow('invalid catalog availability');
  });

  it('maps known bundle/content authority failures without choosing any fallback bundle', async () => {
    const unavailableCatalogPort: CharacterCatalogReadAuthorityPortV1 = {
      readBundleCatalog: async () => {
        throw new CharacterCatalogReadAuthorityPortErrorV1(
          'BUNDLE_UNAVAILABLE',
          'bundle unavailable',
        );
      },
    };
    const unavailableContentPort: CharacterDetailContentAuthorityPortV1 = {
      readBundleCharacterDetail: async () => {
        throw new CharacterDetailContentAuthorityPortErrorV1(
          'CHARACTER_UNAVAILABLE',
          'character unavailable',
        );
      },
    };

    await expectApiCode(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-missing',
        characterId: 'char-alpha',
        catalogAuthorityPort: unavailableCatalogPort,
        contentAuthorityPort: contentPort(),
      }),
      'NOT_FOUND',
    );
    await expectApiCode(
      readCharacterDetailForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        characterId: 'char-alpha',
        catalogAuthorityPort: catalogPort(),
        contentAuthorityPort: unavailableContentPort,
      }),
      'NOT_FOUND',
    );
  });
});
