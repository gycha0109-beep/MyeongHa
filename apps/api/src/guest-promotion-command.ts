import { ApiCommandError } from './api-error.js';

export const GUEST_PROMOTION_AUTHORITY_BINDING_V1 =
  'public.cmd_promote_guest_v1' as const;

export interface VerifiedGuestPromotionProofV1 {
  readonly subjectId: string;
  readonly guestSessionId: string;
}

export interface VerifiedGuestPromotionAuthIdentityV1 {
  readonly authUserId: string;
}

export interface GuestPromotionAuthorityRowV1 {
  readonly subjectId: string;
  readonly guestSessionId: string;
  readonly subjectKind: string;
  readonly subjectStatus: string;
  readonly replayed: boolean;
}

export type GuestPromotionAuthorityFailureCodeV1 =
  | 'SUBJECT_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'SUBJECT_INELIGIBLE'
  | 'SESSION_CONSUMED'
  | 'SESSION_EXPIRED'
  | 'AUTH_IDENTITY_NOT_FOUND'
  | 'EXISTING_MEMBER_REQUIRES_MERGE'
  | 'IDENTITY_CONFLICT'
  | 'INVALID_INPUT';

export class GuestPromotionAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: GuestPromotionAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'GuestPromotionAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Verifies current ownership of the raw Guest bearer credential outside this
 * module and returns only the already-resolved authority identity. Raw Guest
 * tokens never become DB-command or response fields here.
 */
export interface GuestPromotionGuestProofPortV1 {
  verifyGuestOwnershipForPromotion(): Awaitable<VerifiedGuestPromotionProofV1 | null>;
}

/**
 * Verifies the newly authenticated identity outside the DB transaction.
 * Provider/password/MFA mechanics remain outside the source-safe HTTP body.
 */
export interface GuestPromotionAuthIdentityPortV1 {
  verifyAuthIdentityForGuestPromotion(input: {
    readonly subjectId: string;
    readonly guestSessionId: string;
  }): Awaitable<VerifiedGuestPromotionAuthIdentityV1 | null>;
}

/**
 * Command port for same-subject Guest -> new Member promotion only.
 *
 * A production adapter may bind this to `cmd_promote_guest_v1` after
 * P0-AUTH-01 defines API -> PostgreSQL execution identity. Existing-member
 * Guest merge remains a separate command/state machine and this slice never
 * reparents owner FKs.
 */
export interface GuestPromotionAuthorityPortV1 {
  promoteGuest(input: {
    readonly subjectId: string;
    readonly guestSessionId: string;
    readonly authUserId: string;
  }): Awaitable<readonly GuestPromotionAuthorityRowV1[]>;
}

export interface PromoteGuestInputV1 {
  readonly request?: unknown;
  readonly guestProofPort: GuestPromotionGuestProofPortV1;
  readonly authIdentityPort: GuestPromotionAuthIdentityPortV1;
  readonly authorityPort: GuestPromotionAuthorityPortV1;
}

export interface PromoteGuestResponseV1 {
  readonly subjectId: string;
  readonly kind: 'member';
  readonly status: 'active';
  readonly replayed: boolean;
}

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
      'Guest promotion does not accept client-controlled identity or command fields.',
    );
  }
}

function requireTrustedIdentifier(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Guest promotion trusted ${name} is invalid.`);
  }
  return value;
}

function requireGuestProof(
  value: VerifiedGuestPromotionProofV1 | null,
): VerifiedGuestPromotionProofV1 {
  if (value === null) {
    throw new ApiCommandError(
      'AUTH_REQUIRED',
      'Guest promotion requires a valid Guest ownership proof.',
    );
  }
  return Object.freeze({
    subjectId: requireTrustedIdentifier('subject id', value.subjectId),
    guestSessionId: requireTrustedIdentifier('session id', value.guestSessionId),
  });
}

function requireAuthIdentity(
  value: VerifiedGuestPromotionAuthIdentityV1 | null,
): VerifiedGuestPromotionAuthIdentityV1 {
  if (value === null) {
    throw new ApiCommandError(
      'AUTH_REQUIRED',
      'Guest promotion requires a verified authentication identity.',
    );
  }
  return Object.freeze({
    authUserId: requireTrustedIdentifier('auth user id', value.authUserId),
  });
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof GuestPromotionAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_NOT_FOUND':
    case 'SESSION_NOT_FOUND':
    case 'SESSION_CONSUMED':
    case 'SESSION_EXPIRED':
      throw new ApiCommandError(
        'AUTH_REQUIRED',
        'Guest promotion requires a current reusable Guest identity.',
      );
    case 'AUTH_IDENTITY_NOT_FOUND':
      throw new ApiCommandError(
        'AUTH_REQUIRED',
        'Guest promotion requires a current verified authentication identity.',
      );
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'FORBIDDEN',
        'The current Guest subject is not eligible for same-subject promotion.',
      );
    case 'EXISTING_MEMBER_REQUIRES_MERGE':
    case 'IDENTITY_CONFLICT':
      throw new ApiCommandError(
        'FORBIDDEN',
        'This verified identity cannot use the new-account Guest promotion path.',
      );
    case 'INVALID_INPUT':
      throw new Error('Guest promotion authority rejected trusted server input.');
  }
}

function assembleResponse(
  row: GuestPromotionAuthorityRowV1,
  proof: VerifiedGuestPromotionProofV1,
): PromoteGuestResponseV1 {
  const subjectId = requireTrustedIdentifier('authority subject id', row.subjectId);
  const guestSessionId = requireTrustedIdentifier(
    'authority guest session id',
    row.guestSessionId,
  );

  if (subjectId !== proof.subjectId || guestSessionId !== proof.guestSessionId) {
    throw new Error('Guest promotion authority returned a different canonical identity.');
  }
  if (row.subjectKind !== 'member' || row.subjectStatus !== 'active') {
    throw new Error('Guest promotion authority returned a non-member final state.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Guest promotion authority returned an invalid replay marker.');
  }

  return Object.freeze({
    subjectId,
    kind: 'member',
    status: 'active',
    replayed: row.replayed,
  });
}

export async function promoteGuestToMember(
  input: PromoteGuestInputV1,
): Promise<PromoteGuestResponseV1> {
  assertNoClientRequestFields(input.request);

  const guestProof = requireGuestProof(
    await input.guestProofPort.verifyGuestOwnershipForPromotion(),
  );
  const authIdentity = requireAuthIdentity(
    await input.authIdentityPort.verifyAuthIdentityForGuestPromotion({
      subjectId: guestProof.subjectId,
      guestSessionId: guestProof.guestSessionId,
    }),
  );

  try {
    const rows = await input.authorityPort.promoteGuest({
      subjectId: guestProof.subjectId,
      guestSessionId: guestProof.guestSessionId,
      authUserId: authIdentity.authUserId,
    });
    if (rows.length !== 1) {
      throw new Error('Guest promotion authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Guest promotion authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, guestProof);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
