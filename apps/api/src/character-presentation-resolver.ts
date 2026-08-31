import { ApiCommandError } from './chat-receive.js';

/**
 * Public Character Room routing identity. The concrete roster is content data,
 * not an API enum, so new characters do not require an API code release merely
 * to become resolvable.
 */
export type CharacterPresentationKeyV1 = string;

export interface CharacterPresentationIdentityAuthorityRowV1 {
  readonly presentationKey: string;
  readonly characterId: string;
  readonly contentBundleId: string;
}

export type CharacterPresentationIdentityAuthorityFailureCodeV1 =
  | 'BUNDLE_UNAVAILABLE'
  | 'CHARACTER_UNAVAILABLE'
  | 'INVALID_INPUT';

export class CharacterPresentationIdentityAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: CharacterPresentationIdentityAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterPresentationIdentityAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Trusted content-authority port for resolving a public presentation key to the
 * stable canonical character identity in one server-resolved content bundle.
 *
 * No database function is named here deliberately. The production storage/query
 * binding for this mapping has not been decided, and callers must not substitute
 * `presentationKey` for `characterId` or infer the mapping in the browser.
 */
export interface CharacterPresentationIdentityAuthorityPortV1 {
  resolveCharacterIdentity(input: {
    readonly contentBundleId: string;
    readonly presentationKey: CharacterPresentationKeyV1;
  }): Awaitable<readonly CharacterPresentationIdentityAuthorityRowV1[]>;
}

export interface CharacterPresentationIdentityV1 {
  readonly presentationKey: CharacterPresentationKeyV1;
  readonly characterId: string;
  readonly contentBundleId: string;
}

export interface ResolveCharacterPresentationIdentityInputV1 {
  readonly contentBundleId: unknown;
  readonly presentationKey: unknown;
  readonly authorityPort: CharacterPresentationIdentityAuthorityPortV1;
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

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof CharacterPresentationIdentityAuthorityPortErrorV1)) {
    throw error;
  }

  switch (error.code) {
    case 'BUNDLE_UNAVAILABLE':
    case 'CHARACTER_UNAVAILABLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Character identity is unavailable in the resolved content bundle.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function projectIdentity(
  contentBundleId: string,
  presentationKey: CharacterPresentationKeyV1,
  rows: readonly CharacterPresentationIdentityAuthorityRowV1[],
): CharacterPresentationIdentityV1 {
  if (rows.length === 0) {
    throw new ApiCommandError(
      'NOT_FOUND',
      'Character identity is unavailable in the resolved content bundle.',
    );
  }
  if (rows.length > 1) {
    throw new Error(
      'Character presentation identity authority returned more than one mapping row.',
    );
  }

  const row = rows[0];
  if (row === undefined) {
    throw new Error('Character presentation identity authority returned an invalid row set.');
  }

  const rowPresentationKey = requireStoredString(
    'presentation key',
    row.presentationKey,
  );
  const characterId = requireStoredString('character identity', row.characterId);
  const rowContentBundleId = requireStoredString(
    'content bundle identity',
    row.contentBundleId,
  );

  if (rowPresentationKey !== presentationKey) {
    throw new Error(
      'Character presentation identity authority returned a different presentation key.',
    );
  }
  if (rowContentBundleId !== contentBundleId) {
    throw new Error(
      'Character presentation identity authority returned a different content bundle.',
    );
  }

  return Object.freeze({
    presentationKey,
    characterId,
    contentBundleId,
  });
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `Character presentation identity authority returned an invalid ${name}.`,
    );
  }
  return value;
}

export async function resolveCharacterPresentationIdentity(
  input: ResolveCharacterPresentationIdentityInputV1,
): Promise<CharacterPresentationIdentityV1> {
  const contentBundleId = requireNonEmptyString(
    'contentBundleId',
    input.contentBundleId,
  );
  const presentationKey = requireNonEmptyString(
    'presentationKey',
    input.presentationKey,
  );

  try {
    const rows = await input.authorityPort.resolveCharacterIdentity({
      contentBundleId,
      presentationKey,
    });
    return projectIdentity(contentBundleId, presentationKey, rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
