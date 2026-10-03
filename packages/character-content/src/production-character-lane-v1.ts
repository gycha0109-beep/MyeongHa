import {
  CHARACTER_IMMUTABLE_AUTHORING_V1,
  type CharacterImmutableAuthoringV1CharacterId,
} from './immutable-authoring-v1.js';
import {
  buildCharacterContentManifest,
  type CharacterContentManifest,
} from './release.js';
import type {
  CharacterContentBundle,
  CharacterContentDefinition,
} from './schema.js';
import { validateCharacterContentBundle } from './validate.js';
import { validateProductionCharacterPublicationMaterials } from './production.js';

export const PRODUCTION_CHARACTER_PUBLICATION_LANE_SCHEMA_VERSION_V1 =
  'production-character-publication-lane-v1' as const;

export type ProductionCharacterPublicationLaneValidationCodeV1 =
  | 'CHARACTER_LANE_EXACTLY_ONE_CHARACTER_REQUIRED'
  | 'CHARACTER_LANE_ASSET_MANIFEST_HASH_REQUIRED'
  | 'CHARACTER_LANE_CHARACTER_ID_NOT_APPROVED'
  | 'CHARACTER_LANE_DISPLAY_NAME_MISMATCH'
  | 'CHARACTER_LANE_DEVELOPMENT_PLACEHOLDER_FORBIDDEN'
  | 'CHARACTER_LANE_GENDER_CANON_REQUIRED'
  | 'CHARACTER_LANE_VISUAL_CANON_REQUIRED';

export class ProductionCharacterPublicationLaneValidationErrorV1
  extends Error {
  constructor(
    readonly code: ProductionCharacterPublicationLaneValidationCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ProductionCharacterPublicationLaneValidationErrorV1';
  }
}

export interface ProductionCharacterPublicationLaneManifestV1
  extends CharacterContentManifest {
  readonly schemaVersion:
    typeof PRODUCTION_CHARACTER_PUBLICATION_LANE_SCHEMA_VERSION_V1;
  readonly characterId: CharacterImmutableAuthoringV1CharacterId;
  readonly displayName: string;
}

function fail(
  code: ProductionCharacterPublicationLaneValidationCodeV1,
  message: string,
): never {
  throw new ProductionCharacterPublicationLaneValidationErrorV1(
    code,
    message,
  );
}

function hasVersionedAssetManifestHash(bundle: CharacterContentBundle): boolean {
  return /^sha256:v1:[0-9a-f]{64}$/iu.test(bundle.assetManifestHash);
}

function hasAuthoredGender(character: CharacterContentDefinition): boolean {
  return character.gender !== undefined && character.gender.trim().length > 0;
}

function hasAuthoredVisual(character: CharacterContentDefinition): boolean {
  const visual = character.visual;
  if (visual === undefined) return false;

  if (
    [
      visual.visualVersion,
      visual.visualDirection,
      visual.silhouette,
      visual.costumeDirection,
    ].some((value) => value.trim().length === 0)
  ) {
    return false;
  }

  return [
    visual.palette,
    visual.motifs,
    visual.prohibitedTropes,
  ].every(
    (values) =>
      values.length > 0 &&
      values.every((value) => value.trim().length > 0),
  );
}

function resolveApprovedCharacter(
  characterId: string,
): (typeof CHARACTER_IMMUTABLE_AUTHORING_V1)[number] | undefined {
  return CHARACTER_IMMUTABLE_AUTHORING_V1.find(
    (entry) => entry.characterId === characterId,
  );
}

/**
 * Production validation for one independent Character publication lane.
 *
 * This does not weaken the exact-nine MVP Launch gate. It only permits one
 * already source-complete Character to be validated and published in its own
 * immutable bundle so that independent active non-default releases can exist.
 */
export function validateProductionCharacterPublicationLaneBundleV1(
  bundle: CharacterContentBundle,
): CharacterContentBundle {
  validateCharacterContentBundle(bundle);

  if (!hasVersionedAssetManifestHash(bundle)) {
    fail(
      'CHARACTER_LANE_ASSET_MANIFEST_HASH_REQUIRED',
      'Character publication lane requires sha256:v1 asset manifest provenance.',
    );
  }

  if (bundle.characters.length !== 1) {
    fail(
      'CHARACTER_LANE_EXACTLY_ONE_CHARACTER_REQUIRED',
      'Character publication lane bundle must contain exactly one Character.',
    );
  }

  const character = bundle.characters[0];
  if (character === undefined) {
    fail(
      'CHARACTER_LANE_EXACTLY_ONE_CHARACTER_REQUIRED',
      'Character publication lane bundle must contain exactly one Character.',
    );
  }

  const approved = resolveApprovedCharacter(character.characterId);
  if (approved === undefined) {
    fail(
      'CHARACTER_LANE_CHARACTER_ID_NOT_APPROVED',
      `Character publication lane characterId is not in approved immutable authoring: ${character.characterId}`,
    );
  }

  if (character.displayName !== approved.displayName) {
    fail(
      'CHARACTER_LANE_DISPLAY_NAME_MISMATCH',
      `Character publication lane display name does not match approved immutable authoring: ${character.characterId}`,
    );
  }

  if (character.developmentPlaceholder === true) {
    fail(
      'CHARACTER_LANE_DEVELOPMENT_PLACEHOLDER_FORBIDDEN',
      `Development placeholder cannot enter a Production Character lane: ${character.characterId}`,
    );
  }

  if (!hasAuthoredGender(character)) {
    fail(
      'CHARACTER_LANE_GENDER_CANON_REQUIRED',
      `Production Character lane requires source-authored gender canon: ${character.characterId}`,
    );
  }

  if (!hasAuthoredVisual(character)) {
    fail(
      'CHARACTER_LANE_VISUAL_CANON_REQUIRED',
      `Production Character lane requires source-authored visual canon: ${character.characterId}`,
    );
  }

  validateProductionCharacterPublicationMaterials(character);
  return bundle;
}

export function buildProductionCharacterPublicationLaneManifestV1(
  bundle: CharacterContentBundle,
): ProductionCharacterPublicationLaneManifestV1 {
  validateProductionCharacterPublicationLaneBundleV1(bundle);

  const character = bundle.characters[0];
  if (character === undefined) {
    fail(
      'CHARACTER_LANE_EXACTLY_ONE_CHARACTER_REQUIRED',
      'Character publication lane bundle must contain exactly one Character.',
    );
  }

  const manifest = buildCharacterContentManifest(bundle);
  return Object.freeze({
    ...manifest,
    schemaVersion:
      PRODUCTION_CHARACTER_PUBLICATION_LANE_SCHEMA_VERSION_V1,
    characterId:
      character.characterId as CharacterImmutableAuthoringV1CharacterId,
    displayName: character.displayName,
  });
}
