import {
  evaluateCharacterContentCompatibilityV1,
  type CharacterClientCompatibilityProfileV1,
} from '../../../packages/domain/src/index.js';
import { ApiCommandError } from './api-error.js';
import type {
  ContentBundleManifestReadResponseV1,
} from './content-bundle-manifest-read.js';

/**
 * Positive admission boundary for public Se-yeon Chat content.
 *
 * This module is intentionally independent from chat-receive so shared API
 * errors do not depend on the Chat planning module.
 */
export function assertSeyeonPublicContentCompatibilityV1(input: {
  readonly bundleManifest: ContentBundleManifestReadResponseV1;
  readonly clientProfile: CharacterClientCompatibilityProfileV1;
}): void {
  const decision = evaluateCharacterContentCompatibilityV1({
    manifest: {
      minClientCapability: input.bundleManifest.manifest.minClientCapability,
      assetManifestHash: input.bundleManifest.manifest.assetManifestHash,
      cueSchemaVersion: input.bundleManifest.manifest.cueSchemaVersion,
    },
    clientProfile: input.clientProfile,
  });

  if (!decision.compatible || decision.action !== 'activate') {
    throw new ApiCommandError(
      decision.failures.includes('INVALID_COMPATIBILITY_INPUT')
        ? 'CAPABILITY_UNAVAILABLE'
        : 'CONTENT_INCOMPATIBLE',
      'Pinned Se-yeon content is not compatible with the governed Web client profile.',
    );
  }
}
