import { ApiCommandError } from './api-error.js';
import {
  CharacterCatalogReadAuthorityPortErrorV1,
  type CharacterCatalogAvailabilityV1,
  type CharacterCatalogAuthorityRowV1,
  type CharacterCatalogReadAuthorityPortV1,
} from './character-catalog-read.js';

type Awaitable<T> = T | Promise<T>;

/**
 * Bounded public presentation metadata for one Character inside one exact immutable
 * content bundle. Canon/persona/behavior/Saju-profile internals are deliberately
 * excluded until a wider public projection is explicitly authorized.
 */
export interface CharacterDetailContentRowV1 {
  readonly contentBundleId: string;
  readonly characterId: string;
  readonly displayName: string;
  readonly deityProxyLabel: string;
  readonly shortDescriptor: string;
}

export type CharacterDetailContentAuthorityFailureCodeV1 =
  | 'BUNDLE_UNAVAILABLE'
  | 'CHARACTER_UNAVAILABLE'
  | 'INVALID_INPUT';

export class CharacterDetailContentAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: CharacterDetailContentAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterDetailContentAuthorityPortErrorV1';
  }
}

/**
 * Trusted immutable-content authority for one public Character detail projection.
 * The production artifact resolver/storage binding is intentionally not invented
 * here.
 */
export interface CharacterDetailContentAuthorityPortV1 {
  readBundleCharacterDetail(input: {
    readonly contentBundleId: string;
    readonly characterId: string;
  }): Awaitable<readonly CharacterDetailContentRowV1[]>;
}

export interface CharacterDetailReadItemV1 {
  readonly characterId: string;
  readonly displayName: string;
  readonly deityProxyLabel: string;
  readonly shortDescriptor: string;
  readonly catalogAvailability: CharacterCatalogAvailabilityV1;
  readonly catalogEnabled: boolean;
}

export interface CharacterDetailReadResponseV1 {
  readonly contentBundleId: string;
  readonly character: Readonly<CharacterDetailReadItemV1>;
}

export interface ReadCharacterDetailForResolvedBundleInputV1 {
  /**
   * Must already be resolved by a higher authority. This boundary does not choose
   * an active-default release, rollout cohort, subject eligibility, or client
   * compatibility policy.
   */
  readonly resolvedContentBundleId: unknown;
  readonly characterId: unknown;
  /**
   * Reuses the already-defined exact-bundle runtime catalog authority rather than
   * inventing a second database query contract for Character detail.
   */
  readonly catalogAuthorityPort: CharacterCatalogReadAuthorityPortV1;
  readonly contentAuthorityPort: CharacterDetailContentAuthorityPortV1;
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
    throw new Error(`Character detail authority returned an invalid ${name}.`);
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
        'Character detail authority returned an invalid catalog availability.',
      );
  }
}

function projectCatalogTarget(
  characterId: string,
  rows: readonly CharacterCatalogAuthorityRowV1[],
): Readonly<CharacterCatalogAuthorityRowV1> | null {
  let target: Readonly<CharacterCatalogAuthorityRowV1> | null = null;

  for (const row of rows) {
    const rowCharacterId = requireStoredString('character identity', row.characterId);
    if (rowCharacterId !== characterId) continue;

    const catalogAvailability = requireAvailability(row.catalogAvailability);
    if (typeof row.catalogEnabled !== 'boolean') {
      throw new Error(
        'Character detail authority returned an invalid catalog enabled flag.',
      );
    }
    if (target !== null) {
      throw new Error(
        'Character catalog authority returned a duplicate requested character identity.',
      );
    }

    target = Object.freeze({
      characterId: rowCharacterId,
      catalogAvailability,
      catalogEnabled: row.catalogEnabled,
    });
  }

  return target;
}

function projectContentTarget(
  contentBundleId: string,
  characterId: string,
  rows: readonly CharacterDetailContentRowV1[],
): Readonly<CharacterDetailContentRowV1> | null {
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(
      'Character content authority returned more than one detail row.',
    );
  }

  const row = rows[0];
  if (row === undefined) {
    throw new Error('Character content authority returned an invalid detail row set.');
  }

  const rowBundleId = requireStoredString(
    'content bundle identity',
    row.contentBundleId,
  );
  const rowCharacterId = requireStoredString('character identity', row.characterId);
  const displayName = requireStoredString('display name', row.displayName);
  const deityProxyLabel = requireStoredString(
    'deity proxy label',
    row.deityProxyLabel,
  );
  const shortDescriptor = requireStoredString(
    'short descriptor',
    row.shortDescriptor,
  );

  if (rowBundleId !== contentBundleId) {
    throw new Error(
      'Character content authority returned a different content bundle.',
    );
  }
  if (rowCharacterId !== characterId) {
    throw new Error(
      'Character content authority returned a different character identity.',
    );
  }

  return Object.freeze({
    contentBundleId: rowBundleId,
    characterId: rowCharacterId,
    displayName,
    deityProxyLabel,
    shortDescriptor,
  });
}

function mapAuthorityError(error: unknown): never {
  if (error instanceof CharacterCatalogReadAuthorityPortErrorV1) {
    switch (error.code) {
      case 'BUNDLE_UNAVAILABLE':
        throw new ApiCommandError(
          'NOT_FOUND',
          'Character detail is unavailable for the resolved content bundle.',
        );
      case 'INVALID_INPUT':
        throw new ApiCommandError('INVALID_REQUEST', error.message);
    }
  }

  if (error instanceof CharacterDetailContentAuthorityPortErrorV1) {
    switch (error.code) {
      case 'BUNDLE_UNAVAILABLE':
      case 'CHARACTER_UNAVAILABLE':
        throw new ApiCommandError(
          'NOT_FOUND',
          'Character detail is unavailable for the resolved content bundle.',
        );
      case 'INVALID_INPUT':
        throw new ApiCommandError('INVALID_REQUEST', error.message);
    }
  }

  throw error;
}

/**
 * Compose one bounded Character detail projection for an already-resolved immutable
 * bundle.
 *
 * This is intentionally not a complete `GET /api/characters/:id` resolver. The
 * HTTP contract requires subject/cohort/client-capability resolution before this
 * function is entered. Full HTTP activation therefore remains fail-closed.
 */
export async function readCharacterDetailForResolvedBundle(
  input: ReadCharacterDetailForResolvedBundleInputV1,
): Promise<CharacterDetailReadResponseV1> {
  const contentBundleId = requireNonEmptyString(
    'resolvedContentBundleId',
    input.resolvedContentBundleId,
  );
  const characterId = requireNonEmptyString('characterId', input.characterId);

  try {
    const [catalogRows, contentRows] = await Promise.all([
      input.catalogAuthorityPort.readBundleCatalog({ contentBundleId }),
      input.contentAuthorityPort.readBundleCharacterDetail({
        contentBundleId,
        characterId,
      }),
    ]);

    const catalog = projectCatalogTarget(characterId, catalogRows);
    const content = projectContentTarget(contentBundleId, characterId, contentRows);

    if (catalog === null && content === null) {
      throw new ApiCommandError(
        'NOT_FOUND',
        'Character is unavailable in the resolved content bundle.',
      );
    }
    if (catalog === null || content === null) {
      throw new Error(
        'Character runtime catalog and immutable content authority disagree on character membership.',
      );
    }

    return Object.freeze({
      contentBundleId,
      character: Object.freeze({
        characterId,
        displayName: content.displayName,
        deityProxyLabel: content.deityProxyLabel,
        shortDescriptor: content.shortDescriptor,
        catalogAvailability: catalog.catalogAvailability,
        catalogEnabled: catalog.catalogEnabled,
      }),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
