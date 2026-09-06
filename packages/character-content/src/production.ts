import type { CharacterContentBundle, CharacterContentDefinition } from './schema.js';
import {
  buildCharacterContentManifest,
  type CharacterContentManifest,
} from './release.js';
import { validateCharacterContentBundle } from './validate.js';

/**
 * Product-owner-approved MVP Production Launch display-name authority.
 *
 * This fixes Launch membership and official display names only. It does not
 * establish canonical characterId values or any still-open detailed Character
 * canon/persona/behavior/visual/gender authority.
 */
export const MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES = [
  '세연',
  '여울',
  '서린',
  '라현',
  '미라',
  '태겸',
  '윤호',
  '도윤',
  '백헌',
] as const;

export const MVP_PRODUCTION_LAUNCH_CHARACTER_ROSTER_SIZE =
  MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES.length;

/**
 * @deprecated Current MVP Production authority is an exact nine-member roster,
 * not a minimum-size rule. Kept as a compatibility alias for existing imports.
 */
export const MIN_PRODUCTION_CHARACTER_ROSTER =
  MVP_PRODUCTION_LAUNCH_CHARACTER_ROSTER_SIZE;

export type ProductionCharacterContentValidationCode =
  | 'PRODUCTION_ROSTER_COUNT_MISMATCH'
  | 'PRODUCTION_ROSTER_NAME_MISMATCH'
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
 * Fail-closed validation for the Product Owner-approved MVP Launch identity
 * boundary. Exact display names are governed here; canonical IDs and detailed
 * Character content remain governed by their own source-backed authoring.
 */
export function validateMvpProductionLaunchRosterDisplayNames(
  displayNames: readonly string[],
): void {
  if (displayNames.length !== MVP_PRODUCTION_LAUNCH_CHARACTER_ROSTER_SIZE) {
    throw new ProductionCharacterContentValidationError(
      'PRODUCTION_ROSTER_COUNT_MISMATCH',
      `MVP Production Launch roster requires exactly ${MVP_PRODUCTION_LAUNCH_CHARACTER_ROSTER_SIZE} approved characters.`,
    );
  }

  const approved = new Set<string>(MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES);
  const actual = new Set(displayNames);
  const missing = MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES.filter(
    (displayName) => !actual.has(displayName),
  );
  const unexpected = displayNames.filter((displayName) => !approved.has(displayName));

  if (actual.size !== displayNames.length || missing.length > 0 || unexpected.length > 0) {
    throw new ProductionCharacterContentValidationError(
      'PRODUCTION_ROSTER_NAME_MISMATCH',
      `MVP Production Launch roster display names must exactly match the approved nine-name authority; missing=${missing.join(',') || 'none'}; unexpected=${unexpected.join(',') || 'none'}.`,
    );
  }
}

/**
 * Production publication boundary for immutable Character canon.
 *
 * Generic bundle validation intentionally permits development placeholders so
 * engineering slices can exercise schemas and runtime contracts. Production
 * publication is stricter: the launch roster must exactly match the approved
 * nine official display names, no development placeholder may cross this
 * boundary, canonical gender/visual authoring evidence must be present for every
 * roster member, and immutable asset-manifest provenance must already be
 * source-backed.
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

  validateMvpProductionLaunchRosterDisplayNames(
    bundle.characters.map((character) => character.displayName),
  );

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
