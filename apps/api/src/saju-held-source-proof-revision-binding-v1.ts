import { randomBytes } from 'node:crypto';
import type { BirthProfileReadResponseV1 } from './birth-profile-read.js';
import { readBoundCurrentBirthContextV1 } from './current-subject-saju-calculation-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  verifySajuHeldSourceProofV1,
  type SajuHeldSourceProofVerifierTrustV1,
  type SajuHeldSourceProofVerificationV1,
} from './saju-held-source-proof-verifier-v1.js';
import type { SajuProductionReadingRequestV1 } from './saju-production-reading-http-adapter.js';
import {
  SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1,
  buildCurrentBirthSourceProofRehearsalRequestV1,
  type SajuHeldProofRehearsalReadingTextV1,
} from './saju-source-proof-request-normalization-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1, ResolvedSubjectContextV1 } from './subject-identity-resolver.js';

export const SAJU_HELD_REVISION_BINDING_VERSION_V1 =
  'myeongha-held-source-proof-revision-binding-v1' as const;

const NONCE = /^[a-zA-Z0-9_-]{22,128}$/u;

export interface SajuHeldSourceProofIssuePortV1 {
  /**
   * Protected Saju Preview proof route transport. No browser, public route,
   * production Reading host, or caller-selected provenance is supported here.
   */
  issuePreviewProof(input: Readonly<{
    nonce: string;
    request: SajuProductionReadingRequestV1;
  }>): Promise<unknown>;
}

export interface BindCurrentSubjectSajuHeldProofInputV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly issuePort: SajuHeldSourceProofIssuePortV1;
  readonly verifierTrust: SajuHeldSourceProofVerifierTrustV1;
  /** Defaults to General Natal. Only fixed internal rehearsal slots may differ. */
  readonly readingText?: SajuHeldProofRehearsalReadingTextV1;
  /** Server-only deterministic test seam; never derived from a browser request. */
  readonly nonceFactory?: () => string;
  /** Server clock seam for tests. */
  readonly nowMsFactory?: () => number;
}

export type SajuHeldRevisionBindingReasonV1 =
  | 'birth_profile_unavailable'
  | 'invalid_current_birth_request'
  | 'source_proof_unavailable'
  | 'source_proof_invalid'
  | 'current_birth_revision_changed'
  | 'source_transport_integrity_verified_only';

export type SajuHeldRevisionBindingResultV1 = Readonly<{
  version: typeof SAJU_HELD_REVISION_BINDING_VERSION_V1;
  state: 'held' | 'blocked';
  reason: SajuHeldRevisionBindingReasonV1;
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
  /** Internal-only diagnostic IDs. These are not Source authority or user grants. */
  binding?: Readonly<{
    subjectId: string;
    birthProfileId: string;
    birthRevisionId: string;
    birthRevisionNo: number;
    readingId: string;
    responseId: string;
    requestBodyHash: string;
    responseBodyHash: string;
  }>;
}>;

function verdict(
  state: SajuHeldRevisionBindingResultV1['state'],
  reason: SajuHeldRevisionBindingReasonV1,
  binding?: NonNullable<SajuHeldRevisionBindingResultV1['binding']>,
): SajuHeldRevisionBindingResultV1 {
  return Object.freeze({
    version: SAJU_HELD_REVISION_BINDING_VERSION_V1,
    state,
    reason,
    sourceAuthority: 'NOT_EVALUATED' as const,
    releaseAuthorization: 'NOT_EVALUATED' as const,
    canExecute: false as const,
    canPublish: false as const,
    canSell: false as const,
    ...(binding === undefined ? {} : { binding: Object.freeze(binding) }),
  });
}

function sameCurrentContext(
  before: Readonly<{ resolvedSubject: ResolvedSubjectContextV1; profile: BirthProfileReadResponseV1 }>,
  after: Readonly<{ resolvedSubject: ResolvedSubjectContextV1; profile: BirthProfileReadResponseV1 }>,
): boolean {
  const a = before.profile;
  const b = after.profile;
  const x = a.currentRevision;
  const y = b.currentRevision;
  const i = x.input;
  const j = y.input;

  return before.resolvedSubject.subjectId === after.resolvedSubject.subjectId
    && before.resolvedSubject.subjectKind === after.resolvedSubject.subjectKind
    && a.birthProfileId === b.birthProfileId
    && a.profileKind === 'self' && b.profileKind === 'self'
    && a.archivedAt === null && b.archivedAt === null
    && x.revisionId === y.revisionId
    && x.revisionNo === y.revisionNo
    && i.calendarType === j.calendarType
    && i.birthDate === j.birthDate
    && i.birthTime === j.birthTime
    && i.timeKnown === j.timeKnown
    && i.isLeapMonth === j.isLeapMonth
    && i.sex === j.sex;
}

/**
 * One fixed, server-selected Preview reading proof rehearsal, with a fresh Subject+Revision
 * snapshot both before and after Saju's protected proof issuance.
 *
 * The DB transaction is fully committed before any external I/O. A valid HMAC
 * authenticates transport only. Persistent nonce storage and production wire
 * provisioning remain independent gates; this function grants no product use.
 */
export async function bindCurrentSubjectSajuHeldProofV1(
  input: BindCurrentSubjectSajuHeldProofInputV1,
): Promise<SajuHeldRevisionBindingResultV1> {
  let before: Awaited<ReturnType<typeof readBoundCurrentBirthContextV1>>;
  try {
    before = await readBoundCurrentBirthContextV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
    });
  } catch {
    return verdict('blocked', 'birth_profile_unavailable');
  }

  let request: SajuProductionReadingRequestV1;
  let nonce: string;
  try {
    request = buildCurrentBirthSourceProofRehearsalRequestV1(
      before.profile,
      input.readingText ?? SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1,
    );
    nonce = (input.nonceFactory ?? (() => randomBytes(32).toString('base64url')))();
    if (typeof nonce !== 'string' || !NONCE.test(nonce)) {
      return verdict('blocked', 'invalid_current_birth_request');
    }
  } catch {
    return verdict('blocked', 'invalid_current_birth_request');
  }

  // Independently pin the expectation; the issue port never receives this copy.
  const expectedRequestBody = structuredClone(request);
  let envelope: unknown;
  try {
    envelope = await input.issuePort.issuePreviewProof({
      nonce,
      request: structuredClone(request),
    });
  } catch {
    return verdict('blocked', 'source_proof_unavailable');
  }

  let verified: SajuHeldSourceProofVerificationV1;
  try {
    verified = await verifySajuHeldSourceProofV1(envelope, input.verifierTrust, {
      expectedNonce: nonce,
      expectedRequestBody,
      nowMs: (input.nowMsFactory ?? Date.now)(),
    });
  } catch {
    return verdict('blocked', 'source_proof_invalid');
  }
  if (verified.state !== 'held'
    || verified.transportIntegrity !== 'VERIFIED'
    || verified.verifiedSource === undefined) {
    return verdict('blocked', 'source_proof_invalid');
  }

  let after: Awaited<ReturnType<typeof readBoundCurrentBirthContextV1>>;
  try {
    after = await readBoundCurrentBirthContextV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
    });
  } catch {
    return verdict('blocked', 'birth_profile_unavailable');
  }
  if (!sameCurrentContext(before, after)) {
    return verdict('blocked', 'current_birth_revision_changed');
  }

  return verdict('held', 'source_transport_integrity_verified_only', {
    subjectId: before.resolvedSubject.subjectId,
    birthProfileId: before.profile.birthProfileId,
    birthRevisionId: before.profile.currentRevision.revisionId,
    birthRevisionNo: before.profile.currentRevision.revisionNo,
    readingId: verified.verifiedSource.readingId,
    responseId: verified.verifiedSource.responseId,
    requestBodyHash: verified.verifiedSource.requestBodyHash,
    responseBodyHash: verified.verifiedSource.responseBodyHash,
  });
}
