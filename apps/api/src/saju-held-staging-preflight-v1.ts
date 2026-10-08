import { timingSafeEqual } from 'node:crypto';
import {
  createSajuHeldCurrentBirthServerRehearsalV1,
  type SajuHeldCurrentBirthServerRehearsalOptionsV1,
} from './saju-held-current-birth-server-rehearsal-v1.js';
import { SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1 } from './saju-held-source-proof-http-client-v1.js';
import {
  SAJU_HELD_SOURCE_PROOF_HTTP_VERSION_V1,
  SAJU_HELD_SOURCE_PROOF_VERSION_V1,
} from './saju-held-source-proof-verifier-v1.js';

export const SAJU_HELD_STAGING_PREFLIGHT_VERSION_V1 =
  'myeongha-held-saju-staging-preflight-v1' as const;

export const SAJU_HELD_STAGING_EXTERNAL_GATES_V1 = Object.freeze([
  'source_issuer_deployed_and_restricted',
  'https_tls_peer_and_service_allowlist_verified',
  'independent_service_bearer_and_hmac_secret_provisioned',
  'nonce_database_runtime_login_role_membership_verified',
  'nonce_schema_rls_unique_index_and_gc_verified',
  'authenticated_disposable_subject_birth_fixture_verified',
  'real_http_replay_rotation_and_failover_evidence_recorded',
  'staging_change_authorization_recorded',
] as const);

export type SajuHeldStagingPreflightCheckV1 =
  | 'server_only_trust_contract'
  | 'dedicated_secret_separation'
  | 'source_issuer_wire_descriptor';

export interface SajuHeldSourceIssuerWireDescriptorV1 {
  /** Non-secret source-owned contract; supplied from reviewed Saju deployment evidence. */
  readonly httpPath: string;
  readonly envelopeVersion: string;
  readonly proofVersion: string;
  readonly issuer: string;
  readonly audience: string;
  readonly keyId: string;
  readonly ttlMs: number;
}

export interface SajuHeldStagingPreflightInputV1 {
  /** Never parsed from an incoming request and never included in output. */
  readonly client: SajuHeldCurrentBirthServerRehearsalOptionsV1;
  /** Explicit non-secret source contract; not evidence of issuer deployment. */
  readonly sourceDescriptor?: SajuHeldSourceIssuerWireDescriptorV1;
}

export type SajuHeldStagingPreflightReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_PREFLIGHT_VERSION_V1;
  configuration: 'VALID' | 'BLOCKED';
  checks: Readonly<Record<SajuHeldStagingPreflightCheckV1, 'PASS' | 'BLOCKED'>>;
  externalGates: typeof SAJU_HELD_STAGING_EXTERNAL_GATES_V1;
  stagingConnection: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

function checkTrust(input: SajuHeldStagingPreflightInputV1): boolean {
  try {
    createSajuHeldCurrentBirthServerRehearsalV1(input.client);
    return true;
  } catch {
    return false;
  }
}

function secretSeparated(input: SajuHeldStagingPreflightInputV1): boolean {
  const trust = input?.client?.proofTrust;
  if (!trust || typeof trust.serviceBearer !== 'string'
    || !(trust.keyBytes instanceof Uint8Array)) return false;
  const bearerBytes = Buffer.from(trust.serviceBearer, 'utf8');
  const key = Buffer.from(trust.keyBytes);
  return bearerBytes.length !== key.length || !timingSafeEqual(bearerBytes, key);
}

function sourceMatches(input: SajuHeldStagingPreflightInputV1): boolean {
  const source = input?.sourceDescriptor;
  const trust = input?.client?.proofTrust;
  if (!source || !trust) return false;
  const fields = [
    'httpPath', 'envelopeVersion', 'proofVersion',
    'issuer', 'audience', 'keyId', 'ttlMs',
  ];
  if (Object.keys(source).length !== fields.length
    || !fields.every(key => Object.hasOwn(source, key))) return false;
  return source.httpPath === SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1
    && source.envelopeVersion === SAJU_HELD_SOURCE_PROOF_HTTP_VERSION_V1
    && source.proofVersion === SAJU_HELD_SOURCE_PROOF_VERSION_V1
    && source.issuer === trust.trustedIssuer
    && source.audience === trust.expectedAudience
    && source.keyId === trust.trustedKeyId
    && Number.isSafeInteger(source.ttlMs)
    && source.ttlMs >= 1 && source.ttlMs <= 120_000;
}

/**
 * Zero-I/O and zero-secret-output preflight only. Valid in-memory wiring and
 * matching source-side non-secret metadata cannot attest deployed HTTPS,
 * database role membership, real proof issuance or authorization.
 *
 * This function intentionally never returns a staging activation grant.
 */
export function assessSajuHeldStagingPreflightV1(
  input: SajuHeldStagingPreflightInputV1,
): SajuHeldStagingPreflightReportV1 {
  const checks = Object.freeze({
    server_only_trust_contract: checkTrust(input) ? 'PASS' : 'BLOCKED',
    dedicated_secret_separation: secretSeparated(input) ? 'PASS' : 'BLOCKED',
    source_issuer_wire_descriptor: sourceMatches(input) ? 'PASS' : 'BLOCKED',
  } as const);
  const configuration = Object.values(checks).every(value => value === 'PASS')
    ? 'VALID' : 'BLOCKED';
  return Object.freeze({
    version: SAJU_HELD_STAGING_PREFLIGHT_VERSION_V1,
    configuration,
    checks,
    externalGates: SAJU_HELD_STAGING_EXTERNAL_GATES_V1,
    stagingConnection: 'NOT_VERIFIED' as const,
    stagingAdmission: 'HOLD' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    releaseAuthorization: 'NOT_EVALUATED' as const,
    canExecute: false as const,
    canPublish: false as const,
    canSell: false as const,
  });
}
