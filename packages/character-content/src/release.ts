import { createHash } from 'node:crypto';
import type { CharacterContentBundle } from './schema.js';
import {
  CharacterContentValidationError,
  validateCharacterContentBundle,
} from './validate.js';

export interface CharacterContentManifest {
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly minClientCapability: string;
  readonly assetManifestHash: string;
  readonly cueSchemaVersion: string;
  readonly characterIds: readonly string[];
  readonly contentHash: string;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isSha256V1Hash(value: string): boolean {
  return /^sha256:v1:[0-9a-f]{64}$/iu.test(value);
}

export function buildCharacterContentManifest(bundle: CharacterContentBundle): CharacterContentManifest {
  validateCharacterContentBundle(bundle);
  if (!isSha256V1Hash(bundle.assetManifestHash)) {
    throw new CharacterContentValidationError(
      'assetManifestHash must use sha256:v1:<hex> convention',
    );
  }
  const characterIds = bundle.characters.map((character) => character.characterId).sort();
  const contentHash = `sha256:v1:${createHash('sha256').update(stableJson(bundle)).digest('hex')}`;
  return Object.freeze({
    bundleId: bundle.bundleId,
    contentVersion: bundle.contentVersion,
    minClientCapability: bundle.minClientCapability,
    assetManifestHash: bundle.assetManifestHash,
    cueSchemaVersion: bundle.cueSchemaVersion,
    characterIds: Object.freeze(characterIds),
    contentHash,
  });
}
