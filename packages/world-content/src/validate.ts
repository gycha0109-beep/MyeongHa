import type { CharacterContentBundle } from '../../character-content/src/index.js';
import type { WorldContentBundle } from './schema.js';

export class WorldContentValidationError extends Error {}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new WorldContentValidationError(`${path} must not be empty`);
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new WorldContentValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

export function validateWorldContentBundle(world: WorldContentBundle, characters: CharacterContentBundle): WorldContentBundle {
  nonEmpty(world.bundleId, 'bundleId');
  nonEmpty(world.contentVersion, 'contentVersion');
  if (world.bundleId !== characters.bundleId) throw new WorldContentValidationError('world and character bundleId must match');
  if (world.contentVersion !== characters.contentVersion) throw new WorldContentValidationError('world and character contentVersion must match');

  const characterIds = new Set(characters.characters.map((character) => character.characterId));
  unique(world.episodes.map((episode) => episode.episodeId), 'episodeIds');
  unique(world.characterRelations.map((relation) => `${relation.fromCharacterId}->${relation.toCharacterId}:${relation.relationType}`), 'characterRelations');

  for (const relation of world.characterRelations) {
    nonEmpty(relation.relationType, 'relation.relationType');
    nonEmpty(relation.summary, 'relation.summary');
    if (!characterIds.has(relation.fromCharacterId) || !characterIds.has(relation.toCharacterId)) throw new WorldContentValidationError('character relation references character outside bundle');
    if (relation.fromCharacterId === relation.toCharacterId) throw new WorldContentValidationError('self relation is not allowed');
  }

  for (const episode of world.episodes) {
    nonEmpty(episode.episodeId, 'episode.episodeId');
    nonEmpty(episode.title, `${episode.episodeId}.title`);
    nonEmpty(episode.synopsis, `${episode.episodeId}.synopsis`);
    nonEmpty(episode.unlockRuleId, `${episode.episodeId}.unlockRuleId`);
    if (episode.contentVersion !== world.contentVersion) throw new WorldContentValidationError(`${episode.episodeId}.contentVersion must match world contentVersion`);
    if (episode.participants.length === 0) throw new WorldContentValidationError(`${episode.episodeId}.participants must not be empty`);
    unique(episode.participants.map((participant) => participant.characterId), `${episode.episodeId}.participants`);
    const leadCount = episode.participants.filter((participant) => participant.role === 'lead').length;
    if (leadCount !== 1) throw new WorldContentValidationError(`${episode.episodeId} must have exactly one lead participant`);
    for (const participant of episode.participants) {
      if (!characterIds.has(participant.characterId)) throw new WorldContentValidationError(`${episode.episodeId} references character outside bundle`);
    }
  }

  return world;
}
