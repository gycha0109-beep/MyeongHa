import { createHash } from 'node:crypto';
import type { CharacterContentBundle } from './schema.js';
import { validateCharacterContentBundle } from './validate.js';

export interface CharacterContentManifest {
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly minClientCapability: string;
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

export function buildCharacterContentManifest(bundle: CharacterContentBundle): CharacterContentManifest {
  validateCharacterContentBundle(bundle);
  const characterIds = bundle.characters.map((character) => character.characterId).sort();
  const contentHash = `sha256:${createHash('sha256').update(stableJson(bundle)).digest('hex')}`;
  return Object.freeze({
    bundleId: bundle.bundleId,
    contentVersion: bundle.contentVersion,
    minClientCapability: bundle.minClientCapability,
    cueSchemaVersion: bundle.cueSchemaVersion,
    characterIds: Object.freeze(characterIds),
    contentHash,
  });
}
