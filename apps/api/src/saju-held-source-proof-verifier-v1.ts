import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { projectProductReadingResponseV2 } from '../../../packages/api-client/src/product-reading-display.js';

export const SAJU_HELD_SOURCE_PROOF_VERSION_V1 =
  'myeonghwa-source-reading-transport-proof-v1' as const;
export const SAJU_HELD_SOURCE_PROOF_HTTP_VERSION_V1 =
  'myeonghwa-source-reading-proof-http-v1' as const;

const DOMAIN = 'myeongha/saju/source-transport-proof/v1\0';
const ID = /^[a-zA-Z0-9._:-]{3,128}$/u;
const NONCE = /^[a-zA-Z0-9_-]{22,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const MAX_TTL_MS = 120_000;
const CLOCK_SKEW_MS = 15_000;
const ENVELOPE_KEYS = [
  'schemaVersion','lifecycle','state','response','proof',
  'productionInterpretationAuthority','releaseAuthorization',
  'canExecute','canPublish','canSell',
];
const PROOF_KEYS = ['payload','signatureHex'];
const PAYLOAD_KEYS = [
  'version','lifecycle','issuer','audience','keyId','nonce','issuedAtMs','expiresAtMs',
  'requestBodyHash','responseBodyHash','material','productionInterpretationAuthority',
  'releaseAuthorization','canExecute','canPublish','canSell',
];
const MATERIAL_KEYS = [
  'snapshotId','interpretationRunId','registrySnapshotId','executionId','preparationId',
  'selectionId','profileRef','evidenceBundleHash','readingId','responseId','responseBodyHash',
];
const PROFILE_KEYS = ['id','version','contentHash'];

export interface SajuHeldSourceProofVerifierContextV1 {
  /** Must be independently constructed inside an authenticated MyeongHa server execution. */
  readonly expectedNonce: string;
  /** Must be the exact normalized request Saju executed; never trust a caller's digest. */
  readonly expectedRequestBody: unknown;
  readonly nowMs: number;
}

export interface SajuHeldSourceProofVerifierTrustV1 {
  readonly trustedIssuer: string;
  readonly expectedAudience: string;
  readonly trustedKeyId: string;
  readonly keyBytes: Uint8Array;
  /**
   * Atomically claim nonce across every deployment replica; absent or unavailable
   * shared persistence is a failure. A process-local Set is test-only.
   */
  readonly claimNonceOnce: (replayKey: string, expiresAtMs: number) => Promise<boolean>;
}

export type SajuHeldSourceProofVerificationV1 = Readonly<{
  state: 'held' | 'blocked';
  reason: 'transport_integrity_verified_only' | 'invalid_or_replayed_transport_proof';
  transportIntegrity: 'VERIFIED' | 'NOT_VERIFIED';
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
  verifiedSource?: Readonly<{
    readingId: string;
    responseId: string;
    snapshotId: string;
    registrySnapshotId: string;
    profileRef: Readonly<{ id: string; version: string; contentHash: string }>;
    evidenceBundleHash: string;
    requestBodyHash: string;
    responseBodyHash: string;
  }>;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}
/** Byte-for-byte parity with Saju deterministicContentHash v1. */
function canonicalize(value: unknown): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $number: String(value) };
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(input).sort().map((key) => [key, canonicalize(input[key])]),
  );
}
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}
/** Server-only hash parity with Saju deterministicContentHash v1. */
export function hashSajuHeldSourceProofRequestV1(input: unknown): string {
  return digest(input);
}

function blocked(): SajuHeldSourceProofVerificationV1 {
  return Object.freeze({
    state: 'blocked', reason: 'invalid_or_replayed_transport_proof',
    transportIntegrity: 'NOT_VERIFIED', sourceAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  });
}
function validMaterial(value: unknown): value is Record<string, unknown> {
  if (!record(value) || !exact(value, MATERIAL_KEYS) || !record(value.profileRef)
    || !exact(value.profileRef, PROFILE_KEYS)) return false;
  const strings = [
    value.snapshotId, value.interpretationRunId, value.registrySnapshotId,
    value.executionId, value.preparationId, value.selectionId,
    value.readingId, value.responseId,
    value.profileRef.id, value.profileRef.version,
  ];
  return strings.every((item) => typeof item === 'string' && item.length > 0)
    && [value.profileRef.contentHash, value.evidenceBundleHash, value.responseBodyHash]
      .every((item) => typeof item === 'string' && HASH.test(item));
}

/**
 * Server-side Preview-only transport verification. This does NOT verify
 * Subject/Birth Revision ownership, Saju semantic truth, release or Commerce.
 */
export async function verifySajuHeldSourceProofV1(
  envelope: unknown,
  trust: SajuHeldSourceProofVerifierTrustV1,
  context: SajuHeldSourceProofVerifierContextV1,
): Promise<SajuHeldSourceProofVerificationV1> {
  try {
    if (!record(envelope) || !exact(envelope, ENVELOPE_KEYS)
      || envelope.schemaVersion !== SAJU_HELD_SOURCE_PROOF_HTTP_VERSION_V1
      || envelope.lifecycle !== 'preview' || envelope.state !== 'held'
      || envelope.productionInterpretationAuthority !== 'NOT_EVALUATED'
      || envelope.releaseAuthorization !== 'NOT_EVALUATED'
      || envelope.canExecute !== false || envelope.canPublish !== false
      || envelope.canSell !== false
      || !record(envelope.proof) || !exact(envelope.proof, PROOF_KEYS)
      || !record(envelope.proof.payload) || !exact(envelope.proof.payload, PAYLOAD_KEYS)
      || !record(envelope.response)
      || typeof trust.trustedIssuer !== 'string' || !ID.test(trust.trustedIssuer)
      || typeof trust.expectedAudience !== 'string' || !ID.test(trust.expectedAudience)
      || typeof trust.trustedKeyId !== 'string' || !ID.test(trust.trustedKeyId)
      || !(trust.keyBytes instanceof Uint8Array) || trust.keyBytes.byteLength < 32
      || typeof trust.claimNonceOnce !== 'function'
      || !NONCE.test(context.expectedNonce) || !Number.isSafeInteger(context.nowMs)) return blocked();

    const proof = envelope.proof;
    const payload = proof.payload as Record<string, unknown>;
    if (payload.version !== SAJU_HELD_SOURCE_PROOF_VERSION_V1
      || payload.lifecycle !== 'preview'
      || payload.issuer !== trust.trustedIssuer
      || payload.audience !== trust.expectedAudience
      || payload.keyId !== trust.trustedKeyId
      || payload.nonce !== context.expectedNonce
      || payload.productionInterpretationAuthority !== 'NOT_EVALUATED'
      || payload.releaseAuthorization !== 'NOT_EVALUATED'
      || payload.canExecute !== false || payload.canPublish !== false
      || payload.canSell !== false
      || !validMaterial(payload.material)
      || typeof payload.requestBodyHash !== 'string' || !HASH.test(payload.requestBodyHash)
      || typeof payload.responseBodyHash !== 'string' || !HASH.test(payload.responseBodyHash)
      || !Number.isSafeInteger(payload.issuedAtMs)
      || !Number.isSafeInteger(payload.expiresAtMs)
      || (payload.expiresAtMs as number) - (payload.issuedAtMs as number) > MAX_TTL_MS
      || (payload.expiresAtMs as number) <= (payload.issuedAtMs as number)
      || (payload.issuedAtMs as number) > context.nowMs + CLOCK_SKEW_MS
      || (payload.expiresAtMs as number) <= context.nowMs
      || typeof proof.signatureHex !== 'string' || !HASH.test(proof.signatureHex)) return blocked();

    const display = projectProductReadingResponseV2(envelope.response);
    if (display.kind !== 'delivered'
      || payload.material.readingId !== display.readingId
      || payload.material.responseId !== envelope.response.responseId
      || payload.material.responseBodyHash !== payload.responseBodyHash
      || payload.requestBodyHash !== digest(context.expectedRequestBody)
      || payload.responseBodyHash !== digest(envelope.response)) return blocked();

    const signed = createHmac('sha256', trust.keyBytes).update(DOMAIN)
      .update(digest(payload)).digest();
    const received = Buffer.from(proof.signatureHex, 'hex');
    if (signed.length !== received.length || !timingSafeEqual(signed, received)) return blocked();
    const replayKey = trust.trustedIssuer + ':' + trust.expectedAudience + ':' + context.expectedNonce;
    if (!(await trust.claimNonceOnce(replayKey, payload.expiresAtMs as number))) return blocked();

    const material = payload.material;
    const profile = material.profileRef as Record<string, unknown>;
    return Object.freeze({
      state: 'held', reason: 'transport_integrity_verified_only',
      transportIntegrity: 'VERIFIED', sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      verifiedSource: Object.freeze({
        readingId: material.readingId as string, responseId: material.responseId as string,
        snapshotId: material.snapshotId as string,
        registrySnapshotId: material.registrySnapshotId as string,
        profileRef: Object.freeze({
          id: profile.id as string, version: profile.version as string,
          contentHash: profile.contentHash as string,
        }),
        evidenceBundleHash: material.evidenceBundleHash as string,
        requestBodyHash: payload.requestBodyHash as string,
        responseBodyHash: payload.responseBodyHash as string,
      }),
    });
  } catch {
    return blocked();
  }
}
