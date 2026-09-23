export interface CanonicalCharacterPresentationV1 {
  readonly presentationKey: string;
  readonly name: string;
  readonly title: string;
}

export const CANONICAL_CHARACTER_IDS_V1: readonly string[];

export function resolveCanonicalCharacterPresentationV1(
  characterId: unknown,
): CanonicalCharacterPresentationV1 | null;

export function resolveCanonicalCharacterPresentationKeyV1(
  characterId: unknown,
): string | null;
