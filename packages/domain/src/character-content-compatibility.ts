export const CHARACTER_CONTENT_COMPATIBILITY_EVALUATOR_VERSION_V1 =
  'character-content-compatibility-v1' as const;

export interface CharacterContentCompatibilityManifestV1 {
  readonly minClientCapability: string;
  readonly assetManifestHash: string;
  readonly cueSchemaVersion: string;
}

export interface CharacterClientCompatibilityProfileV1 {
  readonly profileKey: string;
  readonly supportedClientCapabilities: readonly string[];
  readonly supportedAssetManifestHashes: readonly string[];
  readonly supportedCueSchemaVersions: readonly string[];
}

export type CharacterContentCompatibilityFailureCodeV1 =
  | 'INVALID_COMPATIBILITY_INPUT'
  | 'CLIENT_CAPABILITY_UNSUPPORTED'
  | 'ASSET_MANIFEST_UNSUPPORTED'
  | 'CUE_SCHEMA_UNSUPPORTED';

export type CharacterContentCompatibilityActionV1 =
  | 'activate'
  | 'hide'
  | 'update_required';

export interface CharacterContentCompatibilityDecisionV1 {
  readonly evaluatorVersion: typeof CHARACTER_CONTENT_COMPATIBILITY_EVALUATOR_VERSION_V1;
  readonly compatible: boolean;
  readonly action: CharacterContentCompatibilityActionV1;
  readonly failures: readonly CharacterContentCompatibilityFailureCodeV1[];
  readonly checks: Readonly<{
    clientCapability: boolean;
    assetManifest: boolean;
    cueSchema: boolean;
  }>;
}

export interface EvaluateCharacterContentCompatibilityInputV1 {
  readonly manifest: CharacterContentCompatibilityManifestV1;
  readonly clientProfile: CharacterClientCompatibilityProfileV1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidIdentifierSet(values: readonly string[]): boolean {
  const seen = new Set<string>();

  for (const value of values) {
    if (!isNonEmptyString(value) || value !== value.trim() || seen.has(value)) {
      return false;
    }
    seen.add(value);
  }

  return true;
}

function isValidInput(input: EvaluateCharacterContentCompatibilityInputV1): boolean {
  const { manifest, clientProfile } = input;

  return (
    isNonEmptyString(manifest.minClientCapability) &&
    isNonEmptyString(manifest.assetManifestHash) &&
    isNonEmptyString(manifest.cueSchemaVersion) &&
    isNonEmptyString(clientProfile.profileKey) &&
    isValidIdentifierSet(clientProfile.supportedClientCapabilities) &&
    isValidIdentifierSet(clientProfile.supportedAssetManifestHashes) &&
    isValidIdentifierSet(clientProfile.supportedCueSchemaVersions)
  );
}

function freezeDecision(
  decision: Omit<
    CharacterContentCompatibilityDecisionV1,
    'evaluatorVersion' | 'failures' | 'checks'
  > & {
    readonly failures: readonly CharacterContentCompatibilityFailureCodeV1[];
    readonly checks: CharacterContentCompatibilityDecisionV1['checks'];
  },
): CharacterContentCompatibilityDecisionV1 {
  return Object.freeze({
    evaluatorVersion: CHARACTER_CONTENT_COMPATIBILITY_EVALUATOR_VERSION_V1,
    compatible: decision.compatible,
    action: decision.action,
    failures: Object.freeze([...decision.failures]),
    checks: Object.freeze({ ...decision.checks }),
  });
}

export function evaluateCharacterContentCompatibilityV1(
  input: EvaluateCharacterContentCompatibilityInputV1,
): CharacterContentCompatibilityDecisionV1 {
  if (!isValidInput(input)) {
    return freezeDecision({
      compatible: false,
      action: 'hide',
      failures: ['INVALID_COMPATIBILITY_INPUT'],
      checks: {
        clientCapability: false,
        assetManifest: false,
        cueSchema: false,
      },
    });
  }

  const clientCapability = input.clientProfile.supportedClientCapabilities.includes(
    input.manifest.minClientCapability,
  );
  const assetManifest = input.clientProfile.supportedAssetManifestHashes.includes(
    input.manifest.assetManifestHash,
  );
  const cueSchema = input.clientProfile.supportedCueSchemaVersions.includes(
    input.manifest.cueSchemaVersion,
  );

  const failures: CharacterContentCompatibilityFailureCodeV1[] = [];
  if (!clientCapability) failures.push('CLIENT_CAPABILITY_UNSUPPORTED');
  if (!assetManifest) failures.push('ASSET_MANIFEST_UNSUPPORTED');
  if (!cueSchema) failures.push('CUE_SCHEMA_UNSUPPORTED');

  if (failures.length === 0) {
    return freezeDecision({
      compatible: true,
      action: 'activate',
      failures,
      checks: { clientCapability, assetManifest, cueSchema },
    });
  }

  return freezeDecision({
    compatible: false,
    action: assetManifest ? 'update_required' : 'hide',
    failures,
    checks: { clientCapability, assetManifest, cueSchema },
  });
}
