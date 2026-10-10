import { createHash, createPublicKey } from 'node:crypto';
import {
  verifySajuHeldStagingAuthorityRegistryV1,
} from './saju-held-staging-authority-registry-v1.js';

export const SAJU_HELD_STAGING_ROOT_PIN_PREFLIGHT_VERSION_V1 =
  'myeongha-saju-staging-root-pin-preflight-v1' as const;

const ENV = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const ID = /^[A-Za-z0-9._:-]{3,128}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;

/**
 * This record is only a claimed snapshot in this pure function. Only a
 * separately operated custody store can attest its provenance/freshness.
 * No API request, signed Registry, or evidence document may designate it.
 */
export interface SajuHeldStagingRootPinSnapshotV1 {
  readonly environmentId: string;
  readonly rootKeyId: string;
  readonly rootSpkiSha256: string;
  readonly minimumRegistryRevision: number;
}

export interface SajuHeldStagingRootPinPreflightInputV1 {
  readonly custodySnapshot: unknown;
  readonly candidateRootSpkiBase64url: unknown;
  readonly registry: unknown;
  readonly registrySignature: unknown;
  readonly nowMs: unknown;
}

type CheckV1 = 'PASS' | 'BLOCKED';
export type SajuHeldStagingRootPinPreflightReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_ROOT_PIN_PREFLIGHT_VERSION_V1;
  contract: 'PINNED_SIGNED_CLAIM_UNVERIFIED_CUSTODY' | 'BLOCKED';
  checks: Readonly<{
    snapshot_shape: CheckV1;
    spki_and_fingerprint: CheckV1;
    registry_signature_and_revision: CheckV1;
    environment_binding: CheckV1;
  }>;
  rootAuthority: 'NOT_VERIFIED';
  signerAuthority: 'NOT_VERIFIED';
  operationalEvidence: 'NOT_VERIFIED';
  stagingConnection: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

function ownRecord(input: unknown, fields: readonly string[]): input is Record<string, unknown> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    const proto: unknown = Object.getPrototypeOf(input);
    if (proto !== null && proto !== Object.prototype) return false;
    const names = Object.keys(input);
    return names.length === fields.length
      && Reflect.ownKeys(input).length === fields.length
      && fields.every(key => {
        const property = Object.getOwnPropertyDescriptor(input, key);
        return property?.enumerable === true && Object.hasOwn(property, 'value');
      });
  } catch {
    return false;
  }
}

/** Parse strictly without accepting inherited fields, getters, or secret metadata. */
export function parseSajuHeldStagingRootPinSnapshotV1(
  value: unknown,
): Readonly<SajuHeldStagingRootPinSnapshotV1> {
  const fields = ['environmentId', 'rootKeyId', 'rootSpkiSha256',
    'minimumRegistryRevision'] as const;
  try {
    if (!ownRecord(value, fields)
      || typeof value.environmentId !== 'string' || !ENV.test(value.environmentId)
      || typeof value.rootKeyId !== 'string' || !ID.test(value.rootKeyId)
      || typeof value.rootSpkiSha256 !== 'string' || !SHA256.test(value.rootSpkiSha256)
      || typeof value.minimumRegistryRevision !== 'number'
      || !Number.isSafeInteger(value.minimumRegistryRevision)
      || value.minimumRegistryRevision < 1) throw new TypeError();
    return Object.freeze({
      environmentId: value.environmentId,
      rootKeyId: value.rootKeyId,
      rootSpkiSha256: value.rootSpkiSha256,
      minimumRegistryRevision: value.minimumRegistryRevision,
    });
  } catch {
    throw new TypeError('Invalid claimed root pin custody snapshot V1.');
  }
}

/**
 * Zero-I/O signature + fingerprint + high-water floor cross-check.
 * Even a PASS is only a signed CLAIM against CALLER-SUPPLIED snapshot;
 * it never proves independent Root custody, a durable floor, or Runner authority.
 */
export function assessSajuHeldStagingRootPinPreflightV1(
  input: SajuHeldStagingRootPinPreflightInputV1,
): SajuHeldStagingRootPinPreflightReportV1 {
  let snapshotOK = false;
  let keyOK = false;
  let signatureOK = false;
  let environmentOK = false;
  try {
    const snapshot = parseSajuHeldStagingRootPinSnapshotV1(input?.custodySnapshot);
    snapshotOK = true;
    const encoded = input?.candidateRootSpkiBase64url;
    if (typeof encoded !== 'string' || encoded.length > 512
      || !BASE64URL.test(encoded)) throw new TypeError();
    const der = Buffer.from(encoded, 'base64url');
    if (der.toString('base64url') !== encoded) throw new TypeError();
    const rootKey = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (rootKey.asymmetricKeyType !== 'ed25519'
      || rootKey.type !== 'public'
      || !Buffer.from(rootKey.export({ format: 'der', type: 'spki' })).equals(der)
      || createHash('sha256').update(der).digest('hex') !== snapshot.rootSpkiSha256) {
      throw new TypeError();
    }
    keyOK = true;

    const result = verifySajuHeldStagingAuthorityRegistryV1({
      registry: input.registry,
      detachedSignature: input.registrySignature,
      suppliedRootPublicKey: rootKey,
      expectedRootKeyId: snapshot.rootKeyId,
      minimumRevision: snapshot.minimumRegistryRevision,
      nowMs: input.nowMs,
    });
    signatureOK = result.signature === 'VALID_FOR_SUPPLIED_ROOT';
    if (signatureOK && result.registry) {
      environmentOK = result.registry.environmentId === snapshot.environmentId;
    }
  } catch {
    // All malformed or inconsistent inputs are blocked, no exceptions from evaluator.
  }

  const checks = Object.freeze({
    snapshot_shape: snapshotOK ? 'PASS' as const : 'BLOCKED' as const,
    spki_and_fingerprint: keyOK ? 'PASS' as const : 'BLOCKED' as const,
    registry_signature_and_revision: signatureOK ? 'PASS' as const : 'BLOCKED' as const,
    environment_binding: environmentOK ? 'PASS' as const : 'BLOCKED' as const,
  });
  return Object.freeze({
    version: SAJU_HELD_STAGING_ROOT_PIN_PREFLIGHT_VERSION_V1,
    contract: Object.values(checks).every(value => value === 'PASS')
      ? 'PINNED_SIGNED_CLAIM_UNVERIFIED_CUSTODY' as const : 'BLOCKED' as const,
    checks,
    rootAuthority: 'NOT_VERIFIED' as const,
    signerAuthority: 'NOT_VERIFIED' as const,
    operationalEvidence: 'NOT_VERIFIED' as const,
    stagingConnection: 'NOT_VERIFIED' as const,
    stagingAdmission: 'HOLD' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    releaseAuthorization: 'NOT_EVALUATED' as const,
    canRunOnce: false as const,
    canExecute: false as const,
    canPublish: false as const,
    canSell: false as const,
  });
}
