import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  CharacterCatalogReadAuthorityPortErrorV1,
  readCharacterCatalogForResolvedBundle,
  type CharacterCatalogContentAuthorityPortV1,
  type CharacterCatalogReadAuthorityPortV1,
} from '../apps/api/src/character-catalog-read.js';

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
        characterId: 'char-beta',
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

function contentPort(): CharacterCatalogContentAuthorityPortV1 {
  return {
    readBundleCharacterContent: async ({ contentBundleId }) => [
      {
        contentBundleId,
        characterId: 'char-alpha',
        displayName: 'Alpha',
      },
      {
        contentBundleId,
        characterId: 'char-beta',
        displayName: 'Beta',
      },
    ],
  };
}

describe('resolved-bundle character catalog read', () => {
  it('joins immutable presentation data to exact runtime catalog identities in deterministic order', async () => {
    const response = await readCharacterCatalogForResolvedBundle({
      resolvedContentBundleId: 'bundle-resolved-001',
      catalogAuthorityPort: catalogPort(),
      contentAuthorityPort: contentPort(),
    });

    expect(response).toEqual({
      contentBundleId: 'bundle-resolved-001',
      characters: [
        {
          characterId: 'char-alpha',
          displayName: 'Alpha',
          catalogAvailability: 'available',
          catalogEnabled: true,
        },
        {
          characterId: 'char-beta',
          displayName: 'Beta',
          catalogAvailability: 'locked',
          catalogEnabled: false,
        },
      ],
    });
  });

  it('preserves recorded locked/disabled state instead of inventing current subject or rollout policy', async () => {
    const response = await readCharacterCatalogForResolvedBundle({
      resolvedContentBundleId: 'bundle-resolved-001',
      catalogAuthorityPort: catalogPort(),
      contentAuthorityPort: contentPort(),
    });

    expect(response.characters[1]).toMatchObject({
      characterId: 'char-beta',
      catalogAvailability: 'locked',
      catalogEnabled: false,
    });
  });

  it('requires a previously resolved bundle before consulting either authority', async () => {
    let catalogCalls = 0;
    let contentCalls = 0;
    const catalogAuthorityPort: CharacterCatalogReadAuthorityPortV1 = {
      readBundleCatalog: async () => {
        catalogCalls += 1;
        return [];
      },
    };
    const contentAuthorityPort: CharacterCatalogContentAuthorityPortV1 = {
      readBundleCharacterContent: async () => {
        contentCalls += 1;
        return [];
      },
    };

    await expectApiCode(
      readCharacterCatalogForResolvedBundle({
        resolvedContentBundleId: '   ',
        catalogAuthorityPort,
        contentAuthorityPort,
      }),
      'INVALID_REQUEST',
    );
    expect(catalogCalls).toBe(0);
    expect(contentCalls).toBe(0);
  });

  it('maps an unavailable resolved bundle to NOT_FOUND without choosing an active-default fallback', async () => {
    const catalogAuthorityPort: CharacterCatalogReadAuthorityPortV1 = {
      readBundleCatalog: async () => {
        throw new CharacterCatalogReadAuthorityPortErrorV1(
          'BUNDLE_UNAVAILABLE',
          'bundle unavailable',
        );
      },
    };

    await expectApiCode(
      readCharacterCatalogForResolvedBundle({
        resolvedContentBundleId: 'bundle-missing',
        catalogAuthorityPort,
        contentAuthorityPort: contentPort(),
      }),
      'NOT_FOUND',
    );
  });

  it('fails closed when runtime catalog and immutable content disagree on bundle membership', async () => {
    const contentAuthorityPort: CharacterCatalogContentAuthorityPortV1 = {
      readBundleCharacterContent: async ({ contentBundleId }) => [
        {
          contentBundleId,
          characterId: 'char-alpha',
          displayName: 'Alpha',
        },
      ],
    };

    await expect(
      readCharacterCatalogForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        catalogAuthorityPort: catalogPort(),
        contentAuthorityPort,
      }),
    ).rejects.toThrow('disagree on bundle membership');
  });

  it('fails closed when immutable content claims a different bundle', async () => {
    const contentAuthorityPort: CharacterCatalogContentAuthorityPortV1 = {
      readBundleCharacterContent: async () => [
        {
          contentBundleId: 'bundle-other',
          characterId: 'char-alpha',
          displayName: 'Alpha',
        },
        {
          contentBundleId: 'bundle-other',
          characterId: 'char-beta',
          displayName: 'Beta',
        },
      ],
    };

    await expect(
      readCharacterCatalogForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        catalogAuthorityPort: catalogPort(),
        contentAuthorityPort,
      }),
    ).rejects.toThrow('different content bundle');
  });

  it('rejects duplicate runtime identities instead of arbitrarily choosing one row', async () => {
    const catalogAuthorityPort: CharacterCatalogReadAuthorityPortV1 = {
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
    const contentAuthorityPort: CharacterCatalogContentAuthorityPortV1 = {
      readBundleCharacterContent: async ({ contentBundleId }) => [
        {
          contentBundleId,
          characterId: 'char-alpha',
          displayName: 'Alpha',
        },
      ],
    };

    await expect(
      readCharacterCatalogForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        catalogAuthorityPort,
        contentAuthorityPort,
      }),
    ).rejects.toThrow('duplicate character identity');
  });

  it('rejects invalid stored catalog availability instead of widening the runtime enum', async () => {
    const catalogAuthorityPort = {
      readBundleCatalog: async () => [
        {
          characterId: 'char-alpha',
          catalogAvailability: 'temporarily_hidden',
          catalogEnabled: true,
        },
      ],
    } as unknown as CharacterCatalogReadAuthorityPortV1;
    const contentAuthorityPort: CharacterCatalogContentAuthorityPortV1 = {
      readBundleCharacterContent: async ({ contentBundleId }) => [
        {
          contentBundleId,
          characterId: 'char-alpha',
          displayName: 'Alpha',
        },
      ],
    };

    await expect(
      readCharacterCatalogForResolvedBundle({
        resolvedContentBundleId: 'bundle-resolved-001',
        catalogAuthorityPort,
        contentAuthorityPort,
      }),
    ).rejects.toThrow('invalid catalog availability');
  });
});
