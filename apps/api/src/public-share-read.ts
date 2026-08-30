import { ApiCommandError } from './chat-receive.js';

export const PUBLIC_SHARE_READ_AUTHORITY_BINDING_V1 =
  'public.qry_public_share_artifact_v1' as const;

export interface PublicShareArtifactAuthorityRowV1 {
  readonly artifactVersion: string;
  readonly snapshot: unknown;
}

export type PublicShareReadAuthorityFailureCodeV1 =
  | 'SHARE_UNAVAILABLE'
  | 'INVALID_INPUT';

export class PublicShareReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: PublicShareReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'PublicShareReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Converts the raw opaque public token into the source-approved keyed
 * fingerprint/hash representation used for lookup. The concrete algorithm,
 * key version, and key material remain outside this API slice.
 */
export interface PublicShareTokenFingerprintPortV1 {
  fingerprintPublicShareToken(input: {
    readonly rawPublicToken: string;
  }): Awaitable<string>;
}

/**
 * Public-safe stored Share Artifact projection only.
 *
 * The production adapter may bind this to `qry_public_share_artifact_v1` only
 * after P0-AUTH-01 defines the API -> PostgreSQL execution identity. The query
 * itself enforces active + wall-clock-unexpired state and does not expose owner,
 * private Reading, raw/fingerprinted token, or snapshot provenance identifiers.
 */
export interface PublicShareReadAuthorityPortV1 {
  getPublicShareArtifact(input: {
    readonly publicTokenHash: string;
  }): Awaitable<readonly PublicShareArtifactAuthorityRowV1[]>;
}

export interface GetPublicShareArtifactInputV1 {
  readonly publicToken: unknown;
  readonly fingerprintPort: PublicShareTokenFingerprintPortV1;
  readonly authorityPort: PublicShareReadAuthorityPortV1;
}

export interface PublicShareArtifactResponseV1 {
  readonly artifactVersion: string;
  readonly snapshot: unknown;
}

function requireRawPublicToken(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'publicToken must be a non-empty opaque token.',
    );
  }
  return value;
}

function requireTrustedFingerprint(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Public Share token fingerprint port returned an invalid fingerprint.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof PublicShareReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SHARE_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Public Share Artifact is unavailable.');
    case 'INVALID_INPUT':
      throw new Error('Public Share authority rejected trusted fingerprint input.');
  }
}

function assembleResponse(
  row: PublicShareArtifactAuthorityRowV1,
): PublicShareArtifactResponseV1 {
  if (typeof row.artifactVersion !== 'string' || row.artifactVersion.trim().length === 0) {
    throw new Error('Public Share authority returned an invalid artifact version.');
  }
  if (row.snapshot === undefined) {
    throw new Error('Public Share authority returned an undefined public snapshot.');
  }

  return Object.freeze({
    artifactVersion: row.artifactVersion,
    snapshot: row.snapshot,
  });
}

export async function getPublicShareArtifact(
  input: GetPublicShareArtifactInputV1,
): Promise<PublicShareArtifactResponseV1> {
  const rawPublicToken = requireRawPublicToken(input.publicToken);
  const publicTokenHash = requireTrustedFingerprint(
    await input.fingerprintPort.fingerprintPublicShareToken({ rawPublicToken }),
  );

  try {
    const rows = await input.authorityPort.getPublicShareArtifact({ publicTokenHash });
    if (rows.length !== 1) {
      throw new Error('Public Share authority must return exactly one available artifact row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Public Share authority returned an impossible empty successful row.');
    }
    return assembleResponse(row);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
