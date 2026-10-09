import { KeyObject, verify } from 'node:crypto';
import {
  digestSajuHeldStagingTargetManifestV1,
  parseSajuHeldStagingTargetManifestV1,
} from './saju-held-staging-target-manifest-v1.js';
import {
  assessSajuHeldStagingConnectionPlanV1,
  digestSajuHeldStagingConnectionPlanV1,
} from './saju-held-staging-connection-plan-v1.js';

export const SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V2 =
  'myeongha-saju-staging-admission-contract-v2' as const;

export const SAJU_HELD_STAGING_ADMISSION_PERMIT_KEYS_V2 = Object.freeze([
  'version', 'permitId', 'manifestDigest', 'connectionPlanDigest',
  'environmentId', 'myeonghaCommitSha', 'sajuCommitSha',
  'approvedOperatorId', 'issuedAtMs', 'expiresAtMs',
  'consumedAtMs', 'status', 'approvalSignatureKeyId',
] as const);

const DOMAIN = 'myeongha/saju/staging-admission/permit/v2\0';
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SHA40 = /^[a-f0-9]{40}$/u;
const ACTOR = /^[a-zA-Z0-9._:-]{3,128}$/u;
const ENV = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const B64URL_ED25519 = /^[A-Za-z0-9_-]{86}$/u;
const MAX_LIFETIME_MS = 15 * 60_000;

export interface SajuHeldStagingAdmissionPermitV2 {
  readonly version: typeof SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V2;
  readonly permitId: string;
  readonly manifestDigest: string;
  /** Binds all three DB login/role/TLS targets plus Auth and Saju proof origins. */
  readonly connectionPlanDigest: string;
  readonly environmentId: string;
  readonly myeonghaCommitSha: string;
  readonly sajuCommitSha: string;
  readonly approvedOperatorId: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly consumedAtMs: number | null;
  readonly status: 'ISSUED' | 'REVOKED' | 'CONSUMED';
  readonly approvalSignatureKeyId: string;
}

function exactOwnDataRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const names = Object.keys(value);
    return names.length === keys.length && Reflect.ownKeys(value).length === names.length
      && keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
      });
  } catch {
    return false;
  }
}

/**
 * Contract-only parser. An ISSUED row does not establish that a trusted
 * operator signed it, or that a durable PostgreSQL row can be consumed.
 */
export function parseSajuHeldStagingAdmissionPermitV2(
  value: unknown,
): Readonly<SajuHeldStagingAdmissionPermitV2> {
  try {
    if (!exactOwnDataRecord(value, SAJU_HELD_STAGING_ADMISSION_PERMIT_KEYS_V2)
      || value.version !== SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V2
      || typeof value.permitId !== 'string' || !UUID_V4.test(value.permitId)
      || typeof value.manifestDigest !== 'string' || !SHA256.test(value.manifestDigest)
      || typeof value.connectionPlanDigest !== 'string' || !SHA256.test(value.connectionPlanDigest)
      || typeof value.environmentId !== 'string' || !ENV.test(value.environmentId)
      || typeof value.myeonghaCommitSha !== 'string' || !SHA40.test(value.myeonghaCommitSha)
      || typeof value.sajuCommitSha !== 'string' || !SHA40.test(value.sajuCommitSha)
      || typeof value.approvedOperatorId !== 'string' || !ACTOR.test(value.approvedOperatorId)
      || typeof value.approvalSignatureKeyId !== 'string' || !ACTOR.test(value.approvalSignatureKeyId)
      || typeof value.issuedAtMs !== 'number' || !Number.isSafeInteger(value.issuedAtMs)
      || value.issuedAtMs < 0
      || typeof value.expiresAtMs !== 'number' || !Number.isSafeInteger(value.expiresAtMs)
      || value.expiresAtMs <= value.issuedAtMs
      || value.expiresAtMs - value.issuedAtMs > MAX_LIFETIME_MS
      || (value.status !== 'ISSUED' && value.status !== 'REVOKED'
        && value.status !== 'CONSUMED')
      || (value.consumedAtMs !== null
        && (typeof value.consumedAtMs !== 'number'
          || !Number.isSafeInteger(value.consumedAtMs)
          || value.consumedAtMs < value.issuedAtMs))
      || (value.status === 'ISSUED' && value.consumedAtMs !== null)
      || (value.status === 'CONSUMED' && value.consumedAtMs === null)) {
      throw new TypeError();
    }
    return Object.freeze({
      version: SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V2,
      permitId: value.permitId,
      manifestDigest: value.manifestDigest,
      connectionPlanDigest: value.connectionPlanDigest,
      environmentId: value.environmentId,
      myeonghaCommitSha: value.myeonghaCommitSha,
      sajuCommitSha: value.sajuCommitSha,
      approvedOperatorId: value.approvedOperatorId,
      issuedAtMs: value.issuedAtMs,
      expiresAtMs: value.expiresAtMs,
      consumedAtMs: value.consumedAtMs,
      status: value.status,
      approvalSignatureKeyId: value.approvalSignatureKeyId,
    } as SajuHeldStagingAdmissionPermitV2);
  } catch {
    throw new TypeError('Invalid isolated staging V2 permit metadata.');
  }
}

/** Exact canonical V2 payload for an external, separately authorized signer. */
export function canonicalSajuHeldStagingPermitApprovalBytesV2(value: unknown): Uint8Array {
  const permit = parseSajuHeldStagingAdmissionPermitV2(value);
  return Buffer.from(
    DOMAIN + JSON.stringify(SAJU_HELD_STAGING_ADMISSION_PERMIT_KEYS_V2.map(key => permit[key])),
    'utf8',
  );
}

export interface SajuHeldStagingAdmissionSignatureInputV2 {
  /** Actual deployment and reviewed target must originate outside web/user input. */
  readonly manifest: unknown;
  readonly approvedManifest: unknown;
  readonly connectionPlan: unknown;
  readonly approvedConnectionPlan: unknown;
  readonly permit: unknown;
  readonly approvalSignature: unknown;
  /** Key provenance and signer authorization must be validated independently. */
  readonly approvalPublicKey: unknown;
  readonly expectedOperatorId: unknown;
  readonly expectedApprovalKeyId: unknown;
  /** Injected only for synthetic tests; a real Authority must supply trusted time. */
  readonly nowMs: unknown;
}

export type SajuHeldStagingAdmissionSignatureReportV2 = Readonly<{
  version: typeof SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V2;
  contract: 'SIGNED_TARGET_MATCHED_UNVERIFIED_AUTHORITY' | 'BLOCKED';
  signatureVerification: 'VALID_FOR_SUPPLIED_KEY' | 'BLOCKED';
  checks: Readonly<{
    permit_shape: 'PASS' | 'BLOCKED';
    manifest_and_plan_binding: 'PASS' | 'BLOCKED';
    operator_and_key_id_binding: 'PASS' | 'BLOCKED';
    unconsumed_and_unexpired: 'PASS' | 'BLOCKED';
    detached_signature: 'PASS' | 'BLOCKED';
  }>;
  signerAuthority: 'NOT_VERIFIED';
  atomicConsumption: 'NOT_VERIFIED';
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

/**
 * Pure crypto + static binding check. A valid signature only proves possession
 * of the private key corresponding to the supplied public key. Key-source
 * authority, actual deployment, and durable consumption remain external.
 *
 * No signing, key generation, network access, DB operations or runner wiring.
 */
export function assessSajuHeldStagingAdmissionSignatureV2(
  input: SajuHeldStagingAdmissionSignatureInputV2,
): SajuHeldStagingAdmissionSignatureReportV2 {
  let permit: Readonly<SajuHeldStagingAdmissionPermitV2> | null = null;
  let manifest: ReturnType<typeof parseSajuHeldStagingTargetManifestV1> | null = null;
  let manifestDigest: string | null = null;
  let planDigest: string | null = null;
  let manifestAndPlanValid = false;
  let signatureValid = false;

  try { permit = parseSajuHeldStagingAdmissionPermitV2(input?.permit); }
  catch { /* Fail closed. */ }
  try {
    manifest = parseSajuHeldStagingTargetManifestV1(input?.manifest);
    const reviewed = parseSajuHeldStagingTargetManifestV1(input?.approvedManifest);
    manifestDigest = digestSajuHeldStagingTargetManifestV1(manifest);
    if (manifestDigest === digestSajuHeldStagingTargetManifestV1(reviewed)
      && assessSajuHeldStagingConnectionPlanV1({
        plan: input.connectionPlan,
        manifest,
        approvedNonSecretPlan: input.approvedConnectionPlan,
      }).configuration === 'MATCHED_UNVERIFIED') {
      planDigest = digestSajuHeldStagingConnectionPlanV1(input.connectionPlan);
      manifestAndPlanValid = true;
    }
  } catch { /* Fail closed. */ }

  const bindingsMatch = permit !== null && manifest !== null && manifestAndPlanValid
    && permit.manifestDigest === manifestDigest
    && permit.connectionPlanDigest === planDigest
    && permit.environmentId === manifest.environmentId
    && permit.myeonghaCommitSha === manifest.myeonghaCommitSha
    && permit.sajuCommitSha === manifest.sajuCommitSha;
  const operatorMatches = permit !== null
    && typeof input?.expectedOperatorId === 'string'
    && ACTOR.test(input.expectedOperatorId)
    && permit.approvedOperatorId === input.expectedOperatorId
    && typeof input?.expectedApprovalKeyId === 'string'
    && ACTOR.test(input.expectedApprovalKeyId)
    && permit.approvalSignatureKeyId === input.expectedApprovalKeyId;
  const freshAndUnconsumed = permit !== null
    && permit.status === 'ISSUED' && permit.consumedAtMs === null
    && typeof input?.nowMs === 'number' && Number.isSafeInteger(input.nowMs)
    && input.nowMs >= permit.issuedAtMs && input.nowMs < permit.expiresAtMs;

  try {
    if (permit !== null && bindingsMatch && operatorMatches && freshAndUnconsumed
      && input?.approvalPublicKey instanceof KeyObject
      && input.approvalPublicKey.type === 'public'
      && input.approvalPublicKey.asymmetricKeyType === 'ed25519'
      && typeof input.approvalSignature === 'string'
      && B64URL_ED25519.test(input.approvalSignature)) {
      const signature = Buffer.from(input.approvalSignature, 'base64url');
      signatureValid = signature.length === 64
        && signature.toString('base64url') === input.approvalSignature
        && verify(
          null, canonicalSajuHeldStagingPermitApprovalBytesV2(permit),
          input.approvalPublicKey, signature,
        );
    }
  } catch { /* Signature and key errors always deny. */ }

  const checks = Object.freeze({
    permit_shape: permit !== null ? 'PASS' as const : 'BLOCKED' as const,
    manifest_and_plan_binding: bindingsMatch ? 'PASS' as const : 'BLOCKED' as const,
    operator_and_key_id_binding: operatorMatches ? 'PASS' as const : 'BLOCKED' as const,
    unconsumed_and_unexpired: freshAndUnconsumed ? 'PASS' as const : 'BLOCKED' as const,
    detached_signature: signatureValid ? 'PASS' as const : 'BLOCKED' as const,
  });

  return Object.freeze({
    version: SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V2,
    contract: Object.values(checks).every(check => check === 'PASS')
      ? 'SIGNED_TARGET_MATCHED_UNVERIFIED_AUTHORITY' as const : 'BLOCKED' as const,
    signatureVerification: signatureValid
      ? 'VALID_FOR_SUPPLIED_KEY' as const : 'BLOCKED' as const,
    checks,
    signerAuthority: 'NOT_VERIFIED' as const,
    atomicConsumption: 'NOT_VERIFIED' as const,
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
