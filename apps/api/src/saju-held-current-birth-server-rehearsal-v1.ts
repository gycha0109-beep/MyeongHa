import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  bindCurrentSubjectSajuHeldProofV1,
  type SajuHeldRevisionBindingResultV1,
} from './saju-held-source-proof-revision-binding-v1.js';
import {
  createSajuHeldSourceProofServerTrustV1,
  type SajuHeldSourceProofServerTrustOptionsV1,
} from './saju-held-source-proof-server-trust-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export const SAJU_HELD_CURRENT_BIRTH_SERVER_REHEARSAL_VERSION_V1 =
  'myeongha-held-current-birth-server-rehearsal-v1' as const;

export interface SajuHeldCurrentBirthServerRehearsalOptionsV1 {
  /** Existing owner-authorized Subject/Birth read pool, not the nonce registry principal. */
  readonly subjectPool: PostgresSubjectPoolV1;
  /** Explicit server-provisioned Preview issuer, verifier and dedicated nonce pool. */
  readonly proofTrust: SajuHeldSourceProofServerTrustOptionsV1;
}

export interface SajuHeldCurrentBirthServerRehearsalV1 {
  readonly version: typeof SAJU_HELD_CURRENT_BIRTH_SERVER_REHEARSAL_VERSION_V1;
  /** Only trusted identity evidence is accepted; no client-selected Subject or Reading. */
  rehearse(
    verifiedEvidence: VerifiedSubjectIdentityEvidenceV1,
  ): Promise<SajuHeldRevisionBindingResultV1>;
}

/**
 * First concrete server-internal caller of the 8A composition.
 * A single fixed General Natal Preview proof is bound to the authenticated
 * current Birth Revision using the existing 2B-3C-4 verifier and DB checks.
 *
 * Construction is inert: it mounts no route, accesses no environment values,
 * sends no HTTP request and opens no database connection.
 * Production Interpretation, Release and Commerce remain unconditionally HOLD.
 */
export function createSajuHeldCurrentBirthServerRehearsalV1(
  options: SajuHeldCurrentBirthServerRehearsalOptionsV1,
): SajuHeldCurrentBirthServerRehearsalV1 {
  if (!options || !options.subjectPool
    || typeof options.subjectPool.connect !== 'function'
    || !options.proofTrust
    || options.subjectPool === options.proofTrust.noncePool) {
    throw new TypeError('Invalid protected Saju source proof server rehearsal configuration.');
  }

  const ports = createSajuHeldSourceProofServerTrustV1(options.proofTrust);
  return Object.freeze({
    version: SAJU_HELD_CURRENT_BIRTH_SERVER_REHEARSAL_VERSION_V1,
    rehearse(verifiedEvidence: VerifiedSubjectIdentityEvidenceV1) {
      return bindCurrentSubjectSajuHeldProofV1({
        verifiedEvidence,
        pool: options.subjectPool,
        issuePort: ports.issuePort,
        verifierTrust: ports.verifierTrust,
      });
    },
  });
}
