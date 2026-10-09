import {
  assessSajuHeldStagingConnectionPlanV1,
  parseSajuHeldStagingConnectionPlanV1,
  type SajuHeldStagingConnectionPlanInputV1,
  type SajuHeldStagingDbConnectionBindingV1,
} from './saju-held-staging-connection-plan-v1.js';

export const SAJU_HELD_STAGING_CONNECTION_CLAIMS_VERSION_V1 =
  'myeongha-saju-staging-connection-claims-v1' as const;

const CLAIM_KEYS = Object.freeze(['auth', 'subjectDb', 'nonceDb', 'admissionDb', 'proof']);
const AUTH_KEYS = Object.freeze(['projectRef', 'origin', 'memberOnlyReported']);
const PROOF_KEYS = Object.freeze([
  'origin', 'issuer', 'audience', 'keyId',
  'restrictedHttpsReported', 'bearerHmacSeparatedReported',
]);
const DB_KEYS = Object.freeze([
  'targetId', 'loginRole', 'runtimeRole', 'tlsHostname', 'caFingerprint256',
  'tlsMode', 'tlsPeerVerifiedReported', 'runtimeMembershipVerifiedReported',
]);

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

function matchesDbClaim(value: unknown, binding: SajuHeldStagingDbConnectionBindingV1): boolean {
  if (!exact(value, DB_KEYS)) return false;
  return value.targetId === binding.targetId
    && value.loginRole === binding.loginRole
    && value.runtimeRole === binding.runtimeRole
    && value.tlsHostname === binding.tlsHostname
    && value.caFingerprint256 === binding.caFingerprint256
    && value.tlsMode === 'verify-full'
    && value.tlsPeerVerifiedReported === true
    && value.runtimeMembershipVerifiedReported === true;
}

/**
 * Claims are observations supplied by an untrusted or unverified caller. They
 * do not prove TLS, network reachability, restricted login, Subject ownership,
 * operator authorization, or that a separate authority performed any probes.
 */
export interface SajuHeldStagingConnectionClaimsInputV1 {
  readonly planInput: SajuHeldStagingConnectionPlanInputV1;
  readonly claims: unknown;
}

export type SajuHeldStagingConnectionClaimsReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_CONNECTION_CLAIMS_VERSION_V1;
  configuration: 'MATCHED_UNVERIFIED' | 'BLOCKED';
  evidenceCoverage: 'INCOMPLETE' | 'COMPLETE_UNTRUSTED' | 'BLOCKED';
  checks: Readonly<{
    staging_auth: 'REPORTED_ONLY' | 'MISSING' | 'BLOCKED';
    subject_db: 'REPORTED_ONLY' | 'MISSING' | 'BLOCKED';
    nonce_db: 'REPORTED_ONLY' | 'MISSING' | 'BLOCKED';
    admission_db: 'REPORTED_ONLY' | 'MISSING' | 'BLOCKED';
    source_proof: 'REPORTED_ONLY' | 'MISSING' | 'BLOCKED';
  }>;
  operationalEvidence: 'NOT_VERIFIED' | 'BLOCKED';
  stagingConnection: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

export function assessSajuHeldStagingConnectionClaimsV1(
  input: SajuHeldStagingConnectionClaimsInputV1,
): SajuHeldStagingConnectionClaimsReportV1 {
  const configuration = assessSajuHeldStagingConnectionPlanV1(input?.planInput).configuration;
  let plan: ReturnType<typeof parseSajuHeldStagingConnectionPlanV1> | null = null;
  if (configuration === 'MATCHED_UNVERIFIED') {
    try { plan = parseSajuHeldStagingConnectionPlanV1(input.planInput.plan); }
    catch { /* fail closed */ }
  }
  const claims = input?.claims;
  const checks: Record<keyof SajuHeldStagingConnectionClaimsReportV1['checks'],
    'REPORTED_ONLY' | 'MISSING' | 'BLOCKED'> = {
    staging_auth: 'MISSING',
    subject_db: 'MISSING',
    nonce_db: 'MISSING',
    admission_db: 'MISSING',
    source_proof: 'MISSING',
  };
  let invalid = configuration !== 'MATCHED_UNVERIFIED' || plan === null;
  if (claims !== undefined && claims !== null) {
    if (!exact(claims, CLAIM_KEYS) || plan === null) {
      invalid = true;
    } else {
      const auth = claims.auth;
      const proof = claims.proof;
      checks.staging_auth = exact(auth, AUTH_KEYS)
        && auth.projectRef === plan.authProjectRef
        && auth.origin === plan.authOrigin && auth.memberOnlyReported === true
        ? 'REPORTED_ONLY' : 'BLOCKED';
      checks.subject_db = matchesDbClaim(claims.subjectDb, plan.subjectDb)
        ? 'REPORTED_ONLY' : 'BLOCKED';
      checks.nonce_db = matchesDbClaim(claims.nonceDb, plan.nonceDb)
        ? 'REPORTED_ONLY' : 'BLOCKED';
      checks.admission_db = matchesDbClaim(claims.admissionDb, plan.admissionDb)
        ? 'REPORTED_ONLY' : 'BLOCKED';
      checks.source_proof = exact(proof, PROOF_KEYS)
        && proof.origin === plan.proofServiceOrigin
        && proof.issuer === plan.proofIssuer
        && proof.audience === plan.proofAudience
        && proof.keyId === plan.proofKeyId
        && proof.restrictedHttpsReported === true
        && proof.bearerHmacSeparatedReported === true
        ? 'REPORTED_ONLY' : 'BLOCKED';
      invalid = Object.values(checks).some(x => x === 'BLOCKED');
    }
  }
  const evidenceCoverage = invalid ? 'BLOCKED' as const
    : Object.values(checks).every(x => x === 'REPORTED_ONLY')
      ? 'COMPLETE_UNTRUSTED' as const : 'INCOMPLETE' as const;
  return Object.freeze({
    version: SAJU_HELD_STAGING_CONNECTION_CLAIMS_VERSION_V1,
    configuration,
    evidenceCoverage,
    checks: Object.freeze(checks),
    operationalEvidence: evidenceCoverage === 'BLOCKED'
      ? 'BLOCKED' as const : 'NOT_VERIFIED' as const,
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
