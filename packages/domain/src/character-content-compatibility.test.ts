import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CONTENT_COMPATIBILITY_EVALUATOR_VERSION_V1,
  evaluateCharacterContentCompatibilityV1,
} from './character-content-compatibility.js';

const manifest = {
  minClientCapability: 'client-cap-v3',
  assetManifestHash: 'sha256:v1:asset-manifest',
  cueSchemaVersion: 'cue-v2',
} as const;

const compatibleProfile = {
  profileKey: 'production-web-current',
  supportedClientCapabilities: ['client-cap-v3'],
  supportedAssetManifestHashes: ['sha256:v1:asset-manifest'],
  supportedCueSchemaVersions: ['cue-v2'],
} as const;

describe('character content compatibility v1', () => {
  it('activates only when all opaque identifiers are exact supported members', () => {
    expect(
      evaluateCharacterContentCompatibilityV1({
        manifest,
        clientProfile: compatibleProfile,
      }),
    ).toEqual({
      evaluatorVersion: CHARACTER_CONTENT_COMPATIBILITY_EVALUATOR_VERSION_V1,
      compatible: true,
      action: 'activate',
      failures: [],
      checks: {
        clientCapability: true,
        assetManifest: true,
        cueSchema: true,
      },
    });
  });

  it('does not infer numeric or semantic ordering between capability identifiers', () => {
    const result = evaluateCharacterContentCompatibilityV1({
      manifest: {
        ...manifest,
        minClientCapability: 'client-cap-v2',
      },
      clientProfile: {
        ...compatibleProfile,
        supportedClientCapabilities: ['client-cap-v10'],
      },
    });

    expect(result).toMatchObject({
      compatible: false,
      action: 'update_required',
      failures: ['CLIENT_CAPABILITY_UNSUPPORTED'],
      checks: {
        clientCapability: false,
        assetManifest: true,
        cueSchema: true,
      },
    });
  });

  it('hides content when the asset manifest is not an exact supported identity', () => {
    const result = evaluateCharacterContentCompatibilityV1({
      manifest,
      clientProfile: {
        ...compatibleProfile,
        supportedAssetManifestHashes: ['sha256:v1:different-manifest'],
      },
    });

    expect(result).toMatchObject({
      compatible: false,
      action: 'hide',
      failures: ['ASSET_MANIFEST_UNSUPPORTED'],
      checks: {
        clientCapability: true,
        assetManifest: false,
        cueSchema: true,
      },
    });
  });

  it('requires an update when only the cue schema is unsupported', () => {
    const result = evaluateCharacterContentCompatibilityV1({
      manifest,
      clientProfile: {
        ...compatibleProfile,
        supportedCueSchemaVersions: ['cue-v1'],
      },
    });

    expect(result).toMatchObject({
      compatible: false,
      action: 'update_required',
      failures: ['CUE_SCHEMA_UNSUPPORTED'],
      checks: {
        clientCapability: true,
        assetManifest: true,
        cueSchema: false,
      },
    });
  });

  it('fails closed when compatibility evidence is malformed', () => {
    const result = evaluateCharacterContentCompatibilityV1({
      manifest,
      clientProfile: {
        ...compatibleProfile,
        supportedClientCapabilities: ['client-cap-v3', 'client-cap-v3'],
      },
    });

    expect(result).toEqual({
      evaluatorVersion: CHARACTER_CONTENT_COMPATIBILITY_EVALUATOR_VERSION_V1,
      compatible: false,
      action: 'hide',
      failures: ['INVALID_COMPATIBILITY_INPUT'],
      checks: {
        clientCapability: false,
        assetManifest: false,
        cueSchema: false,
      },
    });
  });

  it('does not select a fallback when multiple compatibility checks fail', () => {
    const result = evaluateCharacterContentCompatibilityV1({
      manifest,
      clientProfile: {
        profileKey: 'production-web-current',
        supportedClientCapabilities: [],
        supportedAssetManifestHashes: [],
        supportedCueSchemaVersions: [],
      },
    });

    expect(result).toMatchObject({
      compatible: false,
      action: 'hide',
      failures: [
        'CLIENT_CAPABILITY_UNSUPPORTED',
        'ASSET_MANIFEST_UNSUPPORTED',
        'CUE_SCHEMA_UNSUPPORTED',
      ],
    });
  });
});
