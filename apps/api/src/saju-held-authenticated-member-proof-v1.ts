import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  bindCurrentSubjectSajuHeldProofV1,
  type SajuHeldSourceProofIssuePortV1,
  type SajuHeldRevisionBindingResultV1,
} from './saju-held-source-proof-revision-binding-v1.js';
import type { SajuHeldSourceProofVerifierTrustV1 } from './saju-held-source-proof-verifier-v1.js';

export const SAJU_HELD_AUTHENTICATED_MEMBER_VERSION_V1 =
  'myeongha-held-authenticated-member-source-proof-v1' as const;

export type SajuHeldAuthenticatedMemberBlockReasonV1 =
  | 'member_auth_required'
  | 'member_auth_unavailable'
  | 'member_credential_not_supported'
  | 'invalid_member_request';

export type SajuHeldAuthenticatedMemberResultV1 =
  | SajuHeldRevisionBindingResultV1
  | Readonly<{
      version: typeof SAJU_HELD_AUTHENTICATED_MEMBER_VERSION_V1;
      state: 'blocked';
      reason: SajuHeldAuthenticatedMemberBlockReasonV1;
      sourceAuthority: 'NOT_EVALUATED';
      releaseAuthorization: 'NOT_EVALUATED';
      canExecute: false;
      canPublish: false;
      canSell: false;
    }>;

export interface BindAuthenticatedMemberSajuHeldProofInputV1 {
  readonly request: Request;
  /** Server-selected verifier: raw credentials are never accepted as trusted evidence. */
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly issuePort: SajuHeldSourceProofIssuePortV1;
  readonly verifierTrust: SajuHeldSourceProofVerifierTrustV1;
}

function deny(reason: SajuHeldAuthenticatedMemberBlockReasonV1):
  Extract<SajuHeldAuthenticatedMemberResultV1, { version: typeof SAJU_HELD_AUTHENTICATED_MEMBER_VERSION_V1 }> {
  return Object.freeze({
    version: SAJU_HELD_AUTHENTICATED_MEMBER_VERSION_V1,
    state: 'blocked',
    reason,
    sourceAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false,
    canPublish: false,
    canSell: false,
  });
}

/**
 * Internal composition boundary only. Not an HTTP handler, public route, or
 * operational admission permit. Reuses the same production request identity
 * verification port as the authenticated MyeongHa endpoints.
 *
 * The incoming request supplies no Subject, Birth, nonce, reading slot,
 * upstream URL, or source authority; all are server-selected or read from DB.
 */
export async function bindAuthenticatedMemberSajuHeldProofV1(
  input: BindAuthenticatedMemberSajuHeldProofInputV1,
): Promise<SajuHeldAuthenticatedMemberResultV1> {
  if (input.request.method !== 'POST' || input.request.body !== null) {
    return deny('invalid_member_request');
  }

  let verified;
  try {
    verified = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  } catch {
    // An unavailable Auth authority must never fall back to unverified IDs.
    return deny('member_auth_unavailable');
  }

  if (verified === null) return deny('member_auth_required');
  if (verified.kind !== 'member') return deny('member_credential_not_supported');

  return bindCurrentSubjectSajuHeldProofV1({
    verifiedEvidence: verified,
    pool: input.pool,
    issuePort: input.issuePort,
    verifierTrust: input.verifierTrust,
  });
}
