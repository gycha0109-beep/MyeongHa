import type { CharacterContentBundle } from '../../character-content/src/index.js';
import type { WorldContentBundle } from './schema.js';

export class WorldContentValidationError extends Error {}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new WorldContentValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

export function validateWorldContentBundle(world: WorldContentBundle, characters: CharacterContentBundle): WorldContentBundle {
  if (world.bundleId !== characters.bundleId) throw new WorldContentValidationError('world and character bundleId must match');
  if (world.contentVersion !== characters.contentVersion) throw new WorldContentValidationError('world and character contentVersion must match');

  const characterIds = new Set(characters.characters.map((character) => character.characterId));
  unique(world.episodes.map((episode) => episode.episodeId), 'episodeIds');
  unique(world.characterRelations.map((relation) => `${relation.fromCharacterId}->${relation.toCharacterId}:${relation.relationType}`), 'characterRelations');

  for (const relation of world.characterRelations) {
    if (!characterIds.has(relation.fromCharacterId) || !characterIds.has(relation.toCharacterId)) {
      throw new WorldContentValidationError('character relation references character outside bundle');
    }
    if (relation.fromCharacterId === relation.toCharacterId) throw new WorldContentValidationError('self relation is not allowed');
  }

  for (const episode of world.episodes) {
    unique(episode.participants.map((participant) => participant.characterId), `${episode.episodeId}.participants`);
    for (const participant of episode.participants) {
      if (!characterIds.has(participant.characterId)) throw new WorldContentValidationError(`${episode.episodeId} references character outside bundle`);
    }
  }

  return world;
}
