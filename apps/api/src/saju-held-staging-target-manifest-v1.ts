import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF } from './production-user-data-runtime-config.js';

export const SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1 =
  'myeongha-saju-staging-target-v1' as const;

export const SAJU_HELD_STAGING_TARGET_MANIFEST_KEYS_V1 = Object.freeze([
  'version',
  'environmentId',
  'myeonghaCommitSha',
  'sajuCommitSha',
  'authProjectRef',
  'authOrigin',
  'subjectDbTargetId',
  'nonceDbTargetId',
  'proofServiceOrigin',
  'proofIssuer',
  'proofAudience',
  'proofKeyId',
  'proofTtlMs',
] as const);

export interface SajuHeldStagingTargetManifestV1 {
  readonly version: typeof SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1;
  readonly environmentId: string;
  readonly myeonghaCommitSha: string;
  readonly sajuCommitSha: string;
  readonly authProjectRef: string;
  readonly authOrigin: string;
  /** Reviewed non-secret target labels, not connection or TLS evidence. */
  readonly subjectDbTargetId: string;
  readonly nonceDbTargetId: string;
  readonly proofServiceOrigin: string;
  readonly proofIssuer: string;
  readonly proofAudience: string;
  readonly proofKeyId: string;
  readonly proofTtlMs: number;
}

const HEX_SHA = /^[a-f0-9]{40}$/u;
const PROJECT_REF = /^[a-z0-9]{20}$/u;
const ENV_ID = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const TARGET_ID = /^[a-z][a-z0-9._:-]{2,100}$/u;
const PROOF_ID = /^[A-Za-z0-9._:-]{3,128}$/u;
const DNS_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const DIGEST_DOMAIN = 'myeongha/saju/staging-target/manifest/v1\0';

function exactOwnDataFields(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const names = Object.keys(value);
  if (names.length !== SAJU_HELD_STAGING_TARGET_MANIFEST_KEYS_V1.length
    || Reflect.ownKeys(value).length !== names.length) return false;
  return SAJU_HELD_STAGING_TARGET_MANIFEST_KEYS_V1.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
      && descriptor.enumerable === true;
  });
}

function bareHttpsDnsOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && parsed.username === ''
    && parsed.password === '' && parsed.pathname === '/'
    && parsed.search === '' && parsed.hash === ''
    && parsed.port === '' && parsed.origin === value
    && !parsed.hostname.includes(':') && isIP(parsed.hostname) === 0
    && DNS_HOST.test(parsed.hostname)
    && parsed.hostname !== 'localhost' && !parsed.hostname.endsWith('.localhost')
    && !parsed.hostname.endsWith('.local');
}

/**
 * Strict, zero-I/O parser. Only reviewed, non-secret identifiers are permitted.
 * Parsed JSON duplicate keys must be rejected by the upstream raw JSON decoder:
 * a JavaScript object cannot reveal duplicates already discarded by JSON.parse.
 */
export function parseSajuHeldStagingTargetManifestV1(
  value: unknown,
): Readonly<SajuHeldStagingTargetManifestV1> {
  if (!exactOwnDataFields(value)
    || value.version !== SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1
    || typeof value.environmentId !== 'string' || !ENV_ID.test(value.environmentId)
    || typeof value.myeonghaCommitSha !== 'string' || !HEX_SHA.test(value.myeonghaCommitSha)
    || typeof value.sajuCommitSha !== 'string' || !HEX_SHA.test(value.sajuCommitSha)
    || typeof value.authProjectRef !== 'string' || !PROJECT_REF.test(value.authProjectRef)
    || value.authProjectRef === MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF
    || !bareHttpsDnsOrigin(value.authOrigin)
    || value.authOrigin !== 'https://' + value.authProjectRef + '.supabase.co'
    || typeof value.subjectDbTargetId !== 'string' || !TARGET_ID.test(value.subjectDbTargetId)
    || typeof value.nonceDbTargetId !== 'string' || !TARGET_ID.test(value.nonceDbTargetId)
    || value.subjectDbTargetId === value.nonceDbTargetId
    || !bareHttpsDnsOrigin(value.proofServiceOrigin)
    || value.proofServiceOrigin === value.authOrigin
    || typeof value.proofIssuer !== 'string' || !PROOF_ID.test(value.proofIssuer)
    || typeof value.proofAudience !== 'string' || !PROOF_ID.test(value.proofAudience)
    || typeof value.proofKeyId !== 'string' || !PROOF_ID.test(value.proofKeyId)
    || typeof value.proofTtlMs !== 'number' || !Number.isSafeInteger(value.proofTtlMs)
    || (value.proofTtlMs as number) < 1 || (value.proofTtlMs as number) > 120_000) {
    throw new TypeError('Invalid isolated staging target manifest.');
  }

  // Fresh projection: never return references/prototypes/accessors from caller input.
  return Object.freeze({
    version: SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
    environmentId: value.environmentId,
    myeonghaCommitSha: value.myeonghaCommitSha,
    sajuCommitSha: value.sajuCommitSha,
    authProjectRef: value.authProjectRef,
    authOrigin: value.authOrigin,
    subjectDbTargetId: value.subjectDbTargetId,
    nonceDbTargetId: value.nonceDbTargetId,
    proofServiceOrigin: value.proofServiceOrigin,
    proofIssuer: value.proofIssuer,
    proofAudience: value.proofAudience,
    proofKeyId: value.proofKeyId,
    proofTtlMs: value.proofTtlMs,
  } as SajuHeldStagingTargetManifestV1);
}

/** A canonical identifier, NOT a signature or operational admission grant. */
export function digestSajuHeldStagingTargetManifestV1(value: unknown): string {
  const manifest = parseSajuHeldStagingTargetManifestV1(value);
  const ordered = SAJU_HELD_STAGING_TARGET_MANIFEST_KEYS_V1.map(key => manifest[key]);
  return createHash('sha256').update(DIGEST_DOMAIN, 'utf8')
    .update(JSON.stringify(ordered), 'utf8').digest('hex');
}
