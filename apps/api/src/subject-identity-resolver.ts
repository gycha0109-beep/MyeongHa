import { ApiCommandError } from './api-error.js';

type Awaitable<T> = T | Promise<T>;

export type ResolvedSubjectKindV1 = 'guest' | 'member';

export interface ResolvedSubjectContextV1 {
  readonly subjectId: string;
  readonly subjectKind: ResolvedSubjectKindV1;
}

export type VerifiedSubjectIdentityEvidenceV1 =
  | Readonly<{
      kind: 'member';
      verifiedAuthUserId: string;
    }>
  | Readonly<{
      kind: 'guest';
      verifiedGuestTokenHash: string;
    }>;

/**
 * Resolves already-verified request evidence to the canonical Myeongha owner.
 *
 * This port does not verify raw credentials and never accepts a client-owned
 * subject id. A production PostgreSQL adapter is responsible for executing
 * the P0-AUTH-01 transaction-scoped subject-context functions in ARCH-06.
 */
export interface SubjectIdentityResolutionPortV1 {
  resolveMemberSubject(input: {
    readonly verifiedAuthUserId: string;
  }): Awaitable<ResolvedSubjectContextV1 | null>;
  resolveGuestSubject(input: {
    readonly verifiedGuestTokenHash: string;
  }): Awaitable<ResolvedSubjectContextV1 | null>;
}

export interface ResolveSubjectIdentityInputV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly resolutionPort: SubjectIdentityResolutionPortV1;
}

function requireTrustedEvidence(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Subject identity resolver trusted ${name} is invalid.`);
  }
  return value;
}

function requireResolvedContext(
  value: ResolvedSubjectContextV1 | null,
  expectedKind: ResolvedSubjectKindV1,
): ResolvedSubjectContextV1 {
  if (value === null) {
    throw new ApiCommandError(
      'AUTH_REQUIRED',
      'A current verified subject identity is required.',
    );
  }

  const subjectId = requireTrustedEvidence('subject id', value.subjectId);
  if (value.subjectKind !== expectedKind) {
    throw new Error('Subject identity resolver returned a different subject kind.');
  }

  return Object.freeze({
    subjectId,
    subjectKind: expectedKind,
  });
}

export async function resolveSubjectIdentity(
  input: ResolveSubjectIdentityInputV1,
): Promise<ResolvedSubjectContextV1> {
  const evidence = input.verifiedEvidence;

  if (evidence.kind === 'member') {
    const verifiedAuthUserId = requireTrustedEvidence(
      'authentication user id',
      evidence.verifiedAuthUserId,
    );
    return requireResolvedContext(
      await input.resolutionPort.resolveMemberSubject({ verifiedAuthUserId }),
      'member',
    );
  }

  if (evidence.kind === 'guest') {
    const verifiedGuestTokenHash = requireTrustedEvidence(
      'guest verifier fingerprint',
      evidence.verifiedGuestTokenHash,
    );
    return requireResolvedContext(
      await input.resolutionPort.resolveGuestSubject({ verifiedGuestTokenHash }),
      'guest',
    );
  }

  throw new Error('Subject identity resolver received an unsupported evidence kind.');
}
