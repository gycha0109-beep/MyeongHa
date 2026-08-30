import { ApiCommandError } from './chat-receive.js';

export const SHARE_ARTIFACT_REVOKE_COMMAND_AUTHORITY_BINDING_V1 =
  'public.cmd_revoke_share_artifact_v1' as const;

export type ShareArtifactEffectiveStatusV1 = 'revoked' | 'expired';

export interface ShareArtifactRevokeCommandAuthorityRowV1 {
  readonly shareArtifactId: string;
  readonly effectiveStatus: string;
  readonly revokedAt: string | null;
  readonly replayed: boolean;
}

export type ShareArtifactRevokeCommandAuthorityFailureCodeV1 =
  | 'SHARE_UNAVAILABLE'
  | 'SHARE_STATE_INVALID'
  | 'INVALID_INPUT';

export class ShareArtifactRevokeCommandAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ShareArtifactRevokeCommandAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ShareArtifactRevokeCommandAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Owner-scoped Share Artifact lifecycle revoke authority.
 *
 * Revocation does not destroy the immutable public projection, token fingerprint,
 * Reading pin, or historical provenance. An already-revoked artifact replays the
 * original revoke state; an already-expired artifact remains expired and is a
 * terminal no-op. P0-AUTH-01 still blocks choosing the production PostgreSQL
 * execution identity, so this slice exposes only the command port.
 */
export interface ShareArtifactRevokeCommandAuthorityPortV1 {
  revokeShareArtifact(input: {
    readonly subjectId: string;
    readonly shareArtifactId: string;
  }): Awaitable<readonly ShareArtifactRevokeCommandAuthorityRowV1[]>;
}

export interface RevokeShareArtifactInputV1 {
  readonly resolvedSubjectId?: string;
  readonly shareArtifactId: unknown;
  readonly authorityPort: ShareArtifactRevokeCommandAuthorityPortV1;
}

export interface RevokeShareArtifactResponseV1 {
  readonly shareArtifactId: string;
  readonly effectiveStatus: ShareArtifactEffectiveStatusV1;
  readonly revokedAt: string | null;
  readonly replayed: boolean;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireShareArtifactId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'shareArtifactId must be a non-empty string.',
    );
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof ShareArtifactRevokeCommandAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SHARE_UNAVAILABLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Share Artifact is unavailable for the current subject.',
      );
    case 'SHARE_STATE_INVALID':
      throw new Error('Share Artifact revoke authority reported an invalid lifecycle state.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function requireTimestamp(value: string, field: string): string {
  if (value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error(`Share Artifact revoke authority returned an invalid ${field}.`);
  }
  return value;
}

function assembleResponse(
  row: ShareArtifactRevokeCommandAuthorityRowV1,
  requestedShareArtifactId: string,
): RevokeShareArtifactResponseV1 {
  if (row.shareArtifactId !== requestedShareArtifactId) {
    throw new Error('Share Artifact revoke authority returned a different artifact identity.');
  }
  if (row.effectiveStatus !== 'revoked' && row.effectiveStatus !== 'expired') {
    throw new Error('Share Artifact revoke authority returned an invalid effective status.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Share Artifact revoke authority returned an invalid replay marker.');
  }

  if (row.effectiveStatus === 'revoked') {
    if (typeof row.revokedAt !== 'string') {
      throw new Error('Share Artifact revoke authority returned a revoked state without revokedAt.');
    }
    requireTimestamp(row.revokedAt, 'revokedAt timestamp');
  } else if (row.revokedAt !== null) {
    throw new Error('Share Artifact revoke authority rewrote expired terminal state as revoked.');
  }

  return Object.freeze({
    shareArtifactId: row.shareArtifactId,
    effectiveStatus: row.effectiveStatus,
    revokedAt: row.revokedAt,
    replayed: row.replayed,
  });
}

export async function revokeShareArtifact(
  input: RevokeShareArtifactInputV1,
): Promise<RevokeShareArtifactResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const shareArtifactId = requireShareArtifactId(input.shareArtifactId);

  try {
    const rows = await input.authorityPort.revokeShareArtifact({
      subjectId,
      shareArtifactId,
    });
    if (rows.length !== 1) {
      throw new Error('Share Artifact revoke authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error(
        'Share Artifact revoke authority returned an impossible empty successful row.',
      );
    }
    return assembleResponse(row, shareArtifactId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
