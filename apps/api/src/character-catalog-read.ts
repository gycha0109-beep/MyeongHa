import { ApiCommandError } from './api-error.js';

export const CHARACTER_CATALOG_READ_AUTHORITY_BINDING_V1 =
  'public.qry_character_bundle_catalog_v1' as const;

export type CharacterCatalogAvailabilityV1 =
  | 'available'
  | 'unlockable'
  | 'locked'
  | 'coming_soon';

export interface CharacterCatalogAuthorityRowV1 {
  readonly characterId: string;
  readonly catalogAvailability: CharacterCatalogAvailabilityV1;
  readonly catalogEnabled: boolean;
}

/**
 * Bounded presentation data loaded from the immutable versioned Character content
 * bound to the already-resolved content bundle. Canon/persona/behavior internals
 * are deliberately excluded from this public-read composition boundary.
 */
export interface CharacterCatalogContentRowV1 {
  readonly contentBundleId: string;
  readonly characterId: string;
  readonly displayName: string;
}

export type CharacterCatalogReadAuthorityFailureCodeV1 =
  | 'BUNDLE_UNAVAILABLE'
  | 'INVALID_INPUT';

export class CharacterCatalogReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: CharacterCatalogReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterCatalogReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Operational catalog authority for one exact immutable content bundle.
 * A production adapter may bind this to `qry_character_bundle_catalog_v1`.
 * P0-AUTH-01 remains outside this contract; the port does not define PostgreSQL
 * execution identity.
 */
export interface CharacterCatalogReadAuthorityPortV1 {
  readBundleCatalog(input: {
    readonly contentBundleId: string;
  }): Awaitable<readonly CharacterCatalogAuthorityRowV1[]>;
}

/**
 * Trusted immutable-content authority for presentation metadata in the same exact
 * bundle. The production artifact resolver/storage binding is intentionally not
 * invented here.
 */
export interface CharacterCatalogContentAuthorityPortV1 {
  readBundleCharacterContent(input: {
    readonly contentBundleId: string;
  }): Awaitable<readonly CharacterCatalogContentRowV1[]>;
}

export interface CharacterCatalogReadItemV1 {
  readonly characterId: string;
  readonly displayName: string;
  readonly catalogAvailability: CharacterCatalogAvailabilityV1;
  readonly catalogEnabled: boolean;
}

export interface CharacterCatalogReadResponseV1 {
  readonly contentBundleId: string;
  readonly characters: readonly Readonly<CharacterCatalogReadItemV1>[];
}

export interface ReadCharacterCatalogForResolvedBundleInputV1 {
  /**
   * Must already be resolved by a higher authority. This boundary does not choose
   * an active-default release, rollout cohort, subject eligibility, or client
   * compatibility policy.
   */
  readonly resolvedContentBundleId: unknown;
  readonly catalogAuthorityPort: CharacterCatalogReadAuthorityPortV1;
  readonly contentAuthorityPort: CharacterCatalogContentAuthorityPortV1;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      `${name} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Character catalog authority returned an invalid ${name}.`);
  }
  return value;
}

function requireAvailability(value: unknown): CharacterCatalogAvailabilityV1 {
  switch (value) {
    case 'available':
    case 'unlockable':
    case 'locked':
    case 'coming_soon':
      return value;
    default:
      throw new Error(
        'Character catalog authority returned an invalid catalog availability.',
      );
  }
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof CharacterCatalogReadAuthorityPortErrorV1)) {
    throw error;
  }

  switch (error.code) {
    case 'BUNDLE_UNAVAILABLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Character catalog is unavailable for the resolved content bundle.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function indexCatalogRows(
  rows: readonly CharacterCatalogAuthorityRowV1[],
): ReadonlyMap<string, Readonly<CharacterCatalogAuthorityRowV1>> {
  const indexed = new Map<string, Readonly<CharacterCatalogAuthorityRowV1>>();

  for (const row of rows) {
    const characterId = requireStoredString('character identity', row.characterId);
    const catalogAvailability = requireAvailability(row.catalogAvailability);
    if (typeof row.catalogEnabled !== 'boolean') {
      throw new Error(
        'Character catalog authority returned an invalid catalog enabled flag.',
      );
    }
    if (indexed.has(characterId)) {
      throw new Error(
        'Character catalog authority returned a duplicate character identity.',
      );
    }
    indexed.set(
      characterId,
      Object.freeze({
        characterId,
        catalogAvailability,
        catalogEnabled: row.catalogEnabled,
      }),
    );
  }

  return indexed;
}

function indexContentRows(
  contentBundleId: string,
  rows: readonly CharacterCatalogContentRowV1[],
): ReadonlyMap<string, Readonly<CharacterCatalogContentRowV1>> {
  const indexed = new Map<string, Readonly<CharacterCatalogContentRowV1>>();

  for (const row of rows) {
    const rowBundleId = requireStoredString(
      'content bundle identity',
      row.contentBundleId,
    );
    const characterId = requireStoredString('character identity', row.characterId);
    const displayName = requireStoredString('display name', row.displayName);

    if (rowBundleId !== contentBundleId) {
      throw new Error(
        'Character content authority returned a different content bundle.',
      );
    }
    if (indexed.has(characterId)) {
      throw new Error(
        'Character content authority returned a duplicate character identity.',
      );
    }

    indexed.set(
      characterId,
      Object.freeze({
        contentBundleId: rowBundleId,
        characterId,
        displayName,
      }),
    );
  }

  return indexed;
}

function assembleCharacterCatalog(
  contentBundleId: string,
  catalogRows: readonly CharacterCatalogAuthorityRowV1[],
  contentRows: readonly CharacterCatalogContentRowV1[],
): CharacterCatalogReadResponseV1 {
  const catalogById = indexCatalogRows(catalogRows);
  const contentById = indexContentRows(contentBundleId, contentRows);

  if (catalogById.size !== contentById.size) {
    throw new Error(
      'Character runtime catalog and immutable content authority disagree on bundle membership.',
    );
  }

  const characters = [...catalogById.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((characterId) => {
      const catalog = catalogById.get(characterId);
      const content = contentById.get(characterId);
      if (catalog === undefined || content === undefined) {
        throw new Error(
          'Character runtime catalog and immutable content authority disagree on character identity.',
        );
      }

      return Object.freeze({
        characterId,
        displayName: content.displayName,
        catalogAvailability: catalog.catalogAvailability,
        catalogEnabled: catalog.catalogEnabled,
      });
    });

  return Object.freeze({
    contentBundleId,
    characters: Object.freeze(characters),
  });
}

/**
 * Compose the bounded Character catalog for an already-resolved immutable bundle.
 *
 * This is intentionally not a complete `GET /api/characters` resolver. The HTTP
 * contract requires subject/cohort/client-capability resolution, while the current
 * active-default DB projection explicitly does not decide those policies. Callers
 * must therefore resolve the exact bundle before entering this function.
 */
export async function readCharacterCatalogForResolvedBundle(
  input: ReadCharacterCatalogForResolvedBundleInputV1,
): Promise<CharacterCatalogReadResponseV1> {
  const contentBundleId = requireNonEmptyString(
    'resolvedContentBundleId',
    input.resolvedContentBundleId,
  );

  try {
    const [catalogRows, contentRows] = await Promise.all([
      input.catalogAuthorityPort.readBundleCatalog({ contentBundleId }),
      input.contentAuthorityPort.readBundleCharacterContent({ contentBundleId }),
    ]);
    return assembleCharacterCatalog(contentBundleId, catalogRows, contentRows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
