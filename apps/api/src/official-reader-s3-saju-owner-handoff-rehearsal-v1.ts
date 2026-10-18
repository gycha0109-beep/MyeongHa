import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { OfficialReadingReaderAdmissionScopeV1 } from './official-reading-reader-admission-v1.js';
import type { CharacterStandardReadingProtectedSajuContextV1 } from './character-standard-reading-protected-context.js';
import {
  preflightOfficialReaderS3SourceCoverageV1,
} from './official-reader-s3-source-coverage-preflight-v1.js';

/**
 * S3 rehearsal boundary, NOT a production Saju Owner issuance contract.
 * The independently provisioned signing key must never be the Preview proof
 * HMAC key or an API credential. This module issues no signatures.
 * It stores/returns no raw source, signed candidate, identity, or fingerprint.
 */
export const OFFICIAL_READER_S3_OWNER_HANDOFF_REHEARSAL_VERSION_V1 =
  'official-reader-s3-owner-handoff-rehearsal-v1' as const;
const DOMAIN = 'myeongha/official-reader/s3-owner-handoff-rehearsal/v1\0';
const ID = /^[A-Za-z0-9._:-]{3,128}$/u;
const NONCE = /^[A-Za-z0-9_-]{22,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const PAYLOAD_KEYS = [
  'schemaVersion', 'lifecycle', 'issuer', 'audience', 'keyId', 'nonce',
  'issuedAtMs', 'expiresAtMs', 'subjectId', 'threadId', 'contentRevision',
  'readingId', 'readerCharacterId', 'readerContentBundleId', 'contentReleaseId',
  'productId', 'productSpecVersion', 'sajuDomain', 'readingContractVersion',
  'productRuleVersion', 'approvedPolicyRevision',
  'officialArtifactResponseHash', 'candidateDigest',
] as const;
const MAX_TTL_MS = 120_000;
const CLOCK_SKEW_MS = 15_000;
const MAX_CANDIDATE_BYTES = 32_768;

type Dict = Record<string, unknown>;
function record(value: unknown): value is Dict {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Dict, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length
    && fields.every(field => Object.hasOwn(value, field));
}
function canonicalize(value: unknown): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $number: String(value) };
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const input = value as Dict;
  return Object.fromEntries(Object.keys(input).sort().map(k => [k, canonicalize(input[k])]));
}
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export interface OfficialReaderS3OwnerHandoffTrustV1 {
  readonly trustedIssuer: string;
  readonly expectedAudience: string;
  readonly trustedKeyId: string;
  /** Separate, server-only synthetic rehearsal secret; NO production issuance. */
  readonly keyBytes: Uint8Array;
  /** Independently backed by atomic shared storage, never a per-request Set in deployment. */
  readonly claimNonceOnce: (replayKey: string, expiresAtMs: number) => Promise<boolean>;
}

export type OfficialReaderS3OwnerHandoffRehearsalVerdictV1 = Readonly<{
  version: typeof OFFICIAL_READER_S3_OWNER_HANDOFF_REHEARSAL_VERSION_V1;
  state: 'held' | 'blocked';
  reason: 'signed_candidate_rehearsal_only' | 'invalid_or_untrusted_s3_candidate';
  sourceAuthority: 'NOT_EVALUATED';
  semanticAuthority: 'NOT_EVALUATED';
  outputAuthority: 'NOT_EVALUATED';
  privacyApproval: 'NOT_EVALUATED';
  canPublish: false;
  canSell: false;
  publicDisclosureAuthorized: false;
}>;

function verdict(state: 'held' | 'blocked'): OfficialReaderS3OwnerHandoffRehearsalVerdictV1 {
  return Object.freeze({
    version: OFFICIAL_READER_S3_OWNER_HANDOFF_REHEARSAL_VERSION_V1,
    state,
    reason: state === 'held'
      ? 'signed_candidate_rehearsal_only' as const
      : 'invalid_or_untrusted_s3_candidate' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    semanticAuthority: 'NOT_EVALUATED' as const,
    outputAuthority: 'NOT_EVALUATED' as const,
    privacyApproval: 'NOT_EVALUATED' as const,
    canPublish: false as const,
    canSell: false as const,
    publicDisclosureAuthorized: false as const,
  });
}

/**
 * Checks an owner-HANDOFF REHEARSAL signature only after exact DB-authorized
 * source-unit coverage. Caller must independently obtain the CURRENT Saju
 * official issuer contract, owner approval, and Privacy approval before S5.
 * Even a valid synthetic signature always returns HELD; no T2/save/send.
 */
export async function rehearseOfficialReaderS3SajuOwnerHandoffV1(input: Readonly<{
  scope: OfficialReadingReaderAdmissionScopeV1;
  protectedSource: CharacterStandardReadingProtectedSajuContextV1;
  envelope: unknown;
  expectedNonce: string;
  nowMs: number;
  trust: OfficialReaderS3OwnerHandoffTrustV1;
}>): Promise<OfficialReaderS3OwnerHandoffRehearsalVerdictV1> {
  try {
    const { scope, envelope, trust } = input;
    if (!record(envelope) || !exact(envelope, ['schemaVersion', 'candidate', 'proof'])
      || envelope.schemaVersion !== OFFICIAL_READER_S3_OWNER_HANDOFF_REHEARSAL_VERSION_V1
      || !record(envelope.proof) || !exact(envelope.proof, ['payload', 'signatureHex'])
      || !record(envelope.proof.payload)
      || !exact(envelope.proof.payload, PAYLOAD_KEYS)
      || typeof envelope.proof.signatureHex !== 'string'
      || !HASH.test(envelope.proof.signatureHex)
      || typeof trust.trustedIssuer !== 'string' || !ID.test(trust.trustedIssuer)
      || typeof trust.expectedAudience !== 'string' || !ID.test(trust.expectedAudience)
      || typeof trust.trustedKeyId !== 'string' || !ID.test(trust.trustedKeyId)
      || !(trust.keyBytes instanceof Uint8Array) || trust.keyBytes.length < 32
      || typeof trust.claimNonceOnce !== 'function'
      || typeof input.expectedNonce !== 'string' || !NONCE.test(input.expectedNonce)
      || !Number.isSafeInteger(input.nowMs)) return verdict('blocked');

    const payload = envelope.proof.payload;
    const candidate = envelope.candidate;
    const candidateJson = JSON.stringify(canonicalize(candidate));
    if (typeof candidateJson !== 'string'
      || Buffer.byteLength(candidateJson, 'utf8') > MAX_CANDIDATE_BYTES
      || preflightOfficialReaderS3SourceCoverageV1({
        scope, protectedSource: input.protectedSource, candidate,
      }).state !== 'held') return verdict('blocked');

    if (payload.schemaVersion !== OFFICIAL_READER_S3_OWNER_HANDOFF_REHEARSAL_VERSION_V1
      || payload.lifecycle !== 'synthetic_rehearsal_only'
      || payload.issuer !== trust.trustedIssuer
      || payload.audience !== trust.expectedAudience
      || payload.keyId !== trust.trustedKeyId
      || payload.nonce !== input.expectedNonce
      || payload.subjectId !== scope.subjectId
      || payload.threadId !== scope.threadId
      || payload.contentRevision !== scope.contentRevision
      || payload.readingId !== scope.readingId
      || payload.readerCharacterId !== scope.readerCharacterId
      || payload.readerContentBundleId !== scope.readerContentBundleId
      || payload.contentReleaseId !== scope.contentReleaseId
      || payload.productId !== scope.productId
      || payload.productSpecVersion !== scope.productSpecVersion
      || payload.sajuDomain !== scope.sajuDomain
      || payload.readingContractVersion !== scope.readingContractVersion
      || payload.productRuleVersion !== scope.productRuleVersion
      || payload.approvedPolicyRevision !== scope.approvedPolicyRevision
      || payload.officialArtifactResponseHash !== scope.officialArtifactResponseHash
      || typeof payload.candidateDigest !== 'string'
      || !HASH.test(payload.candidateDigest)
      || payload.candidateDigest !== digest(candidate)
      || !Number.isSafeInteger(payload.issuedAtMs)
      || !Number.isSafeInteger(payload.expiresAtMs)
      || (payload.expiresAtMs as number) <= (payload.issuedAtMs as number)
      || (payload.expiresAtMs as number) - (payload.issuedAtMs as number) > MAX_TTL_MS
      || (payload.issuedAtMs as number) > input.nowMs + CLOCK_SKEW_MS
      || (payload.expiresAtMs as number) <= input.nowMs) return verdict('blocked');

    const expected = createHmac('sha256', Buffer.from(trust.keyBytes))
      .update(DOMAIN).update(digest(payload)).digest();
    const received = Buffer.from(envelope.proof.signatureHex, 'hex');
    if (expected.length !== received.length
      || !timingSafeEqual(expected, received)) return verdict('blocked');

    // Canonical tuple digest prevents delimiter collisions across issuers,
    // audience names, key rotations and shared-nonce-store namespaces.
    const replayKey = digest([
      OFFICIAL_READER_S3_OWNER_HANDOFF_REHEARSAL_VERSION_V1,
      trust.trustedIssuer, trust.expectedAudience, trust.trustedKeyId,
      input.expectedNonce,
    ]);
    if (!(await trust.claimNonceOnce(replayKey, payload.expiresAtMs as number))) {
      return verdict('blocked');
    }
    return verdict('held');
  } catch {
    return verdict('blocked');
  }
}
