import { describe, expect, it } from 'vitest';
import {
  assertServerPreparedChatReceivePlanV1,
  prepareServerCompatiblePinnedSeyeonReceivePlanV1,
} from '../apps/api/src/chat-receive.js';
import {
  assertSeyeonPublicContentCompatibilityV1,
  SEYEON_PRODUCTION_WEB_COMPATIBILITY_PROFILE_V1,
} from '../apps/api/src/seyeon-public-content-compatibility-v1.js';
import { ApiCommandError } from '../apps/api/src/api-error.js';

const THREAD_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('Seyeon public turn authority', () => {
  it('pins the Product Owner-approved static Web compatibility identifiers', () => {
    expect(SEYEON_PRODUCTION_WEB_COMPATIBILITY_PROFILE_V1).toEqual({
      profileKey: 'production-web-seyeon-static-v1',
      supportedClientCapabilities: ['character-chat-theme-v1'],
      supportedAssetManifestHashes: [
        'sha256:v1:ca769bd9b211e5d04f64128fea1fb2e3d1eca3f91d2d34c6fe14f39b62591a4d',
      ],
      supportedCueSchemaVersions: ['character-static-presentation-v1'],
    });
  });

  it('mints browser-independent request authority only from server inputs', () => {
    const plan = prepareServerCompatiblePinnedSeyeonReceivePlanV1({
      clientTurnId: '223e4567-e89b-42d3-a456-426614174000',
      text: '안녕하세요.',
      clientCapability: 'web-static-seyeon-v1',
      trustedThread: {
        threadId: THREAD_ID,
        pinnedReleaseId: 'release-authority',
        participantCharacterIds: ['seyeon'],
      },
      pinnedBundleId: 'bundle-authority',
      contentVersion: 'content-v1',
    });

    expect(() => assertServerPreparedChatReceivePlanV1(plan)).not.toThrow();
    expect(plan.normalizedRequest).toEqual({
      threadId: THREAD_ID,
      characterId: 'seyeon',
      clientTurnId: '223e4567-e89b-42d3-a456-426614174000',
      text: '안녕하세요.',
      clientCapability: 'web-static-seyeon-v1',
    });
    expect(plan.resolvedContent).toEqual({
      releaseId: 'release-authority',
      bundleId: 'bundle-authority',
      contentVersion: 'content-v1',
    });
  });

  it('requires exact server-profile inclusion for all compatibility identifiers', () => {
    expect(() => assertSeyeonPublicContentCompatibilityV1({
      bundleManifest: {
        contentBundleId: 'bundle',
        manifest: {
          contentVersion: 'content-v1',
          minClientCapability: 'cap-v1',
          characterIds: ['seyeon'],
          assetManifestHash: 'sha256:v1:assets',
          cueSchemaVersion: 'cue-v1',
        },
      },
      clientProfile: {
        profileKey: 'web-v1',
        supportedClientCapabilities: ['cap-v1'],
        supportedAssetManifestHashes: ['sha256:v1:assets'],
        supportedCueSchemaVersions: ['cue-v1'],
      },
    })).not.toThrow();
  });

  it('fails closed before execution when an approved server profile cannot admit the pinned bundle', () => {
    try {
      assertSeyeonPublicContentCompatibilityV1({
        bundleManifest: {
          contentBundleId: 'bundle',
          manifest: {
            contentVersion: 'content-v1',
            minClientCapability: 'cap-v1',
            characterIds: ['seyeon'],
            assetManifestHash: 'sha256:v1:bundle-assets',
            cueSchemaVersion: 'cue-v1',
          },
        },
        clientProfile: {
          profileKey: 'web-v1',
          supportedClientCapabilities: ['cap-v1'],
          supportedAssetManifestHashes: ['sha256:v1:web-assets'],
          supportedCueSchemaVersions: ['cue-v1'],
        },
      });
      throw new Error('expected incompatibility rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiCommandError);
      expect((error as ApiCommandError).code).toBe('CONTENT_INCOMPATIBLE');
    }
  });
});
