import type { CharacterContentBundle, CharacterContentDefinition } from './schema.js';
import {
  buildCharacterContentManifest,
  type CharacterContentManifest,
} from './release.js';
import { validateCharacterContentBundle } from './validate.js';

export const MIN_PRODUCTION_CHARACTER_ROSTER = 5;

export type ProductionCharacterContentValidationCode =
  | 'PRODUCTION_ROSTER_TOO_SMALL'
  | 'DEVELOPMENT_PLACEHOLDER_FORBIDDEN'
  | 'ASSET_MANIFEST_HASH_REQUIRED'
  | 'CHARACTER_GENDER_CANON_REQUIRED'
  | 'CHARACTER_VISUAL_CANON_REQUIRED';

export class ProductionCharacterContentValidationError extends Error {
  constructor(
    readonly code: ProductionCharacterContentValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProductionCharacterContentValidationError';
  }
}

function isDevelopmentPlaceholder(
  character: CharacterContentDefinition,
): boolean {
  return character.developmentPlaceholder === true;
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

  const scalarValues = [
    visual.visualVersion,
    visual.visualDirection,
    visual.silhouette,
    visual.costumeDirection,
  ];
  if (scalarValues.some((value) => value.trim().length === 0)) return false;

  const listValues = [visual.palette, visual.motifs, visual.prohibitedTropes];
  return listValues.every(
    (values) =>
      values.length > 0 && values.every((value) => value.trim().length > 0),
  );
}

/**
 * Production publication boundary for immutable Character canon.
 *
 * Generic bundle validation intentionally permits development placeholders so
 * engineering slices can exercise schemas and runtime contracts. Production
 * publication is stricter: the launch roster must contain at least five real
 * authored characters, no development placeholder may cross this boundary,
 * canonical gender/visual authoring evidence must be present for every roster
 * member, and immutable asset-manifest provenance must already be source-backed.
 *
 * Character identity/content is never inferred here from UI presentation keys
 * or runtime database rows. The supplied bundle must already be source-backed
 * Git/versioned authored content.
 */
export function validateProductionCharacterContentBundle(
  bundle: CharacterContentBundle,
): CharacterContentBundle {
  validateCharacterContentBundle(bundle);

  if (!hasVersionedAssetManifestHash(bundle)) {
    throw new ProductionCharacterContentValidationError(
      'ASSET_MANIFEST_HASH_REQUIRED',
      'Production character content requires sha256:v1 asset manifest provenance.',
    );
  }

  if (bundle.characters.length < MIN_PRODUCTION_CHARACTER_ROSTER) {
    throw new ProductionCharacterContentValidationError(
      'PRODUCTION_ROSTER_TOO_SMALL',
      `Production character roster requires at least ${MIN_PRODUCTION_CHARACTER_ROSTER} authored characters.`,
    );
  }

  const placeholder = bundle.characters.find(isDevelopmentPlaceholder);
  if (placeholder !== undefined) {
    throw new ProductionCharacterContentValidationError(
      'DEVELOPMENT_PLACEHOLDER_FORBIDDEN',
      `Development placeholder cannot be published to Production: ${placeholder.characterId}`,
    );
  }

  const missingGender = bundle.characters.find(
    (character) => !hasAuthoredGender(character),
  );
  if (missingGender !== undefined) {
    throw new ProductionCharacterContentValidationError(
      'CHARACTER_GENDER_CANON_REQUIRED',
      `Production character content requires source-authored gender canon: ${missingGender.characterId}`,
    );
  }

  const missingVisual = bundle.characters.find(
    (character) => !hasAuthoredVisual(character),
  );
  if (missingVisual !== undefined) {
    throw new ProductionCharacterContentValidationError(
      'CHARACTER_VISUAL_CANON_REQUIRED',
      `Production character content requires source-authored visual canon: ${missingVisual.characterId}`,
    );
  }

  return bundle;
}

/**
 * Deterministic immutable manifest entrypoint reserved for Production-ready
 * authored character bundles. This does not publish or mutate runtime state.
 */
export function buildProductionCharacterContentManifest(
  bundle: CharacterContentBundle,
): CharacterContentManifest {
  validateProductionCharacterContentBundle(bundle);
  return buildCharacterContentManifest(bundle);
}
