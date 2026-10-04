import {
  resolveCharacterRuntimeAuthorityLaneV1,
  type CharacterRuntimeAuthorityProvenanceV1,
} from '../../character-content/src/index.js';
import type {
  CharacterPersonaProfile,
  CharacterSpeechProfile,
} from '../../character-content/src/schema.js';

export const CHARACTER_FACE_NAMED_AUTHORING_SOURCE_SCHEMA_VERSION_V1 =
  'character-face-named-authoring-source-v1' as const;

export const CHARACTER_FACE_NAMED_AUTHORING_AUTHORITY_SOURCE_V1 =
  'character_runtime_authority_lane_v1' as const;

export interface CharacterFaceNamedAuthoringSourceV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_NAMED_AUTHORING_SOURCE_SCHEMA_VERSION_V1;
  readonly authoritySource:
    typeof CHARACTER_FACE_NAMED_AUTHORING_AUTHORITY_SOURCE_V1;
  readonly characterId: string;
  /**
   * Downstream Face profiles use the Character runtime-authority version as
   * their source content version. This value is deterministic and cannot be
   * supplied by the caller.
   */
  readonly contentVersion: string;
  readonly provenance: CharacterRuntimeAuthorityProvenanceV1;
  readonly speech: CharacterSpeechProfile;
  readonly communication: CharacterPersonaProfile['communication'];
  readonly questioning: CharacterPersonaProfile['questioning'];
}

/**
 * Resolves a named Character Face authoring source only from an admitted
 * per-Character runtime-authority lane.
 *
 * This source intentionally contains no Face semantic authoring. It provides
 * Character identity, reviewed voice/communication/questioning authority, and
 * immutable provenance for downstream bounded Face profiles.
 */
export function resolveCharacterFaceNamedAuthoringSourceV1(
  characterId: string,
): CharacterFaceNamedAuthoringSourceV1 | null {
  const lane =
    resolveCharacterRuntimeAuthorityLaneV1(characterId);
  if (lane === null) return null;

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_NAMED_AUTHORING_SOURCE_SCHEMA_VERSION_V1,
    authoritySource:
      CHARACTER_FACE_NAMED_AUTHORING_AUTHORITY_SOURCE_V1,
    characterId: lane.characterId,
    contentVersion: lane.authorityVersion,
    provenance: lane.provenance,
    speech: lane.speech,
    communication: lane.communication,
    questioning: lane.questioning,
  });
}
