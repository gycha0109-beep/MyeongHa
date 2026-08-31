import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  CharacterPresentationIdentityAuthorityPortErrorV1,
  resolveCharacterPresentationIdentity,
  type CharacterPresentationIdentityAuthorityPortV1,
} from '../apps/api/src/character-presentation-resolver.js';

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

describe('character presentation identity resolver', () => {
  it('resolves a presentation key to a distinct canonical character identity inside the trusted bundle', async () => {
    const authorityPort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async (input) => [
        {
          presentationKey: input.presentationKey,
          characterId: 'canonical-character-019',
          contentBundleId: input.contentBundleId,
        },
      ],
    };

    const identity = await resolveCharacterPresentationIdentity({
      contentBundleId: 'bundle-release-a',
      presentationKey: 'baekheon',
      authorityPort,
    });

    expect(identity).toEqual({
      presentationKey: 'baekheon',
      characterId: 'canonical-character-019',
      contentBundleId: 'bundle-release-a',
    });
    expect(identity.characterId).not.toBe(identity.presentationKey);
  });

  it('keeps the API roster-agnostic so a future presentation key can be admitted by content authority', async () => {
    const authorityPort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async ({ contentBundleId, presentationKey }) => [
        {
          presentationKey,
          characterId: 'canonical-future-character',
          contentBundleId,
        },
      ],
    };

    const identity = await resolveCharacterPresentationIdentity({
      contentBundleId: 'bundle-future',
      presentationKey: 'future-character-10',
      authorityPort,
    });

    expect(identity.presentationKey).toBe('future-character-10');
    expect(identity.characterId).toBe('canonical-future-character');
  });

  it('rejects an empty browser route key before consulting authority', async () => {
    let authorityCalls = 0;
    const authorityPort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async () => {
        authorityCalls += 1;
        return [];
      },
    };

    await expectApiCode(
      resolveCharacterPresentationIdentity({
        contentBundleId: 'bundle-release-a',
        presentationKey: '   ',
        authorityPort,
      }),
      'INVALID_REQUEST',
    );
    expect(authorityCalls).toBe(0);
  });

  it('fails closed when the trusted bundle has no mapping for a supplied route key', async () => {
    const authorityPort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async () => [],
    };

    await expectApiCode(
      resolveCharacterPresentationIdentity({
        contentBundleId: 'bundle-release-a',
        presentationKey: 'unreleased-character',
        authorityPort,
      }),
      'NOT_FOUND',
    );
  });

  it('rejects duplicate authority rows instead of choosing a canonical identity', async () => {
    const authorityPort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async ({ contentBundleId, presentationKey }) => [
        {
          presentationKey,
          characterId: 'canonical-character-a',
          contentBundleId,
        },
        {
          presentationKey,
          characterId: 'canonical-character-b',
          contentBundleId,
        },
      ],
    };

    await expect(
      resolveCharacterPresentationIdentity({
        contentBundleId: 'bundle-release-a',
        presentationKey: 'rahyeon',
        authorityPort,
      }),
    ).rejects.toThrow('more than one mapping row');
  });

  it('rejects an authority row from a different bundle or route key', async () => {
    const wrongBundlePort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async ({ presentationKey }) => [
        {
          presentationKey,
          characterId: 'canonical-character-a',
          contentBundleId: 'bundle-other',
        },
      ],
    };
    const wrongKeyPort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async ({ contentBundleId }) => [
        {
          presentationKey: 'seyeon',
          characterId: 'canonical-character-a',
          contentBundleId,
        },
      ],
    };

    await expect(
      resolveCharacterPresentationIdentity({
        contentBundleId: 'bundle-release-a',
        presentationKey: 'baekheon',
        authorityPort: wrongBundlePort,
      }),
    ).rejects.toThrow('different content bundle');

    await expect(
      resolveCharacterPresentationIdentity({
        contentBundleId: 'bundle-release-a',
        presentationKey: 'baekheon',
        authorityPort: wrongKeyPort,
      }),
    ).rejects.toThrow('different presentation key');
  });

  it('maps decided authority failures without inventing a fallback mapping', async () => {
    const authorityPort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async () => {
        throw new CharacterPresentationIdentityAuthorityPortErrorV1(
          'BUNDLE_UNAVAILABLE',
          'bundle not active',
        );
      },
    };

    await expectApiCode(
      resolveCharacterPresentationIdentity({
        contentBundleId: 'bundle-release-a',
        presentationKey: 'doyoon',
        authorityPort,
      }),
      'NOT_FOUND',
    );
  });
});
