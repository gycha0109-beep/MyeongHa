import type { RelationshipStateBand } from './schema.js';
import {
  type CharacterFaceFollowUpStrategyV1,
  type CharacterFacePresentationContentIdentityV1,
} from './face-presentation.js';

export interface CharacterFaceSafeFollowUpTextsV1 {
  readonly low: string;
  readonly medium: string;
  readonly high: string;
}

export interface CharacterFaceSafeFollowUpCatalogV1 {
  readonly schemaVersion: 'v1';
  readonly catalogVersion: string;
  readonly characterId: string;
  readonly characterContentVersion: string;
  readonly byStrategy: Readonly<
    Record<CharacterFaceFollowUpStrategyV1, CharacterFaceSafeFollowUpTextsV1>
  >;
}

export class CharacterFaceSafeFollowUpContentError extends Error {}

const STRATEGIES = [
  'inspect_dominant_feature',
  'explore_contrast_axis',
  'inspect_local_detail',
] as const satisfies readonly CharacterFaceFollowUpStrategyV1[];

const BANDS = ['low', 'medium', 'high'] as const satisfies readonly RelationshipStateBand[];

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new CharacterFaceSafeFollowUpContentError(`${path} must be non-empty.`);
  }
}

function validateQuestion(text: string, path: string): void {
  nonEmpty(text, path);
  if (text.length > 240) {
    throw new CharacterFaceSafeFollowUpContentError(`${path} exceeds 240 characters.`);
  }
  if (/[{}]/u.test(text)) {
    throw new CharacterFaceSafeFollowUpContentError(`${path} must not contain interpolation tokens.`);
  }
  if (/\r|\n/u.test(text)) {
    throw new CharacterFaceSafeFollowUpContentError(`${path} must be a single-line question.`);
  }
  if (!/[?？]$/u.test(text.trim())) {
    throw new CharacterFaceSafeFollowUpContentError(`${path} must end as a question.`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new CharacterFaceSafeFollowUpContentError(
      `${path} must contain exactly: ${expected.join(', ')}`,
    );
  }
}

export function validateCharacterFaceSafeFollowUpCatalogV1(
  catalog: CharacterFaceSafeFollowUpCatalogV1,
): CharacterFaceSafeFollowUpCatalogV1 {
  if (catalog.schemaVersion !== 'v1') {
    throw new CharacterFaceSafeFollowUpContentError('Face follow-up catalog schemaVersion must be v1.');
  }
  nonEmpty(catalog.catalogVersion, 'faceFollowUp.catalogVersion');
  nonEmpty(catalog.characterId, 'faceFollowUp.characterId');
  nonEmpty(catalog.characterContentVersion, 'faceFollowUp.characterContentVersion');
  assertExactKeys(catalog.byStrategy as Record<string, unknown>, STRATEGIES, 'faceFollowUp.byStrategy');

  for (const strategy of STRATEGIES) {
    const texts = catalog.byStrategy[strategy];
    assertExactKeys(texts as unknown as Record<string, unknown>, BANDS, `faceFollowUp.byStrategy.${strategy}`);
    for (const band of BANDS) {
      validateQuestion(texts[band], `faceFollowUp.byStrategy.${strategy}.${band}`);
    }
  }
  return catalog;
}

export function validateCharacterFaceSafeFollowUpCatalogForCharacterV1(
  catalog: CharacterFaceSafeFollowUpCatalogV1,
  character: CharacterFacePresentationContentIdentityV1,
): CharacterFaceSafeFollowUpCatalogV1 {
  validateCharacterFaceSafeFollowUpCatalogV1(catalog);
  nonEmpty(character.characterId, 'character.characterId');
  nonEmpty(character.contentVersion, 'character.contentVersion');
  if (catalog.characterId !== character.characterId) {
    throw new CharacterFaceSafeFollowUpContentError(
      `Face follow-up catalog characterId mismatch: ${catalog.characterId} != ${character.characterId}`,
    );
  }
  if (catalog.characterContentVersion !== character.contentVersion) {
    throw new CharacterFaceSafeFollowUpContentError(
      `Face follow-up catalog contentVersion mismatch: ${catalog.characterContentVersion} != ${character.contentVersion}`,
    );
  }
  return catalog;
}
