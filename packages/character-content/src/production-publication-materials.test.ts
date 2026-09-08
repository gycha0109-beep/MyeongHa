import { describe, expect, it } from 'vitest';

import {
  ProductionCharacterContentValidationError,
  validateProductionCharacterPublicationMaterials,
  type ProductionCharacterPublicationMaterials,
} from './production.js';

function materialFixture(
  overrides: Partial<ProductionCharacterPublicationMaterials> = {},
): ProductionCharacterPublicationMaterials {
  return {
    characterId: 'character-under-test',
    assetRefs: ['fixture://character/concept-art'],
    emotionIds: ['neutral'],
    animationCueIds: ['idle'],
    ...overrides,
  };
}

function expectMaterialError(
  candidate: ProductionCharacterPublicationMaterials,
  expectedCode:
    | 'CHARACTER_ASSET_REFS_REQUIRED'
    | 'CHARACTER_EMOTION_IDS_REQUIRED'
    | 'CHARACTER_ANIMATION_CUE_IDS_REQUIRED',
): void {
  try {
    validateProductionCharacterPublicationMaterials(candidate);
    throw new Error('expected Production publication material validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ProductionCharacterContentValidationError);
    expect((error as ProductionCharacterContentValidationError).code).toBe(expectedCode);
  }
}

describe('Production Character publication material guard', () => {
  it('accepts a candidate only when concrete asset, emotion, and animation values are present', () => {
    expect(() => validateProductionCharacterPublicationMaterials(materialFixture())).not.toThrow();
  });

  it('fails closed while concept-art asset refs are absent', () => {
    expectMaterialError(
      materialFixture({ assetRefs: [] }),
      'CHARACTER_ASSET_REFS_REQUIRED',
    );
  });

  it('fails closed while renderer emotion IDs are absent', () => {
    expectMaterialError(
      materialFixture({ emotionIds: undefined }),
      'CHARACTER_EMOTION_IDS_REQUIRED',
    );
    expectMaterialError(
      materialFixture({ emotionIds: [] }),
      'CHARACTER_EMOTION_IDS_REQUIRED',
    );
  });

  it('fails closed while animation cue IDs are absent', () => {
    expectMaterialError(
      materialFixture({ animationCueIds: [] }),
      'CHARACTER_ANIMATION_CUE_IDS_REQUIRED',
    );
  });

  it('does not treat whitespace placeholders as concrete publication material', () => {
    expectMaterialError(
      materialFixture({ assetRefs: ['   '] }),
      'CHARACTER_ASSET_REFS_REQUIRED',
    );
    expectMaterialError(
      materialFixture({ emotionIds: ['   '] }),
      'CHARACTER_EMOTION_IDS_REQUIRED',
    );
    expectMaterialError(
      materialFixture({ animationCueIds: ['   '] }),
      'CHARACTER_ANIMATION_CUE_IDS_REQUIRED',
    );
  });
});
