import { X509Certificate } from 'node:crypto';
import {
  assessSajuHeldStagingConnectionPlanV1,
  parseSajuHeldStagingConnectionPlanV1,
  type SajuHeldStagingConnectionPlanInputV1,
  type SajuHeldStagingDbConnectionBindingV1,
} from './saju-held-staging-connection-plan-v1.js';

export const SAJU_HELD_STAGING_DB_TLS_TARGET_VERSION_V1 =
  'myeongha-saju-staging-db-tls-target-v1' as const;

type CredentialInputV1 = Readonly<{
  databaseUrl: string;
  rootCertificatePem: string;
}>;
export interface SajuHeldStagingDbTlsInputsV1 {
  readonly planInput: SajuHeldStagingConnectionPlanInputV1;
  readonly subjectDb: CredentialInputV1;
  readonly nonceDb: CredentialInputV1;
  readonly admissionDb: CredentialInputV1;
}
export interface SajuHeldStagingStrictTlsTargetV1 {
  readonly connectionString: string;
  readonly ssl: Readonly<{ readonly ca: string; readonly rejectUnauthorized: true }>;
}
export type SajuHeldStagingDbStrictTlsTargetsV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_DB_TLS_TARGET_VERSION_V1;
  subjectDb: SajuHeldStagingStrictTlsTargetV1;
  nonceDb: SajuHeldStagingStrictTlsTargetV1;
  admissionDb: SajuHeldStagingStrictTlsTargetV1;
}>;

function deny(): never {
  // Do not surface URL, password, PEM, username or hostname in error messages.
  throw new TypeError('Invalid isolated staging PostgreSQL TLS target.');
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    const names = Object.keys(value);
    return names.length === keys.length && Reflect.ownKeys(value).length === names.length
      && keys.every(key => {
        const desc = Object.getOwnPropertyDescriptor(value, key);
        return desc?.enumerable === true && Object.hasOwn(desc, 'value');
      });
  } catch { return false; }
}

/**
 * Generates pg-compatible TLS targets without opening a socket or a pool.
 * The authority-bound plan is only a declaration; real TLS peer, DB cluster
 * identity, role membership and restricted-login proof remain NOT_VERIFIED.
 */
function target(
  input: unknown,
  binding: SajuHeldStagingDbConnectionBindingV1,
): SajuHeldStagingStrictTlsTargetV1 {
  if (!exact(input, ['databaseUrl', 'rootCertificatePem'])
    || typeof input.databaseUrl !== 'string'
    || typeof input.rootCertificatePem !== 'string') return deny();
  let url: URL;
  try { url = new URL(input.databaseUrl); }
  catch { return deny(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== binding.tlsHostname
    || url.username !== binding.loginRole
    || url.password.length === 0
    || url.port === ''
    || url.pathname.length < 2 || url.pathname.includes('%2f')
    || url.hash !== ''
    || [...url.searchParams.keys()].length !== 1
    || url.searchParams.getAll('sslmode').length !== 1
    || url.searchParams.get('sslmode') !== 'verify-full') return deny();
  const pem = input.rootCertificatePem.trim();
  if (pem.includes('-----BEGIN PRIVATE KEY-----')
    || pem.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----')
    || pem.includes('-----BEGIN RSA PRIVATE KEY-----')
    || pem.includes('-----BEGIN EC PRIVATE KEY-----')
    || pem.includes('-----BEGIN OPENSSH PRIVATE KEY-----')
    || (pem.match(/-----BEGIN CERTIFICATE-----/gu)?.length ?? 0) !== 1
    || (pem.match(/-----END CERTIFICATE-----/gu)?.length ?? 0) !== 1) return deny();
  let cert: X509Certificate;
  try { cert = new X509Certificate(pem); }
  catch { return deny(); }
  if (cert.fingerprint256.replaceAll(':', '').toLowerCase() !== binding.caFingerprint256) return deny();

  // node-postgres connection-string SSL params override the explicit ssl
  // object. Strip sslmode only after validation and pin the independent CA.
  url.searchParams.delete('sslmode');
  return Object.freeze({
    connectionString: url.toString(),
    ssl: Object.freeze({ ca: pem, rejectUnauthorized: true as const }),
  });
}

export function buildSajuHeldStagingStrictTlsTargetsV1(
  input: SajuHeldStagingDbTlsInputsV1,
): SajuHeldStagingDbStrictTlsTargetsV1 {
  if (!exact(input, ['planInput', 'subjectDb', 'nonceDb', 'admissionDb'])
    || assessSajuHeldStagingConnectionPlanV1(input.planInput).configuration
      !== 'MATCHED_UNVERIFIED') return deny();
  const plan = parseSajuHeldStagingConnectionPlanV1(input.planInput.plan);
  return Object.freeze({
    version: SAJU_HELD_STAGING_DB_TLS_TARGET_VERSION_V1,
    subjectDb: target(input.subjectDb, plan.subjectDb),
    nonceDb: target(input.nonceDb, plan.nonceDb),
    admissionDb: target(input.admissionDb, plan.admissionDb),
  });
}
