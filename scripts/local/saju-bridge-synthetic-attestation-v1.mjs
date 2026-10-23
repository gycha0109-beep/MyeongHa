// Phase 4G: cryptographic Ed25519 verification in DISPOSABLE TESTS ONLY.
// Caller-provided SPKI keys are NOT a real trusted root, independent custody,
// verified identity, causal link, approved operator or production attestation.
// No signing, key storage, DB, HTTP, Runner or authorization integration.
import { createHash, createPublicKey, verify } from 'node:crypto';
import {
  assessSajuBridgeReviewSubmissionV1,
  SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1,
  SAJU_BRIDGE_REVIEW_PACKET_VERSION_V1,
} from './saju-bridge-review-packet-v1.mjs';

export const SAJU_BRIDGE_SYNTHETIC_ATTESTATION_VERSION_V1 =
  'myeongha-saju-synthetic-ed25519-hold-v1';

const exact = (v, keys) => v !== null && typeof v === 'object'
  && !Array.isArray(v) && Object.keys(v).length === keys.length
  && keys.every(k => Object.hasOwn(v, k));
const b64url64 = /^[A-Za-z0-9_-]{86}$/u;
const base64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const source = /^[A-Za-z0-9._:-]{3,64}$/u;

// Domain-separated deterministic message, so every signature binds its
// declared type/source, statement digest, evidence digest, run & timestamp.
// The returned Buffer is NOT a proof of trust; only for test fixtures.
export function makeSajuBridgeSyntheticAttestationMessageV1(packet, item) {
  if (!exact(packet, ['version','scope','runId','evidence','evidenceDigestSha256','submissions'])
    || packet.version !== SAJU_BRIDGE_REVIEW_PACKET_VERSION_V1
    || packet.scope !== 'DISPOSABLE_DOCKER_ONLY'
    || !exact(item, ['type','sourceId','statementDigestSha256',
      'evidenceDigestSha256','submittedAtMs','signatureClaimBase64url'])
    || !SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1.includes(item.type)
    || !source.test(item.sourceId)
    || !/^[a-f0-9]{64}$/u.test(item.statementDigestSha256)
    || !/^[a-f0-9]{64}$/u.test(item.evidenceDigestSha256)
    || !Number.isSafeInteger(item.submittedAtMs)
    || !b64url64.test(item.signatureClaimBase64url)) return null;
  return Buffer.from('myeongha/saju/synthetic-review-signature/v1\0'
    + JSON.stringify([
      packet.version, packet.scope, packet.runId, packet.evidenceDigestSha256,
      item.type, item.sourceId, item.statementDigestSha256,
      item.evidenceDigestSha256, item.submittedAtMs,
    ]), 'utf8');
}
function decision(classification, status) {
  return Object.freeze({
    version: SAJU_BRIDGE_SYNTHETIC_ATTESTATION_VERSION_V1,
    classification,
    signatureVerification: status,
    keyCustodyAuthority: 'NOT_ESTABLISHED',
    independentSourceAuthority: 'NOT_ESTABLISHED',
    sameLogicalAttempt: 'NOT_PROVEN',
    globalCommitOrder: 'NOT_PROVEN',
    manualReviewAdmissibility: 'NOT_ADMISSIBLE',
    decision: 'HOLD_MANUAL_REVIEW',
    canExecute: false, canPublish: false, canSell: false,
    automaticRetry: false, automaticCompensation: false,
  });
}

// Public keys supplied to this function are UNTRUSTED by definition. This
// evaluates synthetically pinned cryptographic consistency, nothing else.
export function assessSajuBridgeSyntheticAttestationV1(packet, nowMs, registry) {
  if (assessSajuBridgeReviewSubmissionV1(packet, nowMs).classification
    !== 'STRUCTURALLY_COMPLETE_UNVERIFIED_HOLD') {
    return decision('REVIEW_PACKET_INVALID_HOLD', 'NOT_PERFORMED');
  }
  if (!Array.isArray(registry)
    || registry.length !== SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1.length) {
    return decision('UNTRUSTED_SYNTHETIC_KEY_SET_HOLD', 'NOT_PERFORMED');
  }
  const keys = new Map();
  const keyFingerprints = new Set();
  for (const entry of registry) {
    if (!exact(entry, ['type','sourceId','publicKeySpkiDerBase64'])
      || !SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1.includes(entry.type)
      || typeof entry.sourceId !== 'string' || !source.test(entry.sourceId)
      || typeof entry.publicKeySpkiDerBase64 !== 'string'
      || !base64.test(entry.publicKeySpkiDerBase64)
      || keys.has(entry.type)) {
      return decision('UNTRUSTED_SYNTHETIC_KEY_SET_HOLD', 'NOT_PERFORMED');
    }
    let key;
    let der;
    try {
      der = Buffer.from(entry.publicKeySpkiDerBase64,'base64');
      if (der.toString('base64') !== entry.publicKeySpkiDerBase64
        || der.length > 256 || der.length < 32) throw new Error('Malformed SPKI');
      key = createPublicKey({key:der,format:'der',type:'spki'});
      if (key.asymmetricKeyType !== 'ed25519'
        || !key.export({format:'der',type:'spki'}).equals(der)) {
        throw new Error('SPKI is not canonical Ed25519');
      }
    } catch {
      return decision('UNTRUSTED_SYNTHETIC_KEY_SET_HOLD','NOT_PERFORMED');
    }
    const fingerprint = createHash('sha256').update(der).digest('hex');
    if (keyFingerprints.has(fingerprint)) {
      return decision('REUSED_SYNTHETIC_KEY_HOLD','NOT_PERFORMED');
    }
    keyFingerprints.add(fingerprint);
    keys.set(entry.type,{sourceId:entry.sourceId,key});
  }
  if (SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1.some(t=>!keys.has(t))) {
    return decision('UNTRUSTED_SYNTHETIC_KEY_SET_HOLD','NOT_PERFORMED');
  }
  for (const claim of packet.submissions) {
    const signer = keys.get(claim.type);
    if (!signer || signer.sourceId !== claim.sourceId) {
      return decision('SYNTHETIC_SIGNER_MISMATCH_HOLD','REJECTED');
    }
    const msg = makeSajuBridgeSyntheticAttestationMessageV1(packet,claim);
    if (msg === null) return decision('SIGNATURE_INVALID_HOLD','REJECTED');
    const bytes = Buffer.from(claim.signatureClaimBase64url,'base64url');
    if (bytes.length !== 64
      || bytes.toString('base64url') !== claim.signatureClaimBase64url
      || !verify(null,msg,signer.key,bytes)) {
      return decision('SIGNATURE_INVALID_HOLD','REJECTED');
    }
  }
  // Pure cryptographic consistency only. No independent authority is present.
  return decision('SYNTHETIC_SIGNATURES_VALID_UNTRUSTED_HOLD',
    'SYNTHETIC_ONLY_VERIFIED');
}
