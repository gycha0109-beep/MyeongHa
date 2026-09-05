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
  | 'ASSET_MANIFEST_HASH_REQUIRED';

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

/**
 * Production publication boundary for immutable Character canon.
 *
 * Generic bundle validation intentionally permits development placeholders so
 * engineering slices can exercise schemas and runtime contracts. Production
 * publication is stricter: the launch roster must contain at least five real
 * authored characters, no development placeholder may cross this boundary, and
 * immutable asset-manifest provenance must already be source-backed.
 *
 * Character identity/content is never inferred here from UI presentation keys
 * or runtime database rows. The supplied bundle must already be source-backed
 * Git/versioned authored content.
 */
export function validateProductionCharacterContentBundle(
  bundle: CharacterContentBundle,
): CharacterContentBundle {
  validateCharacterContentBundle(bundle);

  if (bundle.assetManifestHash.trim().length === 0) {
    throw new ProductionCharacterContentValidationError(
      'ASSET_MANIFEST_HASH_REQUIRED',
      'Production character content requires immutable asset manifest provenance.',
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
