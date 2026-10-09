import {
  digestSajuHeldStagingTargetManifestV1,
  parseSajuHeldStagingTargetManifestV1,
} from './saju-held-staging-target-manifest-v1.js';

export const SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1 =
  'myeongha-saju-staging-admission-contract-v1' as const;

export const SAJU_HELD_STAGING_ADMISSION_PERMIT_KEYS_V1 = Object.freeze([
  'version', 'permitId', 'manifestDigest', 'environmentId',
  'myeonghaCommitSha', 'sajuCommitSha', 'approvedOperatorId',
  'issuedAtMs', 'expiresAtMs', 'consumedAtMs', 'status',
  'approvalSignatureKeyId',
] as const);

type PermitStatusV1 = 'ISSUED' | 'CONSUMED' | 'REVOKED';

export interface SajuHeldStagingAdmissionPermitV1 {
  readonly version: typeof SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1;
  readonly permitId: string;
  readonly manifestDigest: string;
  readonly environmentId: string;
  readonly myeonghaCommitSha: string;
  readonly sajuCommitSha: string;
  readonly approvedOperatorId: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly consumedAtMs: number | null;
  readonly status: PermitStatusV1;
  readonly approvalSignatureKeyId: string;
}

export interface SajuHeldStagingAdmissionContractInputV1 {
  readonly manifest: unknown;
  /** Proposed permit metadata, never an authenticated permit by itself. */
  readonly permit: unknown;
  /** This identifier MUST be checked independently by the runtime authority. */
  readonly expectedOperatorId: unknown;
  /** Trusted clock required for production. Caller-supplied clocks prove nothing. */
  readonly nowMs: unknown;
}

export type SajuHeldStagingAdmissionContractReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1;
  contract: 'MATCHED_UNVERIFIED' | 'BLOCKED';
  checks: Readonly<{
    permit_shape: 'PASS' | 'BLOCKED';
    target_binding: 'PASS' | 'BLOCKED';
    operator_binding: 'PASS' | 'BLOCKED';
    unconsumed_and_unexpired: 'PASS' | 'BLOCKED';
  }>;
  signatureVerification: 'NOT_VERIFIED';
  atomicConsumption: 'NOT_VERIFIED';
  stagingConnection: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const ACTOR = /^[a-zA-Z0-9._:-]{3,128}$/u;
const ENV = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const MAX_PERMIT_LIFETIME_MS = 15 * 60_000;

function exactDataRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const actual = Object.keys(value);
    return actual.length === keys.length
      && Reflect.ownKeys(value).length === actual.length
      && keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
      });
  } catch {
    return false;
  }
}

/** Strictly projects metadata. This NEVER verifies a signature or issues an approval. */
export function parseSajuHeldStagingAdmissionPermitV1(
  value: unknown,
): Readonly<SajuHeldStagingAdmissionPermitV1> {
  try {
    if (!exactDataRecord(value, SAJU_HELD_STAGING_ADMISSION_PERMIT_KEYS_V1)
      || value.version !== SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1
      || typeof value.permitId !== 'string' || !UUID_V4.test(value.permitId)
      || typeof value.manifestDigest !== 'string' || !SHA256.test(value.manifestDigest)
      || typeof value.environmentId !== 'string' || !ENV.test(value.environmentId)
      || typeof value.myeonghaCommitSha !== 'string' || !GIT_SHA.test(value.myeonghaCommitSha)
      || typeof value.sajuCommitSha !== 'string' || !GIT_SHA.test(value.sajuCommitSha)
      || typeof value.approvedOperatorId !== 'string' || !ACTOR.test(value.approvedOperatorId)
      || typeof value.approvalSignatureKeyId !== 'string' || !ACTOR.test(value.approvalSignatureKeyId)
      || typeof value.issuedAtMs !== 'number' || !Number.isSafeInteger(value.issuedAtMs)
      || value.issuedAtMs < 0
      || typeof value.expiresAtMs !== 'number' || !Number.isSafeInteger(value.expiresAtMs)
      || value.expiresAtMs <= value.issuedAtMs
      || value.expiresAtMs - value.issuedAtMs > MAX_PERMIT_LIFETIME_MS
      || (value.status !== 'ISSUED' && value.status !== 'CONSUMED'
        && value.status !== 'REVOKED')
      || (value.consumedAtMs !== null
        && (typeof value.consumedAtMs !== 'number'
          || !Number.isSafeInteger(value.consumedAtMs)
          || value.consumedAtMs < value.issuedAtMs))
      || (value.status === 'ISSUED' && value.consumedAtMs !== null)
      || (value.status === 'CONSUMED' && value.consumedAtMs === null)) {
      throw new TypeError();
    }
    return Object.freeze({
      version: SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1,
      permitId: value.permitId,
      manifestDigest: value.manifestDigest,
      environmentId: value.environmentId,
      myeonghaCommitSha: value.myeonghaCommitSha,
      sajuCommitSha: value.sajuCommitSha,
      approvedOperatorId: value.approvedOperatorId,
      issuedAtMs: value.issuedAtMs,
      expiresAtMs: value.expiresAtMs,
      consumedAtMs: value.consumedAtMs,
      status: value.status,
      approvalSignatureKeyId: value.approvalSignatureKeyId,
    } as SajuHeldStagingAdmissionPermitV1);
  } catch {
    throw new TypeError('Invalid staging admission permit metadata.');
  }
}

export function assessSajuHeldStagingAdmissionContractV1(
  input: SajuHeldStagingAdmissionContractInputV1,
): SajuHeldStagingAdmissionContractReportV1 {
  let permit: Readonly<SajuHeldStagingAdmissionPermitV1> | null = null;
  let manifest: ReturnType<typeof parseSajuHeldStagingTargetManifestV1> | null = null;
  let digest: string | null = null;
  try {
    permit = parseSajuHeldStagingAdmissionPermitV1(input?.permit);
  } catch { /* Invalid metadata always blocks. */ }
  try {
    manifest = parseSajuHeldStagingTargetManifestV1(input?.manifest);
    digest = digestSajuHeldStagingTargetManifestV1(manifest);
  } catch { /* Unreviewed staging target always blocks. */ }

  const checks = Object.freeze({
    permit_shape: permit === null ? 'BLOCKED' as const : 'PASS' as const,
    target_binding: permit !== null && manifest !== null && digest !== null
      && permit.manifestDigest === digest
      && permit.environmentId === manifest.environmentId
      && permit.myeonghaCommitSha === manifest.myeonghaCommitSha
      && permit.sajuCommitSha === manifest.sajuCommitSha
      ? 'PASS' as const : 'BLOCKED' as const,
    operator_binding: permit !== null
      && typeof input?.expectedOperatorId === 'string'
      && ACTOR.test(input.expectedOperatorId)
      && permit.approvedOperatorId === input.expectedOperatorId
      ? 'PASS' as const : 'BLOCKED' as const,
    unconsumed_and_unexpired: permit !== null
      && permit.status === 'ISSUED' && permit.consumedAtMs === null
      && typeof input?.nowMs === 'number' && Number.isSafeInteger(input.nowMs)
      && input.nowMs >= permit.issuedAtMs && input.nowMs < permit.expiresAtMs
      ? 'PASS' as const : 'BLOCKED' as const,
  });
  return Object.freeze({
    version: SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1,
    contract: Object.values(checks).every(x => x === 'PASS')
      ? 'MATCHED_UNVERIFIED' as const : 'BLOCKED' as const,
    checks,
    signatureVerification: 'NOT_VERIFIED' as const,
    atomicConsumption: 'NOT_VERIFIED' as const,
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
