import { createHash } from 'node:crypto';
import type { CharacterContentBundle, CharacterContentManifest } from '../../character-content/src/index.js';
import type { CoherentContentRelease, WorldContentBundle } from './schema.js';
import { validateWorldContentBundle } from './validate.js';

export interface WorldContentManifest {
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly episodeIds: readonly string[];
  readonly relationCount: number;
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

export function buildWorldContentManifest(
  world: WorldContentBundle,
  characters: CharacterContentBundle,
): WorldContentManifest {
  validateWorldContentBundle(world, characters);
  return Object.freeze({
    bundleId: world.bundleId,
    contentVersion: world.contentVersion,
    episodeIds: Object.freeze(world.episodes.map((episode) => episode.episodeId).sort()),
    relationCount: world.characterRelations.length,
    contentHash: `sha256:v1:${createHash('sha256').update(stableJson(world)).digest('hex')}`,
  });
}

export function buildCoherentContentRelease(
  releaseId: string,
  characters: CharacterContentManifest,
  world: WorldContentManifest,
): CoherentContentRelease {
  const normalizedReleaseId = releaseId.trim();
  if (normalizedReleaseId.length === 0) throw new Error('releaseId must not be empty');
  if (characters.bundleId !== world.bundleId) throw new Error('release manifests must share bundleId');
  if (characters.contentVersion !== world.contentVersion) throw new Error('release manifests must share contentVersion');
  return Object.freeze({
    releaseId: normalizedReleaseId,
    bundleId: characters.bundleId,
    contentVersion: characters.contentVersion,
    characterContentHash: characters.contentHash,
    worldContentHash: world.contentHash,
    minClientCapability: characters.minClientCapability,
  });
}
