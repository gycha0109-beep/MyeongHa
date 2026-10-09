import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import {
  digestSajuHeldStagingTargetManifestV1,
  parseSajuHeldStagingTargetManifestV1,
} from './saju-held-staging-target-manifest-v1.js';

export const SAJU_HELD_STAGING_CONNECTION_PLAN_VERSION_V1 =
  'myeongha-saju-staging-connection-plan-v1' as const;
export const SAJU_HELD_STAGING_NONCE_RUNTIME_ROLE_V1 =
  'myeongha_saju_proof_nonce_runtime' as const;
export const SAJU_HELD_STAGING_ADMISSION_RUNTIME_ROLE_V1 =
  'myeongha_saju_staging_admission_runtime' as const;

const PLAN_KEYS = Object.freeze([
  'version', 'manifestDigest', 'environmentId',
  'myeonghaCommitSha', 'sajuCommitSha', 'authProjectRef', 'authOrigin',
  'proofServiceOrigin', 'proofIssuer', 'proofAudience', 'proofKeyId',
  'subjectDb', 'nonceDb', 'admissionDb',
] as const);
const DB_KEYS = Object.freeze([
  'targetId', 'loginRole', 'runtimeRole', 'tlsHostname',
  'caFingerprint256', 'tlsMode',
] as const);
const HEX64 = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const TARGET = /^[a-z][a-z0-9._:-]{2,100}$/u;
const ROLE = /^[a-z_][a-z0-9_]{2,62}$/u;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const DIGEST_DOMAIN = 'myeongha/saju/staging-connection-plan/v1\0';

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
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

export interface SajuHeldStagingDbConnectionBindingV1 {
  readonly targetId: string;
  /** Role name only; neither a password nor connection string. */
  readonly loginRole: string;
  readonly runtimeRole: string;
  readonly tlsHostname: string;
  /** Governed SHA-256 fingerprint identifier, NOT a CA PEM or verification. */
  readonly caFingerprint256: string;
  readonly tlsMode: 'verify-full';
}

export interface SajuHeldStagingConnectionPlanV1 {
  readonly version: typeof SAJU_HELD_STAGING_CONNECTION_PLAN_VERSION_V1;
  readonly manifestDigest: string;
  readonly environmentId: string;
  readonly myeonghaCommitSha: string;
  readonly sajuCommitSha: string;
  readonly authProjectRef: string;
  readonly authOrigin: string;
  readonly proofServiceOrigin: string;
  readonly proofIssuer: string;
  readonly proofAudience: string;
  readonly proofKeyId: string;
  readonly subjectDb: SajuHeldStagingDbConnectionBindingV1;
  readonly nonceDb: SajuHeldStagingDbConnectionBindingV1;
  readonly admissionDb: SajuHeldStagingDbConnectionBindingV1;
}

function dbBinding(value: unknown): Readonly<SajuHeldStagingDbConnectionBindingV1> {
  if (!exact(value, DB_KEYS)
    || typeof value.targetId !== 'string' || !TARGET.test(value.targetId)
    || typeof value.loginRole !== 'string' || !ROLE.test(value.loginRole)
    || typeof value.runtimeRole !== 'string' || !ROLE.test(value.runtimeRole)
    || typeof value.tlsHostname !== 'string' || !HOST.test(value.tlsHostname)
    || isIP(value.tlsHostname) !== 0
    || typeof value.caFingerprint256 !== 'string' || !HEX64.test(value.caFingerprint256)
    || value.tlsMode !== 'verify-full') {
    throw new TypeError('Invalid isolated staging database binding.');
  }
  return Object.freeze({
    targetId: value.targetId,
    loginRole: value.loginRole,
    runtimeRole: value.runtimeRole,
    tlsHostname: value.tlsHostname,
    caFingerprint256: value.caFingerprint256,
    tlsMode: 'verify-full' as const,
  });
}

/** Non-secret declaration only. Its source is not trusted by parsing it. */
export function parseSajuHeldStagingConnectionPlanV1(
  value: unknown,
): Readonly<SajuHeldStagingConnectionPlanV1> {
  if (!exact(value, PLAN_KEYS)
    || value.version !== SAJU_HELD_STAGING_CONNECTION_PLAN_VERSION_V1
    || typeof value.manifestDigest !== 'string' || !HEX64.test(value.manifestDigest)
    || typeof value.environmentId !== 'string'
    || typeof value.myeonghaCommitSha !== 'string' || !SHA.test(value.myeonghaCommitSha)
    || typeof value.sajuCommitSha !== 'string' || !SHA.test(value.sajuCommitSha)
    || typeof value.authProjectRef !== 'string'
    || typeof value.authOrigin !== 'string'
    || typeof value.proofServiceOrigin !== 'string'
    || typeof value.proofIssuer !== 'string'
    || typeof value.proofAudience !== 'string'
    || typeof value.proofKeyId !== 'string') {
    throw new TypeError('Invalid isolated staging connection plan.');
  }
  const subjectDb = dbBinding(value.subjectDb);
  const nonceDb = dbBinding(value.nonceDb);
  const admissionDb = dbBinding(value.admissionDb);
  if (new Set([subjectDb.targetId, nonceDb.targetId, admissionDb.targetId]).size !== 3
    || new Set([subjectDb.loginRole, nonceDb.loginRole, admissionDb.loginRole]).size !== 3
    || new Set([subjectDb.runtimeRole, nonceDb.runtimeRole, admissionDb.runtimeRole]).size !== 3
    || subjectDb.loginRole === subjectDb.runtimeRole
    || nonceDb.loginRole === nonceDb.runtimeRole
    || admissionDb.loginRole === admissionDb.runtimeRole
    || nonceDb.runtimeRole !== SAJU_HELD_STAGING_NONCE_RUNTIME_ROLE_V1
    || admissionDb.runtimeRole !== SAJU_HELD_STAGING_ADMISSION_RUNTIME_ROLE_V1
    || [subjectDb, nonceDb, admissionDb].some(db =>
      [subjectDb.runtimeRole, nonceDb.runtimeRole, admissionDb.runtimeRole]
        .includes(db.loginRole))) {
    throw new TypeError('Isolated staging login and runtime roles must be separate.');
  }
  return Object.freeze({
    version: SAJU_HELD_STAGING_CONNECTION_PLAN_VERSION_V1,
    manifestDigest: value.manifestDigest,
    environmentId: value.environmentId,
    myeonghaCommitSha: value.myeonghaCommitSha,
    sajuCommitSha: value.sajuCommitSha,
    authProjectRef: value.authProjectRef,
    authOrigin: value.authOrigin,
    proofServiceOrigin: value.proofServiceOrigin,
    proofIssuer: value.proofIssuer,
    proofAudience: value.proofAudience,
    proofKeyId: value.proofKeyId,
    subjectDb, nonceDb, admissionDb,
  });
}

/** Domain-separated plan ID; neither a signature nor operational permission. */
export function digestSajuHeldStagingConnectionPlanV1(value: unknown): string {
  const p = parseSajuHeldStagingConnectionPlanV1(value);
  const normalized = PLAN_KEYS.map(key => {
    const entry = p[key];
    return typeof entry === 'object' ? DB_KEYS.map(field => entry[field]) : entry;
  });
  return createHash('sha256').update(DIGEST_DOMAIN, 'utf8')
    .update(JSON.stringify(normalized), 'utf8').digest('hex');
}

export interface SajuHeldStagingConnectionPlanInputV1 {
  /** Untrusted candidate. No authority derived from caller-supplied data. */
  readonly plan: unknown;
  readonly manifest: unknown;
  /** Independently reviewed plan must be supplied through a separate, trusted server boundary. */
  readonly approvedNonSecretPlan: unknown;
}

export type SajuHeldStagingConnectionPlanReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_CONNECTION_PLAN_VERSION_V1;
  configuration: 'MATCHED_UNVERIFIED' | 'BLOCKED';
  checks: Readonly<{
    plan_contract: 'PASS' | 'BLOCKED';
    manifest_binding: 'PASS' | 'BLOCKED';
    independent_plan_binding: 'PASS' | 'BLOCKED';
  }>;
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

export function assessSajuHeldStagingConnectionPlanV1(
  input: SajuHeldStagingConnectionPlanInputV1,
): SajuHeldStagingConnectionPlanReportV1 {
  let plan: Readonly<SajuHeldStagingConnectionPlanV1> | null = null;
  let manifest: ReturnType<typeof parseSajuHeldStagingTargetManifestV1> | null = null;
  let approved: Readonly<SajuHeldStagingConnectionPlanV1> | null = null;
  try { plan = parseSajuHeldStagingConnectionPlanV1(input?.plan); } catch { /* deny */ }
  try { manifest = parseSajuHeldStagingTargetManifestV1(input?.manifest); } catch { /* deny */ }
  try { approved = parseSajuHeldStagingConnectionPlanV1(input?.approvedNonSecretPlan); } catch { /* deny */ }
  const matchesManifest = plan !== null && manifest !== null
    && plan.manifestDigest === digestSajuHeldStagingTargetManifestV1(manifest)
    && plan.environmentId === manifest.environmentId
    && plan.myeonghaCommitSha === manifest.myeonghaCommitSha
    && plan.sajuCommitSha === manifest.sajuCommitSha
    && plan.authProjectRef === manifest.authProjectRef
    && plan.authOrigin === manifest.authOrigin
    && plan.proofServiceOrigin === manifest.proofServiceOrigin
    && plan.proofIssuer === manifest.proofIssuer
    && plan.proofAudience === manifest.proofAudience
    && plan.proofKeyId === manifest.proofKeyId
    && plan.subjectDb.targetId === manifest.subjectDbTargetId
    && plan.nonceDb.targetId === manifest.nonceDbTargetId;
  const matchesApproved = plan !== null && approved !== null
    && digestSajuHeldStagingConnectionPlanV1(plan) ===
      digestSajuHeldStagingConnectionPlanV1(approved);
  const checks = Object.freeze({
    plan_contract: plan !== null ? 'PASS' as const : 'BLOCKED' as const,
    manifest_binding: matchesManifest ? 'PASS' as const : 'BLOCKED' as const,
    independent_plan_binding: matchesApproved ? 'PASS' as const : 'BLOCKED' as const,
  });
  return Object.freeze({
    version: SAJU_HELD_STAGING_CONNECTION_PLAN_VERSION_V1,
    configuration: Object.values(checks).every(x => x === 'PASS')
      ? 'MATCHED_UNVERIFIED' as const : 'BLOCKED' as const,
    checks,
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
