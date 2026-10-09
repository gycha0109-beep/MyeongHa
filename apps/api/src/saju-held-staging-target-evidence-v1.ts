import { createHash } from 'node:crypto';

export const SAJU_HELD_STAGING_TARGET_EVIDENCE_VERSION_V1 =
  'myeongha-saju-staging-target-evidence-v1' as const;
const DOMAIN = 'myeongha/saju/staging/target-evidence/v1\0';
const OBS_DOMAIN = 'myeongha/saju/staging/target-observations/v1\0';
const FIELDS = ['version', 'environmentId', 'manifestDigest', 'connectionPlanDigest',
  'myeonghaCommitSha', 'sajuCommitSha', 'attestorId', 'attestorKeyId',
  'challengeDigest', 'observedAtMs', 'expiresAtMs', 'observationsDigest',
  'observations'] as const;
const OBS_FIELDS = ['auth', 'subjectDb', 'nonceDb', 'admissionDb', 'proof'] as const;
const AUTH = ['projectRef', 'origin', 'memberOnlyObserved', 'productionSeparatedObserved'] as const;
const DB = ['targetId', 'loginRole', 'runtimeRole', 'tlsHostname', 'caFingerprint256',
  'clusterIdentityDigest', 'sessionUser', 'currentUser', 'tlsPeerVerified',
  'roleMembershipObserved', 'nonPrivilegedLoginObserved',
  'rlsObserved', 'crossDomainDeniedObserved'] as const;
const PROOF = ['origin', 'issuer', 'audience', 'keyId', 'httpsPeerVerified',
  'bearerIsolatedObserved', 'hmacIsolatedObserved', 'productionSeparatedObserved'] as const;
const HEX64 = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const ID = /^[A-Za-z0-9._:-]{3,128}$/u;
const ENV = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const ONE_MINUTE = 60_000;

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
const timestamp = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const id = (x: unknown): x is string => typeof x === 'string' && ID.test(x);
const digest = (x: unknown): x is string => typeof x === 'string' && HEX64.test(x);
const bool = (x: unknown): x is true => x === true;
const origin = (x: unknown): x is string => {
  if (typeof x !== 'string') return false;
  try {
    const u = new URL(x);
    return u.protocol === 'https:' && u.origin === x && u.hostname !== 'localhost'
      && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/';
  } catch { return false; }
};

export interface SajuStagingDbObservationV1 {
  readonly targetId: string; readonly loginRole: string; readonly runtimeRole: string;
  readonly tlsHostname: string; readonly caFingerprint256: string;
  readonly clusterIdentityDigest: string; readonly sessionUser: string; readonly currentUser: string;
  readonly tlsPeerVerified: true; readonly roleMembershipObserved: true;
  readonly nonPrivilegedLoginObserved: true; readonly rlsObserved: true;
  readonly crossDomainDeniedObserved: true;
}
export interface SajuStagingTargetObservationsV1 {
  readonly auth: Readonly<{ projectRef: string; origin: string;
    memberOnlyObserved: true; productionSeparatedObserved: true }>;
  readonly subjectDb: Readonly<SajuStagingDbObservationV1>;
  readonly nonceDb: Readonly<SajuStagingDbObservationV1>;
  readonly admissionDb: Readonly<SajuStagingDbObservationV1>;
  readonly proof: Readonly<{ origin: string; issuer: string; audience: string;
    keyId: string; httpsPeerVerified: true; bearerIsolatedObserved: true;
    hmacIsolatedObserved: true; productionSeparatedObserved: true }>;
}
export interface SajuStagingTargetEvidenceV1 {
  readonly version: typeof SAJU_HELD_STAGING_TARGET_EVIDENCE_VERSION_V1;
  readonly environmentId: string;
  readonly manifestDigest: string; readonly connectionPlanDigest: string;
  readonly myeonghaCommitSha: string; readonly sajuCommitSha: string;
  readonly attestorId: string; readonly attestorKeyId: string;
  readonly challengeDigest: string; readonly observedAtMs: number;
  readonly expiresAtMs: number; readonly observationsDigest: string;
  readonly observations: Readonly<SajuStagingTargetObservationsV1>;
}
function dbObserve(x: unknown): Readonly<SajuStagingDbObservationV1> {
  if (!exact(x, DB) || !id(x.targetId) || !id(x.loginRole) || !id(x.runtimeRole)
    || !id(x.tlsHostname) || !digest(x.caFingerprint256)
    || !digest(x.clusterIdentityDigest) || !id(x.sessionUser) || !id(x.currentUser)
    || !bool(x.tlsPeerVerified) || !bool(x.roleMembershipObserved)
    || !bool(x.nonPrivilegedLoginObserved) || !bool(x.rlsObserved)
    || !bool(x.crossDomainDeniedObserved)) throw new TypeError();
  return Object.freeze(Object.fromEntries(DB.map(k => [k, x[k]])) as unknown as SajuStagingDbObservationV1);
}
function observations(input: unknown): Readonly<SajuStagingTargetObservationsV1> {
  if (!exact(input, OBS_FIELDS)) throw new TypeError();
  const a = input.auth, p = input.proof;
  if (!exact(a, AUTH) || !id(a.projectRef) || !origin(a.origin)
    || !bool(a.memberOnlyObserved) || !bool(a.productionSeparatedObserved)
    || !exact(p, PROOF) || !origin(p.origin) || !id(p.issuer) || !id(p.audience)
    || !id(p.keyId) || !bool(p.httpsPeerVerified)
    || !bool(p.bearerIsolatedObserved) || !bool(p.hmacIsolatedObserved)
    || !bool(p.productionSeparatedObserved)) throw new TypeError();
  return Object.freeze({
    auth: Object.freeze(Object.fromEntries(AUTH.map(k => [k, a[k]])) as unknown as SajuStagingTargetObservationsV1['auth']),
    subjectDb: dbObserve(input.subjectDb),
    nonceDb: dbObserve(input.nonceDb),
    admissionDb: dbObserve(input.admissionDb),
    proof: Object.freeze(Object.fromEntries(PROOF.map(k => [k, p[k]])) as unknown as SajuStagingTargetObservationsV1['proof']),
  });
}
function ordered(obs: Readonly<SajuStagingTargetObservationsV1>): unknown[] {
  return [
    AUTH.map(k => obs.auth[k]),
    DB.map(k => obs.subjectDb[k]),
    DB.map(k => obs.nonceDb[k]),
    DB.map(k => obs.admissionDb[k]),
    PROOF.map(k => obs.proof[k]),
  ];
}
export function digestSajuHeldStagingObservationsV1(input: unknown): string {
  const obs = observations(input);
  return createHash('sha256').update(OBS_DOMAIN, 'utf8')
    .update(JSON.stringify(ordered(obs)), 'utf8').digest('hex');
}

/** Signed statements are still assertions, NOT independently observed operations. */
export function parseSajuHeldStagingTargetEvidenceV1(input: unknown):
  Readonly<SajuStagingTargetEvidenceV1> {
  try {
    if (!exact(input, FIELDS)
      || input.version !== SAJU_HELD_STAGING_TARGET_EVIDENCE_VERSION_V1
      || typeof input.environmentId !== 'string' || !ENV.test(input.environmentId)
      || !digest(input.manifestDigest) || !digest(input.connectionPlanDigest)
      || typeof input.myeonghaCommitSha !== 'string' || !SHA.test(input.myeonghaCommitSha)
      || typeof input.sajuCommitSha !== 'string' || !SHA.test(input.sajuCommitSha)
      || !id(input.attestorId) || !id(input.attestorKeyId)
      || !digest(input.challengeDigest) || !digest(input.observationsDigest)
      || !timestamp(input.observedAtMs) || !timestamp(input.expiresAtMs)
      || input.expiresAtMs <= input.observedAtMs
      || input.expiresAtMs - input.observedAtMs > ONE_MINUTE) throw new TypeError();
    const obs = observations(input.observations);
    if (digestSajuHeldStagingObservationsV1(obs) !== input.observationsDigest) throw new TypeError();
    return Object.freeze({
      version: SAJU_HELD_STAGING_TARGET_EVIDENCE_VERSION_V1,
      environmentId: input.environmentId,
      manifestDigest: input.manifestDigest, connectionPlanDigest: input.connectionPlanDigest,
      myeonghaCommitSha: input.myeonghaCommitSha, sajuCommitSha: input.sajuCommitSha,
      attestorId: input.attestorId, attestorKeyId: input.attestorKeyId,
      challengeDigest: input.challengeDigest, observedAtMs: input.observedAtMs,
      expiresAtMs: input.expiresAtMs, observationsDigest: input.observationsDigest,
      observations: obs,
    });
  } catch { throw new TypeError('Invalid isolated staging target evidence V1.'); }
}

export function canonicalSajuHeldStagingTargetEvidenceBytesV1(input: unknown): Uint8Array {
  const e = parseSajuHeldStagingTargetEvidenceV1(input);
  return Buffer.from(DOMAIN + JSON.stringify([
    e.version, e.environmentId, e.manifestDigest, e.connectionPlanDigest,
    e.myeonghaCommitSha, e.sajuCommitSha, e.attestorId, e.attestorKeyId,
    e.challengeDigest, e.observedAtMs, e.expiresAtMs, e.observationsDigest,
    ordered(e.observations),
  ]), 'utf8');
}
