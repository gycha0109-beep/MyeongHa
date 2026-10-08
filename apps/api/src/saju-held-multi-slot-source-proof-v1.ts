import { randomBytes } from 'node:crypto';
import { readBoundCurrentBirthContextV1 } from './current-subject-saju-calculation-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  bindCurrentSubjectSajuHeldProofV1,
  type SajuHeldSourceProofIssuePortV1,
} from './saju-held-source-proof-revision-binding-v1.js';
import type { SajuHeldSourceProofVerifierTrustV1 } from './saju-held-source-proof-verifier-v1.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';
import {
  buildCurrentBirthSourceProofRehearsalRequestV1,
  SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1,
  SAJU_SOURCE_PROOF_RELATIONSHIP_TEXT_V1,
} from './saju-source-proof-request-normalization-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export const SAJU_HELD_MULTI_SLOT_SOURCE_PROOF_VERSION_V1 =
  'myeongha-held-multi-slot-source-proof-v1' as const;

/** Fixed server-owned rehearsal contract, not a commercial product manifest. */
const SLOTS = Object.freeze([
  Object.freeze({ slotId: 'natal', readingText: SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1 }),
  Object.freeze({ slotId: 'relationship', readingText: SAJU_SOURCE_PROOF_RELATIONSHIP_TEXT_V1 }),
] as const);

export type SajuHeldMultiSlotProofReasonV1 =
  | 'required_slot_blocked'
  | 'reused_slot_nonce'
  | 'duplicate_source_identity'
  | 'mixed_subject_or_revision'
  | 'final_birth_profile_unavailable'
  | 'final_birth_revision_changed'
  | 'two_independent_transport_proofs_verified_only';

export type SajuHeldMultiSlotProofResultV1 = Readonly<{
  version: typeof SAJU_HELD_MULTI_SLOT_SOURCE_PROOF_VERSION_V1;
  state: 'held' | 'blocked';
  reason: SajuHeldMultiSlotProofReasonV1;
  checkedSlots: readonly ('natal' | 'relationship')[];
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

export interface RehearseCurrentSubjectSajuMultiSlotSourceProofInputV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly issuePort: SajuHeldSourceProofIssuePortV1;
  readonly verifierTrust: SajuHeldSourceProofVerifierTrustV1;
  /** Test-only seam. Production uses a separate CSPRNG nonce for each slot. */
  readonly nonceFactory?: () => string;
  readonly nowMsFactory?: () => number;
}

function result(
  state: SajuHeldMultiSlotProofResultV1['state'],
  reason: SajuHeldMultiSlotProofReasonV1,
  checkedSlots: readonly ('natal' | 'relationship')[] = [],
): SajuHeldMultiSlotProofResultV1 {
  return Object.freeze({
    version: SAJU_HELD_MULTI_SLOT_SOURCE_PROOF_VERSION_V1,
    state, reason, checkedSlots: Object.freeze([...checkedSlots]),
    sourceAuthority: 'NOT_EVALUATED' as const,
    releaseAuthorization: 'NOT_EVALUATED' as const,
    canExecute: false as const, canPublish: false as const, canSell: false as const,
  });
}

/**
 * Adversarial cross-slot rehearsal. Every slot receives an independently
 * authenticated Saju HMAC proof and independently owner-authorized Birth read
 * before/after issuance. A final authority read invalidates mixed or stale
 * results; no unofficial interpretation or combined Reading is produced.
 */
export async function rehearseCurrentSubjectSajuMultiSlotSourceProofV1(
  input: RehearseCurrentSubjectSajuMultiSlotSourceProofInputV1,
): Promise<SajuHeldMultiSlotProofResultV1> {
  const nonces = new Set<string>();
  const readingIds = new Set<string>();
  const responseIds = new Set<string>();
  const requestHashes = new Set<string>();
  const responseHashes = new Set<string>();
  const bindings: NonNullable<
    Awaited<ReturnType<typeof bindCurrentSubjectSajuHeldProofV1>>['binding']
  >[] = [];
  let reusedNonce = false;

  for (const slot of SLOTS) {
    const bindingResult = await bindCurrentSubjectSajuHeldProofV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      issuePort: input.issuePort,
      verifierTrust: input.verifierTrust,
      readingText: slot.readingText,
      nonceFactory: () => {
        const nonce = (input.nonceFactory ?? (() => randomBytes(32).toString('base64url')))();
        if (nonces.has(nonce)) {
          reusedNonce = true;
          throw new Error('One nonce cannot be reused across proof slots.');
        }
        nonces.add(nonce);
        return nonce;
      },
      ...(input.nowMsFactory === undefined ? {} : { nowMsFactory: input.nowMsFactory }),
    });

    const binding = bindingResult.binding;
    if (reusedNonce) return result('blocked', 'reused_slot_nonce');
    if (bindingResult.state !== 'held' || binding === undefined) {
      return result('blocked', 'required_slot_blocked');
    }
    if (readingIds.has(binding.readingId)
      || responseIds.has(binding.responseId)
      || requestHashes.has(binding.requestBodyHash)
      || responseHashes.has(binding.responseBodyHash)) {
      return result('blocked', 'duplicate_source_identity');
    }
    if (bindings.length > 0) {
      const first = bindings[0];
      if (first === undefined
        || first.subjectId !== binding.subjectId
        || first.birthProfileId !== binding.birthProfileId
        || first.birthRevisionId !== binding.birthRevisionId
        || first.birthRevisionNo !== binding.birthRevisionNo) {
        return result('blocked', 'mixed_subject_or_revision');
      }
    }
    readingIds.add(binding.readingId);
    responseIds.add(binding.responseId);
    requestHashes.add(binding.requestBodyHash);
    responseHashes.add(binding.responseBodyHash);
    bindings.push(binding);
  }

  // Catch a change after slot two's own successful post-proof read.
  let latest: Awaited<ReturnType<typeof readBoundCurrentBirthContextV1>>;
  try {
    latest = await readBoundCurrentBirthContextV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
    });
  } catch {
    return result('blocked', 'final_birth_profile_unavailable');
  }

  const original = bindings[0];
  if (original === undefined
    || latest.resolvedSubject.subjectId !== original.subjectId
    || latest.profile.birthProfileId !== original.birthProfileId
    || latest.profile.profileKind !== 'self'
    || latest.profile.archivedAt !== null
    || latest.profile.currentRevision.revisionId !== original.birthRevisionId
    || latest.profile.currentRevision.revisionNo !== original.birthRevisionNo) {
    return result('blocked', 'final_birth_revision_changed');
  }

  try {
    for (let index = 0; index < SLOTS.length; index += 1) {
      const slot = SLOTS[index];
      const prior = bindings[index];
      if (slot === undefined || prior === undefined) {
        return result('blocked', 'required_slot_blocked');
      }
      const request = buildCurrentBirthSourceProofRehearsalRequestV1(
        latest.profile,
        slot.readingText,
      );
      if (hashSajuHeldSourceProofRequestV1(request) !== prior.requestBodyHash) {
        return result('blocked', 'final_birth_revision_changed');
      }
    }
  } catch {
    return result('blocked', 'final_birth_revision_changed');
  }

  return result('held', 'two_independent_transport_proofs_verified_only', [
    'natal', 'relationship',
  ]);
}
