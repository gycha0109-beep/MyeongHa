import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';
import type {
  PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import {
  prepareOfficialReaderS3BoundPreviewSourceV1,
} from './official-reader-private-s3-source-binding-v1.js';
import {
  createOfficialReaderPrivateCurrentPurchaseAuthorityPortV1,
  type OfficialReaderPrivateCurrentPurchaseAuthorityPortV1,
} from './official-reader-private-exact-verified-purchase-guard-v1.js';
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

/**
 * The language-model/private generator owns ONLY answer text. In particular,
 * it cannot issue an Saju Production attestation, choose a Receipt-backed
 * Grant, or mint persisted answer/attempt/message identities.
 */
type PrivateGenerationResultV1 = Readonly<{ privateBody: string }>;

export type OfficialReaderProductionCommitStagingV1 = Pick<
  PrivateOfficialReaderPaidAnswerStagedV1,
  | 'turnId' | 'attemptId' | 'bodyId' | 'safeMessageId'
  | 'originatingGrantId' | 'productionSource'
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
    currentVerifiedPurchaseAuthorityPort: OfficialReaderPrivateCurrentPurchaseAuthorityPortV1,
  ) => Promise<PreparedOfficialReadingReaderAdmissionV1>;

  /**
   * Must use the server-owned Saju transport request and one-time nonce;
   * trust/trusted key is never supplied by the browser or AI generation.
   * This call runs OUTSIDE both PostgreSQL transactions.
   */
  readonly prepareSignedSource: (
    source: CharacterStandardReadingKnowledgeSourceV1,
  ) => Promise<PreparedSignedSourceV1>;

  /**
   * Independent server-owned Saju PRODUCTION attestation + purchase lineage
   * + answer identity resolver. This is NOT the Preview transport verifier or
   * a callback to the model; never fill it from a browser/provider response.
   *
   * Intentionally has NO default. Saju's Production issuer and Privacy
   * acceptance are not installed; without this port private generation is
   * denied before spending inference. The held S5 DB gate remains independent.
   */
  readonly prepareProductionCommitStaging?: (input: Readonly<{
    originalAdmission: PreparedOfficialReadingReaderAdmissionV1;
    verifiedPreviewCandidate: unknown;
  }>) => Promise<OfficialReaderProductionCommitStagingV1 | null>;

  /** Only private answer text, never an attestation/Grant/identity. */
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SOURCE_HASH = /^sha256:v1:[a-f0-9]{64}$/u;

function exactPlain(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return (prototype === Object.prototype || prototype === null)
    && Reflect.ownKeys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key)
      && Object.getOwnPropertyDescriptor(value, key)?.get === undefined);
}

function verifiedServerStaging(
  value: unknown,
  admission: PreparedOfficialReadingReaderAdmissionV1,
): OfficialReaderProductionCommitStagingV1 {
  const keys = [
    'turnId', 'attemptId', 'bodyId', 'safeMessageId',
    'originatingGrantId', 'productionSource',
  ];
  if (!exactPlain(value, keys)) return unavailable();
  const uuids = [value.turnId, value.attemptId, value.bodyId,
    value.safeMessageId, value.originatingGrantId];
  if (!uuids.every(id => typeof id === 'string' && UUID.test(id))) return unavailable();
  const proof = value.productionSource;
  if (!exactPlain(proof, [
    'sourceAttestationRef','sourceResponseHash',
    'semanticGuardVersion','outputGuardVersion',
  ])) return unavailable();
  const strings = [proof.sourceAttestationRef,
    proof.semanticGuardVersion, proof.outputGuardVersion];
  if (!strings.every(v => typeof v === 'string'
      && v.trim() === v && v.length > 0 && v.length <= 256)
      || typeof proof.sourceResponseHash !== 'string'
      || !SOURCE_HASH.test(proof.sourceResponseHash)
      || proof.sourceResponseHash !== 'sha256:v1:' +
        hashSajuHeldSourceProofRequestV1(admission.source.responseSnapshotJsonb)) {
    return unavailable();
  }
  // These are syntactic/binding defenses only; the Production Saju issuer
  // must verify the attestation independently and the SQL S5 gate is HELD.
  return Object.freeze({
    turnId: (value.turnId as string).toLowerCase(),
    attemptId: (value.attemptId as string).toLowerCase(),
    bodyId: (value.bodyId as string).toLowerCase(),
    safeMessageId: (value.safeMessageId as string).toLowerCase(),
    originatingGrantId: (value.originatingGrantId as string).toLowerCase(),
    productionSource: Object.freeze({
      sourceAttestationRef: proof.sourceAttestationRef as string,
      sourceResponseHash: proof.sourceResponseHash as string,
      semanticGuardVersion: proof.semanticGuardVersion as string,
      outputGuardVersion: proof.outputGuardVersion as string,
    }),
  });
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
        const admission = await input.prepareAdmission(
          scope,effectiveAt,
          createOfficialReaderPrivateCurrentPurchaseAuthorityPortV1(scope),
        );
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

    // No DB transaction is held here. A PREVIEW signature is still NOT the
    // official Production source issuer. If the independently verified
    // Production/Receipt-bound staging authority is absent, do not even call
    // the paid private generator.
    if (typeof input.prepareProductionCommitStaging !== 'function') {
      return unavailable();
    }
    const trusted = verifiedServerStaging(
      await input.prepareProductionCommitStaging({
        originalAdmission: first,
        verifiedPreviewCandidate: preparedSource.candidate,
      }),
      first,
    );

    // Only the private text is produced by the model/provider. Forbid
    // provider-originated source assertions, IDs, metadata and delivery flags.
    const generated: unknown = await input.generatePrivate(first.source);
    if (!exactPlain(generated, ['privateBody'])
        || typeof generated.privateBody !== 'string'
        || generated.privateBody.trim().length === 0
        || Buffer.byteLength(generated.privateBody, 'utf8') > 262_144) {
      return unavailable();
    }

    const staged: PrivateOfficialReaderPaidAnswerStagedV1 = Object.freeze({
      ...trusted,
      privateBody: generated.privateBody,
      originalAdmission: first,
      sourceCoverageCandidate: preparedSource.candidate,
      boundSignedPreviewSource: signed,
    });

    return await commitPrivateOfficialReaderPaidAnswerV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      staged,
      key: input.key,
      prepareFreshAdmission: async (scope, effectiveAt, purchaseAuthorityPort) =>
        input.prepareAdmission(scope,effectiveAt,purchaseAuthorityPort),
    });
  } catch {
    return unavailable();
  }
}
