/**
 * 3-04-02 / SO-1: solo Owner intention and technical-principal boundary.
 * Zero-I/O, all inputs are caller-supplied and UNTRUSTED. No authorization.
 * Never grant permissions, sign, fetch keys, read cloud state, or call Runner.
 */
export const SAJU_SOLO_OWNER_INTENT_CLAIM_VERSION_V1 =
  'myeongha-saju-solo-owner-intent-claim-v1' as const;

export type SajuSoloOwnerActionClassV1 =
  'P2_STAGING_READ_ONLY' | 'P3_STAGING_SINGLE_REHEARSAL';
type RoleV1 = 'OWNER_PORTAL' | 'ROOT_CUSTODY' | 'OPERATOR_SIGNER'
  | 'ATTESTOR_WORKER' | 'CHALLENGE_CONSUMER' | 'RUNNER';
const ROLES: readonly RoleV1[] = Object.freeze([
  'OWNER_PORTAL', 'ROOT_CUSTODY', 'OPERATOR_SIGNER',
  'ATTESTOR_WORKER', 'CHALLENGE_CONSUMER', 'RUNNER',
]);
const INTENT_KEYS = Object.freeze([
  'version', 'intentId', 'ownerSubject', 'actionClass', 'environmentId',
  'permitId', 'manifestDigest', 'connectionPlanDigest', 'myeonghaCommitSha',
  'sajuCommitSha', 'requestDigest', 'issuedAtMs', 'expiresAtMs',
  'authMethod', 'authEventRef', 'policyRevision', 'auditEventRef',
]);
const AUTH_KEYS = Object.freeze([
  'intentId', 'ownerSubject', 'requestDigest', 'authMethod',
  'authEventRef', 'verifiedAtMs',
]);
const PRINCIPAL_KEYS = Object.freeze([
  'principalId', 'humanOwnerSubject', 'role', 'securityDomainId',
]);
const SCOPE_KEYS = Object.freeze([
  'environmentId', 'permitId', 'manifestDigest', 'connectionPlanDigest',
  'myeonghaCommitSha', 'sajuCommitSha', 'requestDigest',
]);
const ID = /^[A-Za-z0-9._:-]{3,128}$/u;
const ENV = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const SHA40 = /^[a-f0-9]{40}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const validClock = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const validId = (x: unknown): x is string => typeof x === 'string' && ID.test(x);
const validSha = (x: unknown): x is string =>
  typeof x === 'string' && HEX64.test(x);
const validCommit = (x: unknown): x is string =>
  typeof x === 'string' && SHA40.test(x);
const validPermit = (x: unknown): x is string =>
  typeof x === 'string' && UUID.test(x);
const validAction = (x: unknown): x is SajuSoloOwnerActionClassV1 =>
  x === 'P2_STAGING_READ_ONLY' || x === 'P3_STAGING_SINGLE_REHEARSAL';

function record(x: unknown, keys: readonly string[]): x is Record<string, unknown> {
  try {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
    const p: unknown = Object.getPrototypeOf(x);
    if (p !== null && p !== Object.prototype) return false;
    const own = Object.keys(x);
    return own.length === keys.length
      && Reflect.ownKeys(x).length === keys.length
      && keys.every(k => {
        const d = Object.getOwnPropertyDescriptor(x, k);
        return d?.enumerable === true && Object.hasOwn(d, 'value');
      });
  } catch { return false; }
}

export interface SajuSoloOwnerIntentClaimV1 {
  readonly version: typeof SAJU_SOLO_OWNER_INTENT_CLAIM_VERSION_V1;
  readonly intentId: string;
  readonly ownerSubject: string;
  readonly actionClass: SajuSoloOwnerActionClassV1;
  readonly environmentId: string;
  readonly permitId: string | null;
  readonly manifestDigest: string;
  readonly connectionPlanDigest: string;
  readonly myeonghaCommitSha: string;
  readonly sajuCommitSha: string;
  readonly requestDigest: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly authMethod: 'PASSKEY_ASSERTION_CLAIM';
  readonly authEventRef: string;
  readonly policyRevision: number;
  readonly auditEventRef: string;
}
export interface SajuSoloOwnerAuthEventClaimV1 {
  readonly intentId: string;
  readonly ownerSubject: string;
  readonly requestDigest: string;
  readonly authMethod: 'PASSKEY_ASSERTION_CLAIM';
  readonly authEventRef: string;
  readonly verifiedAtMs: number;
}
export interface SajuSoloOwnerPrincipalClaimV1 {
  readonly principalId: string;
  readonly humanOwnerSubject: string;
  readonly role: RoleV1;
  readonly securityDomainId: string;
}
export interface SajuSoloOwnerScopeClaimV1 {
  readonly environmentId: string;
  readonly permitId: string | null;
  readonly manifestDigest: string;
  readonly connectionPlanDigest: string;
  readonly myeonghaCommitSha: string;
  readonly sajuCommitSha: string;
  readonly requestDigest: string;
}

export function parseSajuSoloOwnerIntentClaimV1(
  x: unknown,
): Readonly<SajuSoloOwnerIntentClaimV1> {
  try {
    if (!record(x, INTENT_KEYS)
      || x.version !== SAJU_SOLO_OWNER_INTENT_CLAIM_VERSION_V1
      || !validPermit(x.intentId) || !validId(x.ownerSubject)
      || !validAction(x.actionClass)
      || typeof x.environmentId !== 'string' || !ENV.test(x.environmentId)
      || !(x.actionClass === 'P2_STAGING_READ_ONLY' ? x.permitId === null
        : validPermit(x.permitId))
      || !validSha(x.manifestDigest) || !validSha(x.connectionPlanDigest)
      || !validCommit(x.myeonghaCommitSha) || !validCommit(x.sajuCommitSha)
      || !validSha(x.requestDigest)
      || !validClock(x.issuedAtMs) || !validClock(x.expiresAtMs)
      || x.expiresAtMs <= x.issuedAtMs || x.expiresAtMs - x.issuedAtMs > 60000
      || x.authMethod !== 'PASSKEY_ASSERTION_CLAIM'
      || !validId(x.authEventRef) || !validId(x.auditEventRef)
      || !validClock(x.policyRevision) || x.policyRevision < 1) throw new TypeError();
    return Object.freeze({
      version:x.version,intentId:x.intentId,ownerSubject:x.ownerSubject,
      actionClass:x.actionClass,environmentId:x.environmentId,
      permitId:x.permitId as string | null,manifestDigest:x.manifestDigest,
      connectionPlanDigest:x.connectionPlanDigest,
      myeonghaCommitSha:x.myeonghaCommitSha,sajuCommitSha:x.sajuCommitSha,
      requestDigest:x.requestDigest,issuedAtMs:x.issuedAtMs,
      expiresAtMs:x.expiresAtMs,authMethod:x.authMethod,
      authEventRef:x.authEventRef,policyRevision:x.policyRevision,
      auditEventRef:x.auditEventRef,
    });
  } catch { throw new TypeError('Invalid untrusted solo Owner intent claim V1.'); }
}

export interface SajuSoloOwnerIntentPreflightInputV1 {
  readonly intent: unknown;
  readonly authenticationEvent: unknown;
  readonly principals: unknown;
  readonly expectedScope: unknown;
  /** Untrusted caller time for a shape check, not an operational clock. */
  readonly nowMs: unknown;
}
type CheckV1 = 'CONSISTENT_CLAIM' | 'BLOCKED';
export type SajuSoloOwnerIntentPreflightV1 = Readonly<{
  version: 'myeongha-saju-solo-owner-preflight-v1';
  claimConsistency: 'CONSISTENT_UNVERIFIED_ORIGIN' | 'BLOCKED';
  checks: Readonly<{
    intentShape: CheckV1;
    scopeBinding: CheckV1;
    authenticationClaim: CheckV1;
    principalSeparationClaim: CheckV1;
    timeClaim: CheckV1;
  }>;
  humanReviewersVerified: 0;
  ownerAuthentication: 'NOT_VERIFIED';
  custodyAuthority: 'NOT_VERIFIED';
  operatorSigningAuthority: 'NOT_VERIFIED';
  attestorIndependence: 'NOT_VERIFIED';
  auditDurability: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

function principalClaims(x: unknown, owner: string): boolean {
  try {
    if (!Array.isArray(x) || x.length !== ROLES.length) return false;
    const byRole = new Map<RoleV1, { id: string; domain: string }>();
    const ids = new Set<string>();
    for (const item of x as unknown[]) {
      if (!record(item, PRINCIPAL_KEYS)
        || !validId(item.principalId)
        || !validId(item.humanOwnerSubject)
        || item.humanOwnerSubject !== owner
        || !validId(item.securityDomainId)
        || !ROLES.includes(item.role as RoleV1)
        || ids.has(item.principalId as string)
        || byRole.has(item.role as RoleV1)) return false;
      ids.add(item.principalId as string);
      byRole.set(item.role as RoleV1, {
        id:item.principalId as string,domain:item.securityDomainId as string,
      });
    }
    if (byRole.size !== ROLES.length) return false;
    const runner = byRole.get('RUNNER')?.domain;
    const ownerPortal = byRole.get('OWNER_PORTAL')?.domain;
    const custody = byRole.get('ROOT_CUSTODY')?.domain;
    const attest = byRole.get('ATTESTOR_WORKER')?.domain;
    // Segregate trust domains from the app Runner even with one human Owner.
    return typeof runner === 'string'
      && custody !== runner && ownerPortal !== runner
      && attest !== runner && custody !== ownerPortal
      && attest !== ownerPortal && attest !== custody;
  } catch { return false; }
}

/** Pure comparison of unverified assertions; never checks a passkey or IAM. */
export function assessSajuSoloOwnerIntentPreflightV1(
  input: SajuSoloOwnerIntentPreflightInputV1,
): SajuSoloOwnerIntentPreflightV1 {
  let intentShape = false;
  let scopeBinding = false;
  let authenticationClaim = false;
  let principalSeparationClaim = false;
  let timeClaim = false;
  try {
    const intent = parseSajuSoloOwnerIntentClaimV1(input?.intent);
    intentShape = true;
    const scope = input.expectedScope;
    if (record(scope, SCOPE_KEYS)) {
      scopeBinding = scope.environmentId === intent.environmentId
        && scope.permitId === intent.permitId
        && scope.manifestDigest === intent.manifestDigest
        && scope.connectionPlanDigest === intent.connectionPlanDigest
        && scope.myeonghaCommitSha === intent.myeonghaCommitSha
        && scope.sajuCommitSha === intent.sajuCommitSha
        && scope.requestDigest === intent.requestDigest;
    }
    const auth = input.authenticationEvent;
    if (record(auth, AUTH_KEYS)) {
      authenticationClaim = auth.intentId === intent.intentId
        && auth.ownerSubject === intent.ownerSubject
        && auth.requestDigest === intent.requestDigest
        && auth.authMethod === intent.authMethod
        && auth.authEventRef === intent.authEventRef
        && validClock(auth.verifiedAtMs)
        && auth.verifiedAtMs >= intent.issuedAtMs
        && auth.verifiedAtMs < intent.expiresAtMs;
    }
    principalSeparationClaim = principalClaims(input.principals, intent.ownerSubject);
    timeClaim = validClock(input.nowMs)
      && input.nowMs >= intent.issuedAtMs && input.nowMs < intent.expiresAtMs;
  } catch { /* malformed caller assertions are always BLOCKED */ }
  const status = (x: boolean): CheckV1 => x ? 'CONSISTENT_CLAIM' : 'BLOCKED';
  const checks = Object.freeze({
    intentShape:status(intentShape),
    scopeBinding:status(scopeBinding),
    authenticationClaim:status(authenticationClaim),
    principalSeparationClaim:status(principalSeparationClaim),
    timeClaim:status(timeClaim),
  });
  return Object.freeze({
    version:'myeongha-saju-solo-owner-preflight-v1' as const,
    claimConsistency:Object.values(checks).every(x => x === 'CONSISTENT_CLAIM')
      ? 'CONSISTENT_UNVERIFIED_ORIGIN' as const : 'BLOCKED' as const,
    checks,
    humanReviewersVerified:0 as const,
    ownerAuthentication:'NOT_VERIFIED' as const,
    custodyAuthority:'NOT_VERIFIED' as const,
    operatorSigningAuthority:'NOT_VERIFIED' as const,
    attestorIndependence:'NOT_VERIFIED' as const,
    auditDurability:'NOT_VERIFIED' as const,
    stagingAdmission:'HOLD' as const,
    canRunOnce:false as const,
    canExecute:false as const,
    canPublish:false as const,
    canSell:false as const,
  });
}
