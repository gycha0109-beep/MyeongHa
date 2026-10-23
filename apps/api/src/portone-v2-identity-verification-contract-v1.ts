import { resolveSelfBirthAgeAdmissionV1 } from './legal-minor-age-policy-v1.js';

/**
 * PortOne V2 is the selected identity provider. This is a read-only server
 * result-normalization boundary, NOT a live authentication endpoint.
 *
 * Only the server-owned, subject-bound, one-time verification attempt may
 * call this after a PortOne GET /identity-verifications/:id lookup. Never
 * admit a browser-returned success flag, self-declared age or Birth Profile DOB.
 */
export const PORTONE_V2_IDENTITY_VERIFICATION_LAUNCH_HOLD_V1 = Object.freeze({
  provider: 'portone_v2',
  identityApiOrigin: 'https://api.portone.io',
  identityRouteActive: false,
  sdkInvocationEnabled: false,
  liveChannelEnabled: false,
  guardianVerificationAvailable: false,
  minimumFreeAge: 14,
  minimumDirectPurchaseAge: 19,
} as const);

export type PortOneV2IdentityAgeBandV1 = 'free_minor' | 'adult';
export type PortOneV2IdentityVerificationDecisionV1 =
  | Readonly<{ kind: 'verified'; subjectId: string; identityVerificationId: string; ageBand: PortOneV2IdentityAgeBandV1 }>
  | Readonly<{ kind: 'held'; reason: 'ATTEMPT_MISMATCH' | 'NOT_VERIFIED' | 'INVALID_PROVIDER_RESULT' | 'AGE_RESTRICTED' }>;

export interface PortOneV2IdentityOwnedAttemptV1 {
  readonly subjectId: string;
  readonly identityVerificationId: string;
  readonly status: 'pending' | 'consumed' | 'expired';
}

/**
 * The caller must have first loaded the attempt using the authenticated
 * subject and enforce atomic once-only consumption when persisting eligibility.
 * This function grants no DB entitlement and stores no identity data.
 */
export function assessPortOneV2IdentityVerificationV1(input: Readonly<{
  subjectId: string;
  expectedIdentityVerificationId: string;
  ownedAttempt: PortOneV2IdentityOwnedAttemptV1;
  providerResult: unknown;
  serverTime: string;
}>): PortOneV2IdentityVerificationDecisionV1 {
  const { subjectId, expectedIdentityVerificationId, ownedAttempt, providerResult, serverTime } = input;
  const expectedIdValid = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(expectedIdentityVerificationId);
  if (
    typeof subjectId !== 'string' || subjectId.length === 0 || !expectedIdValid ||
    ownedAttempt.subjectId !== subjectId ||
    ownedAttempt.identityVerificationId !== expectedIdentityVerificationId ||
    ownedAttempt.status !== 'pending'
  ) {
    return Object.freeze({ kind: 'held', reason: 'ATTEMPT_MISMATCH' });
  }

  if (typeof providerResult !== 'object' || providerResult === null || Array.isArray(providerResult)) {
    return Object.freeze({ kind: 'held', reason: 'INVALID_PROVIDER_RESULT' });
  }
  const result = providerResult as Record<string, unknown>;
  if (result.id !== expectedIdentityVerificationId) {
    return Object.freeze({ kind: 'held', reason: 'ATTEMPT_MISMATCH' });
  }
  if (result.status !== 'VERIFIED') {
    return Object.freeze({ kind: 'held', reason: 'NOT_VERIFIED' });
  }
  if (typeof result.verifiedCustomer !== 'object' || result.verifiedCustomer === null || Array.isArray(result.verifiedCustomer)) {
    return Object.freeze({ kind: 'held', reason: 'INVALID_PROVIDER_RESULT' });
  }
  const verifiedCustomer = result.verifiedCustomer as Record<string, unknown>;
  // Only the provider-verified ISO solar birth date participates. No CI/DI,
  // phone number, name, gender, or raw provider payload is passed onward.
  const age = resolveSelfBirthAgeAdmissionV1({
    birthDate: verifiedCustomer.birthDate,
    calendarType: 'solar',
    serverTime,
  });
  if (age === 'under14_denied') {
    return Object.freeze({ kind: 'held', reason: 'AGE_RESTRICTED' });
  }
  if (age === 'invalid' || age === 'age_boundary_unverified') {
    return Object.freeze({ kind: 'held', reason: 'INVALID_PROVIDER_RESULT' });
  }
  return Object.freeze({
    kind: 'verified',
    subjectId,
    identityVerificationId: expectedIdentityVerificationId,
    ageBand: age,
  });
}
