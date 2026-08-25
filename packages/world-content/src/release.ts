import { createHash } from 'node:crypto';
import type { WorldContentBundle } from './schema.js';
import { validateWorldContentBundle } from './validate.js';
import type { CharacterContentBundle } from '../../character-content/src/index.js';

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
  return {
    bundleId: world.bundleId,
    contentVersion: world.contentVersion,
    episodeIds: world.episodes.map((episode) => episode.episodeId).sort(),
    relationCount: world.characterRelations.length,
    contentHash: `sha256:${createHash('sha256').update(stableJson(world)).digest('hex')}`,
  };
}
