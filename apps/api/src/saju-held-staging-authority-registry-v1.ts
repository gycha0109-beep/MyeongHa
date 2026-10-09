import { createPublicKey, createHash, verify, type KeyObject } from 'node:crypto';

export const SAJU_HELD_STAGING_AUTHORITY_REGISTRY_VERSION_V1 =
  'myeongha-saju-staging-authority-registry-v1' as const;
export const SAJU_HELD_STAGING_AUTHORITY_REGISTRY_DOMAIN_V1 =
  'myeongha/saju/staging/authority-registry/v1\0' as const;

const REGISTRY_KEYS = ['version', 'rootKeyId', 'revision', 'environmentId',
  'issuedAtMs', 'expiresAtMs', 'keys'] as const;
const KEY_FIELDS = ['keyId', 'principalId', 'purpose', 'publicKeySpkiBase64url',
  'notBeforeMs', 'notAfterMs', 'revokedAtMs'] as const;
const ID = /^[A-Za-z0-9._:-]{3,128}$/u;
const ENV = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const URL64 = /^[A-Za-z0-9_-]+$/u;
const VALID_MS = 7 * 24 * 60 * 60_000;

function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    const names = Object.keys(value);
    return names.length === fields.length && Reflect.ownKeys(value).length === names.length
      && fields.every(k => {
        const d = Object.getOwnPropertyDescriptor(value, k);
        return d?.enumerable === true && Object.hasOwn(d, 'value');
      });
  } catch { return false; }
}

function validTime(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
}
function validEd25519Spki(value: unknown): value is string {
  if (typeof value !== 'string' || !URL64.test(value) || value.length > 512) return false;
  try {
    const der = Buffer.from(value, 'base64url');
    if (der.toString('base64url') !== value) return false;
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    return key.asymmetricKeyType === 'ed25519'
      && Buffer.from(key.export({format: 'der', type: 'spki'})).equals(der);
  } catch { return false; }
}

export type SajuStagingRegistryPrincipalPurposeV1 =
  'OPERATOR_APPROVAL' | 'TARGET_ATTESTATION';
export interface SajuStagingAuthorityKeyV1 {
  readonly keyId: string;
  readonly principalId: string;
  readonly purpose: SajuStagingRegistryPrincipalPurposeV1;
  readonly publicKeySpkiBase64url: string;
  readonly notBeforeMs: number;
  readonly notAfterMs: number;
  readonly revokedAtMs: number | null;
}
export interface SajuStagingAuthorityRegistryV1 {
  readonly version: typeof SAJU_HELD_STAGING_AUTHORITY_REGISTRY_VERSION_V1;
  readonly rootKeyId: string;
  readonly revision: number;
  readonly environmentId: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly keys: readonly Readonly<SajuStagingAuthorityKeyV1>[];
}

export function parseSajuHeldStagingAuthorityRegistryV1(
  input: unknown,
): Readonly<SajuStagingAuthorityRegistryV1> {
  try {
    if (!exact(input, REGISTRY_KEYS)
      || input.version !== SAJU_HELD_STAGING_AUTHORITY_REGISTRY_VERSION_V1
      || typeof input.rootKeyId !== 'string' || !ID.test(input.rootKeyId)
      || !validTime(input.revision) || input.revision < 1
      || typeof input.environmentId !== 'string' || !ENV.test(input.environmentId)
      || !validTime(input.issuedAtMs) || !validTime(input.expiresAtMs)
      || input.expiresAtMs <= input.issuedAtMs
      || input.expiresAtMs - input.issuedAtMs > VALID_MS
      || !Array.isArray(input.keys) || input.keys.length < 2 || input.keys.length > 16) {
      throw new TypeError();
    }
    const parsed: SajuStagingAuthorityKeyV1[] = [];
    let lastKeyId = '';
    const fingerprints = new Set<string>();
    for (const entry of input.keys as unknown[]) {
      if (!exact(entry, KEY_FIELDS)
        || typeof entry.keyId !== 'string' || !ID.test(entry.keyId)
        || entry.keyId <= lastKeyId || entry.keyId === input.rootKeyId
        || typeof entry.principalId !== 'string' || !ID.test(entry.principalId)
        || (entry.purpose !== 'OPERATOR_APPROVAL' && entry.purpose !== 'TARGET_ATTESTATION')
        || !validEd25519Spki(entry.publicKeySpkiBase64url)
        || !validTime(entry.notBeforeMs) || !validTime(entry.notAfterMs)
        || entry.notAfterMs <= entry.notBeforeMs
        || (entry.revokedAtMs !== null && !validTime(entry.revokedAtMs))) {
        throw new TypeError();
      }
      const fingerprint = createHash('sha256')
        .update(Buffer.from(entry.publicKeySpkiBase64url, 'base64url')).digest('hex');
      if (fingerprints.has(fingerprint)) throw new TypeError();
      fingerprints.add(fingerprint);
      lastKeyId = entry.keyId;
      parsed.push(Object.freeze({
        keyId: entry.keyId, principalId: entry.principalId,
        purpose: entry.purpose, publicKeySpkiBase64url: entry.publicKeySpkiBase64url,
        notBeforeMs: entry.notBeforeMs, notAfterMs: entry.notAfterMs,
        revokedAtMs: entry.revokedAtMs,
      } as SajuStagingAuthorityKeyV1));
    }
    if (!parsed.some(key => key.purpose === 'OPERATOR_APPROVAL')
      || !parsed.some(key => key.purpose === 'TARGET_ATTESTATION')) throw new TypeError();
    return Object.freeze({
      version: SAJU_HELD_STAGING_AUTHORITY_REGISTRY_VERSION_V1,
      rootKeyId: input.rootKeyId, revision: input.revision,
      environmentId: input.environmentId,
      issuedAtMs: input.issuedAtMs, expiresAtMs: input.expiresAtMs,
      keys: Object.freeze(parsed),
    } as SajuStagingAuthorityRegistryV1);
  } catch {
    throw new TypeError('Invalid isolated staging authority registry V1.');
  }
}

export function canonicalSajuHeldStagingAuthorityRegistryBytesV1(input: unknown): Uint8Array {
  const r = parseSajuHeldStagingAuthorityRegistryV1(input);
  return Buffer.from(SAJU_HELD_STAGING_AUTHORITY_REGISTRY_DOMAIN_V1
    + JSON.stringify([
      r.version, r.rootKeyId, r.revision, r.environmentId, r.issuedAtMs,
      r.expiresAtMs, r.keys.map(key => KEY_FIELDS.map(field => key[field])),
    ]), 'utf8');
}

export interface SajuStagingRegistryVerifyInputV1 {
  readonly registry: unknown;
  readonly detachedSignature: unknown;
  /** Must be pinned and independently governed; a caller-supplied root is NOT an authority. */
  readonly suppliedRootPublicKey: unknown;
  readonly expectedRootKeyId: unknown;
  /** Floor must originate from a durable independently protected policy store. */
  readonly minimumRevision: unknown;
  readonly nowMs: unknown;
}
export type SajuStagingRegistryVerificationV1 = Readonly<{
  signature: 'VALID_FOR_SUPPLIED_ROOT' | 'BLOCKED';
  sourceAuthority: 'NOT_VERIFIED';
  registry: Readonly<SajuStagingAuthorityRegistryV1> | null;
}>;

export function verifySajuHeldStagingAuthorityRegistryV1(
  input: SajuStagingRegistryVerifyInputV1,
): SajuStagingRegistryVerificationV1 {
  let registry: Readonly<SajuStagingAuthorityRegistryV1> | null = null;
  let valid = false;
  try {
    registry = parseSajuHeldStagingAuthorityRegistryV1(input?.registry);
    const key = input.suppliedRootPublicKey;
    const signature = input.detachedSignature;
    if (registry.rootKeyId === input.expectedRootKeyId
      && typeof input.expectedRootKeyId === 'string'
      && validTime(input.nowMs)
      && input.nowMs >= registry.issuedAtMs && input.nowMs < registry.expiresAtMs
      && Number.isSafeInteger(input.minimumRevision) && typeof input.minimumRevision === 'number'
      && input.minimumRevision >= 1 && registry.revision >= input.minimumRevision
      && key !== null && typeof key === 'object'
      && key instanceof Object && (key as KeyObject).type === 'public'
      && (key as KeyObject).asymmetricKeyType === 'ed25519'
      && typeof signature === 'string' && /^[A-Za-z0-9_-]{86}$/u.test(signature)) {
      const sig = Buffer.from(signature, 'base64url');
      valid = sig.length === 64 && sig.toString('base64url') === signature
        && verify(null, canonicalSajuHeldStagingAuthorityRegistryBytesV1(registry),
          key as KeyObject, sig);
    }
  } catch { /* fail-closed */ }
  return Object.freeze({
    signature: valid ? 'VALID_FOR_SUPPLIED_ROOT' as const : 'BLOCKED' as const,
    sourceAuthority: 'NOT_VERIFIED' as const,
    registry: valid ? registry : null,
  });
}

/** The policy alone cannot attest to the authenticity or custody of its root key. */
export function findSajuHeldStagingRegistryKeyV1(
  verified: SajuStagingRegistryVerificationV1,
  expectedKeyId: string,
  purpose: SajuStagingRegistryPrincipalPurposeV1,
  environmentId: string,
  nowMs: number,
): Readonly<SajuStagingAuthorityKeyV1> | null {
  if (verified.signature !== 'VALID_FOR_SUPPLIED_ROOT'
    || verified.registry === null || verified.registry.environmentId !== environmentId
    || !validTime(nowMs)) return null;
  return verified.registry.keys.find(k =>
    k.keyId === expectedKeyId && k.purpose === purpose
    && k.notBeforeMs <= nowMs && nowMs < k.notAfterMs
    && (k.revokedAtMs === null || nowMs < k.revokedAtMs)) ?? null;
}
