import { ApiCommandError } from './api-error.js';

export const GUEST_BOOTSTRAP_AUTHORITY_BINDING_V1 =
  'public.cmd_create_guest_session_v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface ReusableGuestBootstrapIdentityV1 {
  readonly kind: 'guest';
  readonly subjectId: string;
  readonly guestSessionId: string;
  readonly expiresAt: string;
}

export interface ReusableMemberBootstrapIdentityV1 {
  readonly kind: 'member';
  readonly subjectId: string;
}

export type ReusableBootstrapIdentityV1 =
  | ReusableGuestBootstrapIdentityV1
  | ReusableMemberBootstrapIdentityV1;

/**
 * Resolves only an already-verified current Guest/Member identity from trusted
 * authentication/session context. Raw credentials are never returned by this
 * port and are not re-emitted by the bootstrap boundary.
 */
export interface GuestBootstrapIdentityResolverPortV1 {
  resolveExistingBootstrapIdentity(): Awaitable<ReusableBootstrapIdentityV1 | null>;
}

export interface IssuedGuestBootstrapCredentialV1 {
  readonly subjectId: string;
  readonly guestSessionId: string;
  readonly bearerToken: string;
  readonly expiresAt: string;
}

/**
 * Generates the new Guest subject/session identifiers, opaque bearer token and
 * expiry. Token-generation and TTL policy are deliberately outside this
 * source-safe boundary.
 */
export interface GuestBootstrapCredentialIssuerPortV1 {
  issueGuestBootstrapCredential(): Awaitable<IssuedGuestBootstrapCredentialV1>;
}

/** Converts the raw one-time bearer credential to the DB verifier form. */
export interface GuestBootstrapTokenFingerprintPortV1 {
  fingerprintGuestBearerToken(input: {
    readonly rawBearerToken: string;
  }): Awaitable<string>;
}

export interface GuestBootstrapAuthorityRowV1 {
  readonly subjectId: string;
  readonly guestSessionId: string;
  readonly expiresAt: string;
  readonly replayed: boolean;
}

export type GuestBootstrapAuthorityFailureCodeV1 =
  | 'IDENTITY_CONFLICT'
  | 'SESSION_NOT_REUSABLE'
  | 'INVALID_INPUT';

export class GuestBootstrapAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: GuestBootstrapAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'GuestBootstrapAuthorityPortErrorV1';
  }
}

/**
 * Persistence port for the fresh Guest owner + verifier-only Guest Session.
 * A production PostgreSQL adapter remains blocked on P0-AUTH-01.
 */
export interface GuestBootstrapAuthorityPortV1 {
  createGuestSession(input: {
    readonly subjectId: string;
    readonly guestSessionId: string;
    readonly tokenHash: string;
    readonly expiresAt: string;
  }): Awaitable<readonly GuestBootstrapAuthorityRowV1[]>;
}

export interface BootstrapSessionInputV1 {
  readonly request?: unknown;
  readonly identityResolverPort: GuestBootstrapIdentityResolverPortV1;
  readonly credentialIssuerPort: GuestBootstrapCredentialIssuerPortV1;
  readonly tokenFingerprintPort: GuestBootstrapTokenFingerprintPortV1;
  readonly authorityPort: GuestBootstrapAuthorityPortV1;
}

export type BootstrapSessionResponseV1 =
  | Readonly<{
      subjectId: string;
      kind: 'member';
      guestSession: null;
    }>
  | Readonly<{
      subjectId: string;
      kind: 'guest';
      guestSession: Readonly<{
        guestSessionId: string;
        expiresAt: string;
        bearerToken: string | null;
      }>;
    }>;

function assertNoClientRequestFields(value: unknown): void {
  if (value === undefined) return;
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value as Record<string, unknown>).length !== 0
  ) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Session bootstrap does not accept client-controlled identity, token, expiry, or command fields.',
    );
  }
}

function requireTrustedIdentifier(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Guest bootstrap trusted ${name} is invalid.`);
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Guest bootstrap trusted ${name} is invalid.`);
  }
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`Guest bootstrap trusted ${name} is not a timestamp.`);
  }
  return value;
}

function requireRawBearerToken(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Guest bootstrap credential issuer returned an invalid raw bearer token.');
  }
  return value;
}

function requireFingerprint(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Guest bootstrap token fingerprint port returned an invalid fingerprint.');
  }
  return value;
}

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function assembleExistingIdentityResponse(
  identity: ReusableBootstrapIdentityV1,
): BootstrapSessionResponseV1 {
  const subjectId = requireTrustedIdentifier('existing subject id', identity.subjectId);

  if (identity.kind === 'member') {
    return Object.freeze({
      subjectId,
      kind: 'member',
      guestSession: null,
    });
  }

  if (identity.kind === 'guest') {
    const guestSessionId = requireTrustedIdentifier(
      'existing guest session id',
      identity.guestSessionId,
    );
    const expiresAt = requireTimestamp('existing guest session expiry', identity.expiresAt);
    return Object.freeze({
      subjectId,
      kind: 'guest',
      guestSession: Object.freeze({
        guestSessionId,
        expiresAt,
        bearerToken: null,
      }),
    });
  }

  throw new Error('Guest bootstrap identity resolver returned an unsupported identity kind.');
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof GuestBootstrapAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'IDENTITY_CONFLICT':
      throw new Error('Guest bootstrap authority detected a trusted identity collision.');
    case 'SESSION_NOT_REUSABLE':
      throw new Error('Guest bootstrap authority rejected a trusted reusable session identity.');
    case 'INVALID_INPUT':
      throw new Error('Guest bootstrap authority rejected trusted server input.');
  }
}

function assembleCreatedGuestResponse(
  row: GuestBootstrapAuthorityRowV1,
  issued: IssuedGuestBootstrapCredentialV1,
  rawBearerToken: string,
): BootstrapSessionResponseV1 {
  const subjectId = requireTrustedIdentifier('authority subject id', row.subjectId);
  const guestSessionId = requireTrustedIdentifier(
    'authority guest session id',
    row.guestSessionId,
  );
  const expiresAt = requireTimestamp('authority guest session expiry', row.expiresAt);

  if (subjectId !== issued.subjectId || guestSessionId !== issued.guestSessionId) {
    throw new Error('Guest bootstrap authority returned a different canonical identity.');
  }
  if (!sameInstant(expiresAt, issued.expiresAt)) {
    throw new Error('Guest bootstrap authority returned a different canonical expiry.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Guest bootstrap authority returned an invalid replay marker.');
  }

  return Object.freeze({
    subjectId,
    kind: 'guest',
    guestSession: Object.freeze({
      guestSessionId,
      expiresAt,
      bearerToken: rawBearerToken,
    }),
  });
}

export async function bootstrapSession(
  input: BootstrapSessionInputV1,
): Promise<BootstrapSessionResponseV1> {
  assertNoClientRequestFields(input.request);

  const existingIdentity =
    await input.identityResolverPort.resolveExistingBootstrapIdentity();
  if (existingIdentity !== null) {
    return assembleExistingIdentityResponse(existingIdentity);
  }

  const issuedRaw = await input.credentialIssuerPort.issueGuestBootstrapCredential();
  const issued: IssuedGuestBootstrapCredentialV1 = Object.freeze({
    subjectId: requireTrustedIdentifier('issued subject id', issuedRaw.subjectId),
    guestSessionId: requireTrustedIdentifier(
      'issued guest session id',
      issuedRaw.guestSessionId,
    ),
    bearerToken: requireRawBearerToken(issuedRaw.bearerToken),
    expiresAt: requireTimestamp('issued guest session expiry', issuedRaw.expiresAt),
  });

  const tokenHash = requireFingerprint(
    await input.tokenFingerprintPort.fingerprintGuestBearerToken({
      rawBearerToken: issued.bearerToken,
    }),
  );

  try {
    const rows = await input.authorityPort.createGuestSession({
      subjectId: issued.subjectId,
      guestSessionId: issued.guestSessionId,
      tokenHash,
      expiresAt: issued.expiresAt,
    });
    if (rows.length !== 1) {
      throw new Error('Guest bootstrap authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Guest bootstrap authority returned an impossible empty successful row.');
    }
    return assembleCreatedGuestResponse(row, issued, issued.bearerToken);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
