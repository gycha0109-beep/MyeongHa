import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';
import type {
  PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import {
  prepareOfficialReaderS3BoundPreviewSourceV1,
} from './official-reader-private-s3-source-binding-v1.js';
import {
  assertOfficialReaderPrivateCurrentVerifiedPurchaseV1,
} from './official-reader-private-exact-verified-purchase-guard-v1.js';
import type {
  SajuHeldSourceProofVerifierContextV1,
  SajuHeldSourceProofVerifierTrustV1,
} from './saju-held-source-proof-verifier-v1.js';
import {
  commitPrivateOfficialReaderPaidAnswerV1,
  type PrivateOfficialReaderPaidAnswerStagedV1,
  type PrivateOfficialReaderPaidAnswerCommittedV1,
} from './official-reader-private-paid-answer-commit-v1.js';
import type {
  OfficialReaderProtectedBodyKeyV1,
} from './official-reader-protected-body-crypto-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectExecutionScopeV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

/**
 * The exact T1 -> independent Saju PREVIEW verification -> private generation
 * -> fresh T2 composition. No signed Preview becomes an official Production
 * issuer: S5 SQL still refuses persistence without BOTH a positive Saju
 * production attestation receipt and Owner-authorized precommit gate.
 *
 * This module does not mount an HTTP route, buy an Offer, contact a vendor,
 * store raw response text in Chat, or emit a delivery event.
 */

const CLOCK_SQL = 'select clock_timestamp()::text as "effectiveAt"';

type PrivateGenerationResultV1 = Omit<
  PrivateOfficialReaderPaidAnswerStagedV1,
  'originalAdmission' | 'boundSignedPreviewSource' | 'sourceCoverageCandidate'
>;

interface PreparedSignedSourceV1 {
  readonly candidate: unknown;
  readonly signedPreviewEnvelope: unknown;
  readonly trust: SajuHeldSourceProofVerifierTrustV1;
  readonly context: SajuHeldSourceProofVerifierContextV1;
}

export interface OfficialReaderSourceBoundT1T2InputV1 {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly key: OfficialReaderProtectedBodyKeyV1;
  readonly prepareAdmission: (
    scope: PostgresSubjectExecutionScopeV1,
    effectiveAt: string,
  ) => Promise<PreparedOfficialReadingReaderAdmissionV1>;

  /**
   * Must use the server-owned Saju transport request and one-time nonce;
   * trust/trusted key is never supplied by the browser or AI generation.
   * This call runs OUTSIDE both PostgreSQL transactions.
   */
  readonly prepareSignedSource: (
    source: CharacterStandardReadingKnowledgeSourceV1,
  ) => Promise<PreparedSignedSourceV1>;

  /** Only a private server-side generator; never ordinary Chat transport. */
  readonly generatePrivate: (
    source: CharacterStandardReadingKnowledgeSourceV1,
  ) => Promise<PrivateGenerationResultV1>;
}

export class OfficialReaderSourceBoundT1T2ErrorV1 extends Error {
  readonly code = 'OFFICIAL_READER_PRIVATE_T2_HELD' as const;
  constructor() {
    super('Official Reader private source-bound generation is unavailable.');
    this.name = 'OfficialReaderSourceBoundT1T2ErrorV1';
  }
}
function unavailable(): never {
  throw new OfficialReaderSourceBoundT1T2ErrorV1();
}

async function clock(scope: PostgresSubjectExecutionScopeV1): Promise<string> {
  const result = await scope.client.query<{ effectiveAt: unknown }>(CLOCK_SQL);
  const effectiveAt = result.rows[0]?.effectiveAt;
  if (result.rows.length !== 1 || typeof effectiveAt !== 'string'
      || !Number.isFinite(Date.parse(effectiveAt))) return unavailable();
  return effectiveAt;
}

/**
 * The high-level command never returns Saju source text, staging output,
 * signer material, or original body; only the committed metadata once the
 * independently held Production S5 guard is legitimately replaced.
 */
export async function runOfficialReaderPrivateSourceBoundT1T2V1(
  input: OfficialReaderSourceBoundT1T2InputV1,
): Promise<PrivateOfficialReaderPaidAnswerCommittedV1> {
  try {
    // T1 is one canonical Subject DB transaction, not an S5 write.
    const first = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async (scope) => {
        const effectiveAt = await clock(scope);
        const admission = await input.prepareAdmission(scope, effectiveAt);
        if (admission.scope.subjectId !== scope.resolvedSubject.subjectId
            || admission.scope.effectiveAt !== effectiveAt) return unavailable();
        // A2's active Grant is insufficient: a verified provider refund
        // can revoke the original Receipt independently. Acquire S1 and
        // require a surviving verified exact Reader+Reading+Bundle purchase
        // BEFORE any private Saju network/source proof or generator call.
        await assertOfficialReaderPrivateCurrentVerifiedPurchaseV1({
          scope, admission,
        });
        return admission;
      },
    });

    // Saju transport verification performs shared nonce claim and HMAC
    // authentication OUTSIDE PostgreSQL S1/Reader locks.
    const preparedSource = await input.prepareSignedSource(first.source);
    const signed = await prepareOfficialReaderS3BoundPreviewSourceV1({
      originalAdmission: first,
      sourceCoverageCandidate: preparedSource.candidate,
      signedPreviewEnvelope: preparedSource.signedPreviewEnvelope,
      verifierTrust: preparedSource.trust,
      verifierContext: preparedSource.context,
    });

    // No DB transaction is held here. This callback may only be installed
    // by the private server, after its independent semantic/output guards.
    const generated = await input.generatePrivate(first.source);
    if (generated === null || typeof generated !== 'object'
        || Array.isArray(generated)
        || typeof generated.privateBody !== 'string'
        || generated.privateBody.trim().length === 0) return unavailable();

    // Caller cannot replace the server-issued T1 admission or the one-use
    // signed proof handle through a generator's returned object.
    const staged: PrivateOfficialReaderPaidAnswerStagedV1 = Object.freeze({
      ...generated,
      originalAdmission: first,
      sourceCoverageCandidate: preparedSource.candidate,
      boundSignedPreviewSource: signed,
    });

    return await commitPrivateOfficialReaderPaidAnswerV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      staged,
      key: input.key,
      prepareFreshAdmission: async (scope, effectiveAt) =>
        input.prepareAdmission(scope, effectiveAt),
    });
  } catch {
    return unavailable();
  }
}
