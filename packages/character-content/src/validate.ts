import type { CharacterContentBundle } from './schema.js';

export class CharacterContentValidationError extends Error {}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new CharacterContentValidationError(`${path} must not be empty`);
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new CharacterContentValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

export function validateCharacterContentBundle(bundle: CharacterContentBundle): CharacterContentBundle {
  nonEmpty(bundle.bundleId, 'bundleId');
  nonEmpty(bundle.contentVersion, 'contentVersion');
  nonEmpty(bundle.cueSchemaVersion, 'cueSchemaVersion');
  nonEmpty(bundle.minClientCapability, 'minClientCapability');
  if (bundle.characters.length === 0) throw new CharacterContentValidationError('characters must not be empty');
  unique(bundle.characters.map((character) => character.characterId), 'characterIds');

  for (const character of bundle.characters) {
    nonEmpty(character.characterId, 'character.characterId');
    nonEmpty(character.contentVersion, `${character.characterId}.contentVersion`);
    if (character.contentVersion !== bundle.contentVersion) throw new CharacterContentValidationError(`${character.characterId}.contentVersion must match bundle contentVersion`);
    nonEmpty(character.displayName, `${character.characterId}.displayName`);
    nonEmpty(character.deityProxyLabel, `${character.characterId}.deityProxyLabel`);
    nonEmpty(character.shortDescriptor, `${character.characterId}.shortDescriptor`);
    if (character.capabilities.length === 0) throw new CharacterContentValidationError(`${character.characterId}.capabilities must not be empty`);
    unique(character.capabilities.map((capability) => `${capability.domain}:${capability.role}`), `${character.characterId}.capabilities`);
    unique(character.animationCueIds, `${character.characterId}.animationCueIds`);
    for (const capability of character.capabilities) nonEmpty(capability.capabilityVersion, `${character.characterId}.capabilityVersion`);
  }

  return bundle;
}
