import {
  parseSajuHeldStagingTargetManifestV1,
  digestSajuHeldStagingTargetManifestV1,
  type SajuHeldStagingTargetManifestV1,
} from './saju-held-staging-target-manifest-v1.js';
import type {
  SajuHeldSourceIssuerWireDescriptorV1,
} from './saju-held-staging-preflight-v1.js';
import { SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1 } from './saju-held-source-proof-http-client-v1.js';
import {
  SAJU_HELD_SOURCE_PROOF_HTTP_VERSION_V1,
  SAJU_HELD_SOURCE_PROOF_VERSION_V1,
} from './saju-held-source-proof-verifier-v1.js';

export const SAJU_HELD_STAGING_TARGET_CONFIG_VERSION_V1 =
  'myeongha-saju-staging-target-config-v1' as const;

export type SajuHeldStagingTargetCheckV1 =
  | 'manifest_contract'
  | 'independently_reviewed_target_binding'
  | 'source_wire_binding'
  | 'production_calculation_origin_separation';

export interface SajuHeldStagingTargetConfigInputV1 {
  /** Untrusted until strict validation. Neither document confers admission. */
  readonly manifest: unknown;
  /** Must originate independently in a reviewed, server-owned configuration. */
  readonly approvedNonSecretTarget: unknown;
  /** Reviewed Saju-side non-secret HTTP proof contract. */
  readonly preflightDescriptor: unknown;
  /** Actual ordinary calculation origin from separately owned server settings. */
  readonly productionCalculationOrigin: unknown;
}

export type SajuHeldStagingTargetConfigReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_TARGET_CONFIG_VERSION_V1;
  configuration: 'VALID' | 'BLOCKED';
  checks: Readonly<Record<SajuHeldStagingTargetCheckV1, 'PASS' | 'BLOCKED'>>;
  stagingConnection: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

const DESCRIPTOR_KEYS = Object.freeze([
  'httpPath', 'envelopeVersion', 'proofVersion', 'issuer',
  'audience', 'keyId', 'ttlMs',
] as const);

function parseWithoutThrow(value: unknown): Readonly<SajuHeldStagingTargetManifestV1> | null {
  try {
    return parseSajuHeldStagingTargetManifestV1(value);
  } catch {
    return null;
  }
}

function sameIndependentTarget(
  manifest: Readonly<SajuHeldStagingTargetManifestV1> | null,
  approved: Readonly<SajuHeldStagingTargetManifestV1> | null,
): boolean {
  return manifest !== null && approved !== null
    && digestSajuHeldStagingTargetManifestV1(manifest)
      === digestSajuHeldStagingTargetManifestV1(approved);
}

function sameSourceWire(
  manifest: Readonly<SajuHeldStagingTargetManifestV1> | null,
  descriptor: unknown,
): boolean {
  if (manifest === null || descriptor === null || typeof descriptor !== 'object'
    || Array.isArray(descriptor)) return false;
  const p: unknown = Object.getPrototypeOf(descriptor);
  if (p !== Object.prototype && p !== null) return false;
  const names = Object.keys(descriptor);
  if (names.length !== DESCRIPTOR_KEYS.length
    || Reflect.ownKeys(descriptor).length !== names.length
    || !DESCRIPTOR_KEYS.every(key => {
      const desc = Object.getOwnPropertyDescriptor(descriptor, key);
      return desc?.enumerable === true && Object.hasOwn(desc, 'value');
    })) return false;

  const source = descriptor as SajuHeldSourceIssuerWireDescriptorV1;
  return source.httpPath === SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1
    && source.envelopeVersion === SAJU_HELD_SOURCE_PROOF_HTTP_VERSION_V1
    && source.proofVersion === SAJU_HELD_SOURCE_PROOF_VERSION_V1
    && source.issuer === manifest.proofIssuer
    && source.audience === manifest.proofAudience
    && source.keyId === manifest.proofKeyId
    && source.ttlMs === manifest.proofTtlMs;
}

function separatedCalculationOrigin(
  manifest: Readonly<SajuHeldStagingTargetManifestV1> | null,
  productionOrigin: unknown,
): boolean {
  if (manifest === null || typeof productionOrigin !== 'string') return false;
  let origin: URL;
  try {
    origin = new URL(productionOrigin);
  } catch {
    return false;
  }
  return origin.protocol === 'https:'
    && origin.origin === productionOrigin
    && origin.username === '' && origin.password === ''
    && origin.pathname === '/' && origin.search === '' && origin.hash === ''
    && manifest.proofServiceOrigin !== origin.origin
    && manifest.authOrigin !== origin.origin;
}

/**
 * Zero-I/O static alignment only; does not instantiate trusted runtime ports.
 * A copied 'approved' object cannot prove that a separate authority approved it.
 * The report deliberately contains no target names, URL, digest or credentials.
 */
export function assessSajuHeldStagingTargetConfigV1(
  input: SajuHeldStagingTargetConfigInputV1,
): SajuHeldStagingTargetConfigReportV1 {
  const manifest = parseWithoutThrow(input?.manifest);
  const approved = parseWithoutThrow(input?.approvedNonSecretTarget);
  const checks = Object.freeze({
    manifest_contract: manifest === null ? 'BLOCKED' : 'PASS',
    independently_reviewed_target_binding:
      sameIndependentTarget(manifest, approved) ? 'PASS' : 'BLOCKED',
    source_wire_binding:
      sameSourceWire(manifest, input?.preflightDescriptor) ? 'PASS' : 'BLOCKED',
    production_calculation_origin_separation:
      separatedCalculationOrigin(manifest, input?.productionCalculationOrigin)
        ? 'PASS' : 'BLOCKED',
  } as const);
  return Object.freeze({
    version: SAJU_HELD_STAGING_TARGET_CONFIG_VERSION_V1,
    configuration: Object.values(checks).every(x => x === 'PASS')
      ? 'VALID' as const : 'BLOCKED' as const,
    checks,
    stagingConnection: 'NOT_VERIFIED' as const,
    stagingAdmission: 'HOLD' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    releaseAuthorization: 'NOT_EVALUATED' as const,
    canExecute: false as const,
    canPublish: false as const,
    canSell: false as const,
  });
}
