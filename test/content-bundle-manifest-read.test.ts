import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  ContentBundleManifestReadAuthorityPortErrorV1,
  getContentBundleManifest,
  type ContentBundleManifestReadAuthorityPortV1,
} from '../apps/api/src/content-bundle-manifest-read.js';

async function expectApiCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
  }
}

function manifestPort(): ContentBundleManifestReadAuthorityPortV1 {
  return {
    readBundleManifest: async () => ({
      contentVersion: 'content-v7',
      minClientCapability: 'client-cap-v3',
      characterIds: ['char-alpha', 'char-beta'],
      assetManifestHash: 'sha256:asset-manifest',
      cueSchemaVersion: 'cue-v2',
    }),
  };
}

describe('explicit content bundle manifest read', () => {
  it('returns the bounded source-backed ContentManifest for one explicit bundle', async () => {
    const response = await getContentBundleManifest({
      contentBundleId: 'bundle-explicit-001',
      authorityPort: manifestPort(),
    });

    expect(response).toEqual({
      contentBundleId: 'bundle-explicit-001',
      manifest: {
        contentVersion: 'content-v7',
        minClientCapability: 'client-cap-v3',
        characterIds: ['char-alpha', 'char-beta'],
        assetManifestHash: 'sha256:asset-manifest',
        cueSchemaVersion: 'cue-v2',
      },
    });
  });

  it('passes only the explicit immutable bundle identity to the authority', async () => {
    const calls: unknown[] = [];
    const authorityPort: ContentBundleManifestReadAuthorityPortV1 = {
      readBundleManifest: async (input) => {
        calls.push(input);
        return {
          contentVersion: 'content-v7',
          minClientCapability: 'client-cap-v3',
          characterIds: [],
          assetManifestHash: 'sha256:asset-manifest',
          cueSchemaVersion: 'cue-v2',
        };
      },
    };

    await getContentBundleManifest({
      contentBundleId: '  bundle-explicit-001  ',
      authorityPort,
    });

    expect(calls).toEqual([{ contentBundleId: 'bundle-explicit-001' }]);
  });

  it('requires an explicit bundle before consulting authority', async () => {
    let calls = 0;
    const authorityPort: ContentBundleManifestReadAuthorityPortV1 = {
      readBundleManifest: async () => {
        calls += 1;
        return {
          contentVersion: 'content-v7',
          minClientCapability: 'client-cap-v3',
          characterIds: [],
          assetManifestHash: 'sha256:asset-manifest',
          cueSchemaVersion: 'cue-v2',
        };
      },
    };

    await expectApiCode(
      getContentBundleManifest({ contentBundleId: '   ', authorityPort }),
      'INVALID_REQUEST',
    );
    expect(calls).toBe(0);
  });

  it('maps an unavailable explicit bundle to NOT_FOUND without selecting a fallback', async () => {
    const authorityPort: ContentBundleManifestReadAuthorityPortV1 = {
      readBundleManifest: async () => {
        throw new ContentBundleManifestReadAuthorityPortErrorV1(
          'BUNDLE_UNAVAILABLE',
          'bundle unavailable',
        );
      },
    };

    await expectApiCode(
      getContentBundleManifest({
        contentBundleId: 'bundle-missing',
        authorityPort,
      }),
      'NOT_FOUND',
    );
  });

  it('does not interpret opaque capability or compatibility metadata', async () => {
    const authorityPort: ContentBundleManifestReadAuthorityPortV1 = {
      readBundleManifest: async () => ({
        contentVersion: 'opaque-content-version',
        minClientCapability: 'not-semver:future-capability',
        characterIds: ['character-z'],
        assetManifestHash: 'opaque-asset-proof',
        cueSchemaVersion: 'opaque-cue-schema',
      }),
    };

    const response = await getContentBundleManifest({
      contentBundleId: 'bundle-explicit-opaque',
      authorityPort,
    });

    expect(response.manifest).toEqual({
      contentVersion: 'opaque-content-version',
      minClientCapability: 'not-semver:future-capability',
      characterIds: ['character-z'],
      assetManifestHash: 'opaque-asset-proof',
      cueSchemaVersion: 'opaque-cue-schema',
    });
  });

  it('fails closed on duplicate character identities from authority', async () => {
    const authorityPort: ContentBundleManifestReadAuthorityPortV1 = {
      readBundleManifest: async () => ({
        contentVersion: 'content-v7',
        minClientCapability: 'client-cap-v3',
        characterIds: ['char-alpha', 'char-alpha'],
        assetManifestHash: 'sha256:asset-manifest',
        cueSchemaVersion: 'cue-v2',
      }),
    };

    await expect(
      getContentBundleManifest({
        contentBundleId: 'bundle-explicit-001',
        authorityPort,
      }),
    ).rejects.toThrow('duplicate character identity');
  });

  it('fails closed on malformed stored manifest metadata', async () => {
    const authorityPort: ContentBundleManifestReadAuthorityPortV1 = {
      readBundleManifest: async () => ({
        contentVersion: '',
        minClientCapability: 'client-cap-v3',
        characterIds: ['char-alpha'],
        assetManifestHash: 'sha256:asset-manifest',
        cueSchemaVersion: 'cue-v2',
      }),
    };

    await expect(
      getContentBundleManifest({
        contentBundleId: 'bundle-explicit-001',
        authorityPort,
      }),
    ).rejects.toThrow('invalid content version');
  });

  it('maps authority input rejection without converting it into compatibility semantics', async () => {
    const authorityPort: ContentBundleManifestReadAuthorityPortV1 = {
      readBundleManifest: async () => {
        throw new ContentBundleManifestReadAuthorityPortErrorV1(
          'INVALID_INPUT',
          'invalid explicit bundle identity',
        );
      },
    };

    await expectApiCode(
      getContentBundleManifest({
        contentBundleId: 'bundle-explicit-001',
        authorityPort,
      }),
      'INVALID_REQUEST',
    );
  });
});
