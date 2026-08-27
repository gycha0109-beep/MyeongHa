import type { CharacterContentDefinition } from './schema.js';

export type CharacterFacePresentationModeV1 =
  | 'strongest_first'
  | 'contrast_first'
  | 'detail_first';

export interface CharacterFacePresentationProfileV1 {
  readonly schemaVersion: 'v1';
  readonly profileVersion: string;
  readonly characterId: string;
  readonly characterContentVersion: string;
  readonly mode: CharacterFacePresentationModeV1;
}

export type CharacterFacePresentationContentIdentityV1 = Pick<
  CharacterContentDefinition,
  'characterId' | 'contentVersion'
>;

export class CharacterFacePresentationContentError extends Error {}

const PRESENTATION_MODES = new Set<CharacterFacePresentationModeV1>([
  'strongest_first',
  'contrast_first',
  'detail_first',
]);

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new CharacterFacePresentationContentError(`${path} must be non-empty.`);
  }
}

export function validateCharacterFacePresentationProfileV1(
  profile: CharacterFacePresentationProfileV1,
): CharacterFacePresentationProfileV1 {
  if (profile.schemaVersion !== 'v1') {
    throw new CharacterFacePresentationContentError('face presentation profile schemaVersion must be v1.');
  }
  nonEmpty(profile.profileVersion, 'facePresentation.profileVersion');
  nonEmpty(profile.characterId, 'facePresentation.characterId');
  nonEmpty(profile.characterContentVersion, 'facePresentation.characterContentVersion');
  if (!PRESENTATION_MODES.has(profile.mode)) {
    throw new CharacterFacePresentationContentError(`Unsupported face presentation mode: ${String(profile.mode)}`);
  }
  return profile;
}

export function validateCharacterFacePresentationProfileForCharacterV1(
  profile: CharacterFacePresentationProfileV1,
  character: CharacterFacePresentationContentIdentityV1,
): CharacterFacePresentationProfileV1 {
  validateCharacterFacePresentationProfileV1(profile);
  nonEmpty(character.characterId, 'character.characterId');
  nonEmpty(character.contentVersion, 'character.contentVersion');
  if (profile.characterId !== character.characterId) {
    throw new CharacterFacePresentationContentError(
      `Face presentation profile characterId mismatch: ${profile.characterId} != ${character.characterId}`,
    );
  }
  if (profile.characterContentVersion !== character.contentVersion) {
    throw new CharacterFacePresentationContentError(
      `Face presentation profile contentVersion mismatch: ${profile.characterContentVersion} != ${character.contentVersion}`,
    );
  }
  return profile;
}
