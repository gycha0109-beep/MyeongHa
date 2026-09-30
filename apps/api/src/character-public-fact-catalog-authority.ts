import type {
  CharacterFactRegistryAuthorityRowV1,
} from './character-fact-registry-authority.js';

export const CHARACTER_PUBLIC_FACT_CATALOG_MAX_ROWS_V1 = 64 as const;

export type CharacterPublicFactCatalogRowV1 = Omit<
  CharacterFactRegistryAuthorityRowV1,
  'sourceAuthority' | 'characterKnowledge' | 'disclosureDefault' | 'value'
> & {
  readonly sourceAuthority: 'CANON' | 'SOFT_CANON';
  readonly characterKnowledge: 'KNOWN';
  readonly disclosureDefault: 'PUBLIC';
  readonly value: unknown;
};

export interface CharacterPublicFactCatalogReadAuthorityPortV1 {
  readPublicFacts(input: {
    readonly releaseId: string;
    readonly characterId: string;
  }): Promise<readonly CharacterFactRegistryAuthorityRowV1[]>;
}

export type CharacterPublicFactCatalogAuthorityErrorCodeV1 =
  | 'INVALID_SELECTOR'
  | 'PROVENANCE_MISMATCH'
  | 'INVALID_CATALOG'
  | 'CATALOG_TOO_LARGE';

export class CharacterPublicFactCatalogAuthorityErrorV1 extends Error {
  override readonly name = 'CharacterPublicFactCatalogAuthorityErrorV1';

  constructor(
    readonly code: CharacterPublicFactCatalogAuthorityErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}

function requiredSelector(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 160) {
    throw new CharacterPublicFactCatalogAuthorityErrorV1(
      'INVALID_SELECTOR',
      `${path} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function requiredRowText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new CharacterPublicFactCatalogAuthorityErrorV1(
      'INVALID_CATALOG',
      `${path} is invalid.`,
    );
  }
  return normalized;
}

/**
 * Reads the entire bounded PUBLIC Character fact catalog for one exact pinned
 * release / Character. This removes any need for an LLM or caller to decide
 * which fact key should be queried before generation.
 */
export async function getCharacterPublicFactCatalogV1(input: {
  readonly releaseId: string;
  readonly characterId: string;
  readonly authorityPort: CharacterPublicFactCatalogReadAuthorityPortV1;
}): Promise<readonly CharacterPublicFactCatalogRowV1[]> {
  const releaseId = requiredSelector(input.releaseId, 'releaseId');
  const characterId = requiredSelector(input.characterId, 'characterId');

  const rows = await input.authorityPort.readPublicFacts({
    releaseId,
    characterId,
  });

  if (rows.length > CHARACTER_PUBLIC_FACT_CATALOG_MAX_ROWS_V1) {
    throw new CharacterPublicFactCatalogAuthorityErrorV1(
      'CATALOG_TOO_LARGE',
      'PUBLIC Character fact catalog exceeds the v1 bound.',
    );
  }

  const seen = new Set<string>();
  let previousFactKey: string | null = null;

  const validated = rows.map((row, index) => {
    if (row.releaseId !== releaseId || row.characterId !== characterId) {
      throw new CharacterPublicFactCatalogAuthorityErrorV1(
        'PROVENANCE_MISMATCH',
        'PUBLIC Character fact catalog row does not match the requested release / Character.',
      );
    }

    const factKey = requiredRowText(row.factKey, `rows[${index}].factKey`);
    if (seen.has(factKey)) {
      throw new CharacterPublicFactCatalogAuthorityErrorV1(
        'INVALID_CATALOG',
        `Duplicate PUBLIC Character fact key: ${factKey}`,
      );
    }
    seen.add(factKey);

    if (previousFactKey !== null && previousFactKey.localeCompare(factKey) >= 0) {
      throw new CharacterPublicFactCatalogAuthorityErrorV1(
        'INVALID_CATALOG',
        'PUBLIC Character fact catalog must be strictly sorted by fact key.',
      );
    }
    previousFactKey = factKey;

    if (
      (row.sourceAuthority !== 'CANON' &&
        row.sourceAuthority !== 'SOFT_CANON') ||
      row.characterKnowledge !== 'KNOWN' ||
      row.disclosureDefault !== 'PUBLIC' ||
      row.value === undefined
    ) {
      throw new CharacterPublicFactCatalogAuthorityErrorV1(
        'INVALID_CATALOG',
        'PUBLIC Character fact catalog contains a non-admissible row.',
      );
    }

    requiredRowText(row.sourceSection, `rows[${index}].sourceSection`);
    requiredRowText(
      row.sourceBibleDocument,
      `rows[${index}].sourceBibleDocument`,
    );
    requiredRowText(
      row.sourceBibleRevision,
      `rows[${index}].sourceBibleRevision`,
    );

    return Object.freeze({
      ...row,
      factKey,
      sourceAuthority: row.sourceAuthority,
      characterKnowledge: 'KNOWN' as const,
      disclosureDefault: 'PUBLIC' as const,
      value: row.value,
    }) satisfies CharacterPublicFactCatalogRowV1;
  });

  return Object.freeze(validated);
}
