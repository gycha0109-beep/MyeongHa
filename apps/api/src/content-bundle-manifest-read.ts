import { ApiCommandError } from './chat-receive.js';

export const CONTENT_BUNDLE_MANIFEST_READ_AUTHORITY_BINDING_V1 =
  'public.qry_content_bundle_manifest_v1' as const;

export interface ContentBundleManifestAuthorityRowV1 {
  readonly contentVersion: string;
  readonly minClientCapability: string;
  readonly characterIds: readonly string[];
  readonly assetManifestHash: string;
  readonly cueSchemaVersion: string;
}

export type ContentBundleManifestReadAuthorityFailureCodeV1 =
  | 'BUNDLE_UNAVAILABLE'
  | 'INVALID_INPUT';

export class ContentBundleManifestReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ContentBundleManifestReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ContentBundleManifestReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the bounded manifest projection of one explicit immutable content bundle.
 * A production adapter may bind this to `qry_content_bundle_manifest_v1`.
 *
 * This port does not select a release, resolve a subject cohort, compare client
 * capabilities, decide asset/cue compatibility, or choose a fallback. Those
 * decisions remain blocked by SRC-15 and SRC-16. P0-AUTH-01 remains outside this
 * contract and no PostgreSQL execution identity is implied here.
 */
export interface ContentBundleManifestReadAuthorityPortV1 {
  readBundleManifest(input: {
    readonly contentBundleId: string;
  }): Awaitable<ContentBundleManifestAuthorityRowV1>;
}

export interface ContentManifestV1 {
  readonly contentVersion: string;
  readonly minClientCapability: string;
  readonly characterIds: readonly string[];
  readonly assetManifestHash: string;
  readonly cueSchemaVersion: string;
}

export interface ContentBundleManifestReadResponseV1 {
  readonly contentBundleId: string;
  readonly manifest: Readonly<ContentManifestV1>;
}

export interface GetContentBundleManifestInputV1 {
  /** Explicit immutable bundle identity. This boundary never resolves a rollout. */
  readonly contentBundleId: unknown;
  readonly authorityPort: ContentBundleManifestReadAuthorityPortV1;
}

function requireNonEmptyInput(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Content bundle manifest authority returned an invalid ${name}.`);
  }
  return value;
}

function requireCharacterIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error('Content bundle manifest authority returned invalid character identities.');
  }

  const seen = new Set<string>();
  const characterIds = value.map((entry) => {
    const characterId = requireStoredString('character identity', entry);
    if (seen.has(characterId)) {
      throw new Error('Content bundle manifest authority returned duplicate character identity.');
    }
    seen.add(characterId);
    return characterId;
  });

  return Object.freeze(characterIds);
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof ContentBundleManifestReadAuthorityPortErrorV1)) {
    throw error;
  }

  switch (error.code) {
    case 'BUNDLE_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Content bundle manifest is unavailable.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleManifest(
  contentBundleId: string,
  row: ContentBundleManifestAuthorityRowV1,
): ContentBundleManifestReadResponseV1 {
  const manifest = Object.freeze({
    contentVersion: requireStoredString('content version', row.contentVersion),
    minClientCapability: requireStoredString(
      'minimum client capability',
      row.minClientCapability,
    ),
    characterIds: requireCharacterIds(row.characterIds),
    assetManifestHash: requireStoredString('asset manifest hash', row.assetManifestHash),
    cueSchemaVersion: requireStoredString('cue schema version', row.cueSchemaVersion),
  });

  return Object.freeze({ contentBundleId, manifest });
}

/**
 * Read the source-backed ContentManifest inputs for one explicit immutable bundle.
 *
 * Returning minClientCapability / assetManifestHash / cueSchemaVersion is not a
 * compatibility verdict. No comparison, ordering, fallback, rollout, or remote
 * activation decision is performed by this function.
 */
export async function getContentBundleManifest(
  input: GetContentBundleManifestInputV1,
): Promise<ContentBundleManifestReadResponseV1> {
  const contentBundleId = requireNonEmptyInput('contentBundleId', input.contentBundleId);

  try {
    const row = await input.authorityPort.readBundleManifest({ contentBundleId });
    return assembleManifest(contentBundleId, row);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
