/**
 * SO-3B provider readiness: ZERO I/O and NO AUTHORITY.
 * This only compares caller-supplied plans. It never checks IAM, signatures,
 * KMS, a trusted clock, durable ledgers, budget usage or actual identities.
 */
export const SAJU_SOLO_OWNER_PROVIDER_READINESS_VERSION_V1 =
  'myeongha-saju-so3b-provider-readiness-v1' as const;

const ROLE_POLICY = Object.freeze({
  OWNER_PORTAL:{purpose:'OWNER_INTENT',abilities:['INTENT_RECORD']},
  ROOT_CUSTODY:{purpose:'ROOT_ANCHOR',abilities:['ROOT_ANCHOR_READ']},
  OPERATOR_SIGNER:{purpose:'PERMIT_V2',abilities:['PERMIT_SIGN']},
  ATTESTOR_WORKER:{purpose:'EVIDENCE_ATTESTATION',abilities:['TARGET_READ','ATTEST_SIGN']},
  CHALLENGE_CONSUMER:{purpose:'CHALLENGE_CONSUMPTION',abilities:['CHALLENGE_CONSUME']},
  RUNNER:{purpose:'DISABLED',abilities:[]},
} as const);
export type SajuSo3bRoleV1 = keyof typeof ROLE_POLICY;
const ROLES = Object.keys(ROLE_POLICY) as SajuSo3bRoleV1[];
const SCOPE = ['environmentId','permitId','manifestDigest','connectionPlanDigest',
  'myeonghaCommitSha','sajuCommitSha','requestDigest'] as const;
const PROFILE = ['role','principalId','securityDomainId','humanOwnerSubject',
  'keyPurpose','capabilities','keyExportable'] as const;
const EVIDENCE = [...SCOPE,'rootAnchorRef','externalHighWaterRef','revocationRef',
  'trustedClockRef','attestorWitnessRef','challengeWitnessRef','admissionWitnessRef',
  'auditReceiptRef','auditRetentionDays','maxIncrementalCostUsdCents'] as const;
const CLAIM = ['version','profiles','witnessClaims'] as const;
const ID = /^[A-Za-z0-9._:/-]{3,160}$/u;
const ENV = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const SHA40 = /^[a-f0-9]{40}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

function plain(x: unknown, keys: readonly string[]): x is Record<string, unknown> {
  try {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
    const proto: unknown = Object.getPrototypeOf(x);
    if (proto !== Object.prototype && proto !== null) return false;
    if (Object.keys(x).length !== keys.length
      || Reflect.ownKeys(x).length !== keys.length) return false;
    return keys.every(k=>{
      const d = Object.getOwnPropertyDescriptor(x,k);
      return d?.enumerable === true && Object.hasOwn(d,'value');
    });
  } catch { return false; }
}
function text(x: unknown): x is string {
  return typeof x === 'string' && ID.test(x);
}
function sameScope(a: unknown, b: unknown): boolean {
  if (!plain(a,SCOPE) || !plain(b,SCOPE)) return false;
  if (typeof a.environmentId !== 'string' || !ENV.test(a.environmentId)
    || typeof a.permitId !== 'string' || !UUID.test(a.permitId)
    || typeof a.manifestDigest !== 'string' || !HEX64.test(a.manifestDigest)
    || typeof a.connectionPlanDigest !== 'string' || !HEX64.test(a.connectionPlanDigest)
    || typeof a.myeonghaCommitSha !== 'string' || !SHA40.test(a.myeonghaCommitSha)
    || typeof a.sajuCommitSha !== 'string' || !SHA40.test(a.sajuCommitSha)
    || typeof a.requestDigest !== 'string' || !HEX64.test(a.requestDigest)) return false;
  return SCOPE.every(k=>a[k] === b[k]);
}
function profilesConsistent(x: unknown): boolean {
  try {
    if (!Array.isArray(x) || x.length !== ROLES.length) return false;
    const seenRoles = new Set<string>();
    const principals = new Set<string>();
    const domains = new Set<string>();
    const refs = x as unknown[];
    let owner: string | undefined;
    for (const item of refs) {
      if (!plain(item,PROFILE)
        || !ROLES.includes(item.role as SajuSo3bRoleV1)
        || !text(item.principalId) || !text(item.securityDomainId)
        || !text(item.humanOwnerSubject)) return false;
      const role = item.role as SajuSo3bRoleV1;
      const p = ROLE_POLICY[role];
      if (seenRoles.has(role) || principals.has(item.principalId)
        || domains.has(item.securityDomainId)
        || item.keyPurpose !== p.purpose
        || item.keyExportable !== false
        || !Array.isArray(item.capabilities)
        || item.capabilities.length !== p.abilities.length
        || new Set(item.capabilities).size !== p.abilities.length
        || p.abilities.some(a=>!(item.capabilities as string[]).includes(a))
        || !item.capabilities.every((c: unknown)=>typeof c === 'string')) return false;
      if (owner !== undefined && owner !== item.humanOwnerSubject) return false;
      owner = item.humanOwnerSubject;
      seenRoles.add(role);
      principals.add(item.principalId);
      domains.add(item.securityDomainId);
    }
    return seenRoles.size === ROLES.length;
  } catch { return false; }
}
function witnessesConsistent(x: unknown, expected: unknown): boolean {
  try {
    if (!plain(x,EVIDENCE) || !plain(expected,SCOPE)) return false;
    const claimedScope: Record<string,unknown> = {};
    for (const k of SCOPE) claimedScope[k] = x[k];
    if (!sameScope(claimedScope,expected)) return false;
    const refs = ['rootAnchorRef','externalHighWaterRef','revocationRef',
      'trustedClockRef','attestorWitnessRef','challengeWitnessRef',
      'admissionWitnessRef','auditReceiptRef'] as const;
    if (!refs.every(k=>text(x[k]))) return false;
    if (new Set(refs.map(k=>x[k])).size !== refs.length) return false;
    return Number.isSafeInteger(x.auditRetentionDays) && (x.auditRetentionDays as number) >= 30
      && (x.auditRetentionDays as number) <= 3650
      && x.maxIncrementalCostUsdCents === 0;
  } catch { return false; }
}

/** Future read-only provenance adapters; no implementation or calls in SO-3B. */
export interface SajuSo3bUnconnectedReadOnlyProviderPortsV1 {
  readAuthenticatedWorkloadIdentity(): Promise<unknown>;
  readRootAndRevisionAnchor(): Promise<unknown>;
  readTrustedClockAndRevocations(): Promise<unknown>;
  readSignedAttestorReceipt(): Promise<unknown>;
  readIndependentAuditReceipt(): Promise<unknown>;
}
export type SajuSo3bReadinessV1 = Readonly<{
  version: typeof SAJU_SOLO_OWNER_PROVIDER_READINESS_VERSION_V1;
  claimShape: 'CONSISTENT_UNVERIFIED_ORIGIN' | 'BLOCKED';
  checks: Readonly<{
    topLevel: 'CONSISTENT_CLAIM' | 'BLOCKED';
    roleSeparation: 'CONSISTENT_CLAIM' | 'BLOCKED';
    scopedWitnesses: 'CONSISTENT_CLAIM' | 'BLOCKED';
  }>;
  humanReviewersVerified: 0;
  workloadIdentityAuthority: 'NOT_VERIFIED';
  rootCustodyAuthority: 'NOT_VERIFIED';
  signerAuthority: 'NOT_VERIFIED';
  attestorAuthority: 'NOT_VERIFIED';
  trustedClockAuthority: 'NOT_VERIFIED';
  revisionDurability: 'NOT_VERIFIED';
  auditDurability: 'NOT_VERIFIED';
  evidenceProvenance: 'NOT_VERIFIED';
  budgetAuthority: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  mayRetryConsumption: false;
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;
export function assessSajuSoloOwnerProviderReadinessClaimV1(
  claim: unknown, expectedScope: unknown,
): SajuSo3bReadinessV1 {
  let top = false, roles = false, witnesses = false;
  try {
    if (plain(claim,CLAIM)
      && claim.version === SAJU_SOLO_OWNER_PROVIDER_READINESS_VERSION_V1) {
      top = true;
      roles = profilesConsistent(claim.profiles);
      witnesses = witnessesConsistent(claim.witnessClaims,expectedScope);
    }
  } catch { /* Caller-controlled objects cannot escape the HOLD boundary. */ }
  const s = (x:boolean): 'CONSISTENT_CLAIM'|'BLOCKED' => x?'CONSISTENT_CLAIM':'BLOCKED';
  const checks = Object.freeze({
    topLevel:s(top),roleSeparation:s(roles),scopedWitnesses:s(witnesses),
  });
  return Object.freeze({
    version:SAJU_SOLO_OWNER_PROVIDER_READINESS_VERSION_V1,
    claimShape:top && roles && witnesses
      ? 'CONSISTENT_UNVERIFIED_ORIGIN' as const : 'BLOCKED' as const,
    checks,
    humanReviewersVerified:0 as const,
    workloadIdentityAuthority:'NOT_VERIFIED' as const,
    rootCustodyAuthority:'NOT_VERIFIED' as const,
    signerAuthority:'NOT_VERIFIED' as const,
    attestorAuthority:'NOT_VERIFIED' as const,
    trustedClockAuthority:'NOT_VERIFIED' as const,
    revisionDurability:'NOT_VERIFIED' as const,
    auditDurability:'NOT_VERIFIED' as const,
    evidenceProvenance:'NOT_VERIFIED' as const,
    budgetAuthority:'NOT_VERIFIED' as const,
    stagingAdmission:'HOLD' as const,
    mayRetryConsumption:false as const,
    canRunOnce:false as const,
    canExecute:false as const,
    canPublish:false as const,
    canSell:false as const,
  });
}
