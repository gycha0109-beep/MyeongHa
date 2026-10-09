import {
  digestSajuHeldStagingTargetManifestV1,
  parseSajuHeldStagingTargetManifestV1,
} from './saju-held-staging-target-manifest-v1.js';
import {
  assessSajuHeldStagingTargetConfigV1,
  type SajuHeldStagingTargetConfigInputV1,
} from './saju-held-staging-target-validator-v1.js';

export const SAJU_HELD_STAGING_READINESS_VERSION_V1 =
  'myeongha-saju-staging-readiness-v1' as const;

export const SAJU_HELD_STAGING_EVIDENCE_GATES_V1 = Object.freeze([
  'staging_auth_project_isolation',
  'subject_db_tls_identity_and_role',
  'nonce_db_tls_identity_and_runtime_role',
  'saju_issuer_deployed_restricted_tls',
  'bearer_and_hmac_provisioned_separately',
  'disposable_verified_member_and_current_birth',
  'one_shot_operator_admission_atomicity',
  'staging_change_approval_and_rollback',
] as const);

export type SajuHeldStagingEvidenceGateV1 =
  typeof SAJU_HELD_STAGING_EVIDENCE_GATES_V1[number];

const EVIDENCE_KEYS = Object.freeze([
  'gate', 'manifestDigest', 'environmentId', 'myeonghaCommitSha',
  'sajuCommitSha', 'authorityId', 'observedAtMs', 'expiresAtMs', 'result',
] as const);

export interface SajuHeldStagingEvidenceClaimV1 {
  readonly gate: SajuHeldStagingEvidenceGateV1;
  readonly manifestDigest: string;
  readonly environmentId: string;
  readonly myeonghaCommitSha: string;
  readonly sajuCommitSha: string;
  /** Non-secret diagnostic label; not authentication or verification. */
  readonly authorityId: string;
  readonly observedAtMs: number;
  readonly expiresAtMs: number;
  readonly result: 'REPORTED_PASS' | 'REPORTED_BLOCKED';
}

export interface SajuHeldStagingReadinessInputV1 {
  /** Revalidate original config, never trust a forged "configuration: VALID" report. */
  readonly configInput: SajuHeldStagingTargetConfigInputV1;
  /** Unauthenticated evidence CLAIMS; future operational verifier is separate. */
  readonly evidence: unknown;
  /** Injected deterministic clock is not proof of trusted time. */
  readonly nowMs: unknown;
}

export type SajuHeldStagingReadinessReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_READINESS_VERSION_V1;
  configuration: 'VALID' | 'BLOCKED';
  evidenceCoverage: 'INCOMPLETE' | 'COMPLETE_UNTRUSTED' | 'BLOCKED';
  operationalEvidence: 'NOT_VERIFIED' | 'BLOCKED';
  checks: Readonly<Record<SajuHeldStagingEvidenceGateV1, 'MISSING' | 'REPORTED_ONLY' | 'BLOCKED'>>;
  stagingConnection: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

const DIGEST = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const ID = /^[a-zA-Z0-9._:-]{3,128}$/u;
const MAX_EVIDENCE_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const GATES: ReadonlySet<string> = new Set(SAJU_HELD_STAGING_EVIDENCE_GATES_V1);

function isStrictEvidenceRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Object.keys(value);
    return keys.length === EVIDENCE_KEYS.length
      && Reflect.ownKeys(value).length === keys.length
      && EVIDENCE_KEYS.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
      });
  } catch {
    return false;
  }
}

/** A record CLAIM never becomes trusted evidence just by passing this parser. */
function parseEvidenceClaim(value: unknown): Readonly<SajuHeldStagingEvidenceClaimV1> | null {
  try {
    if (!isStrictEvidenceRecord(value)
      || typeof value.gate !== 'string' || !GATES.has(value.gate)
      || typeof value.manifestDigest !== 'string' || !DIGEST.test(value.manifestDigest)
      || typeof value.environmentId !== 'string' || !ID.test(value.environmentId)
      || typeof value.myeonghaCommitSha !== 'string' || !SHA.test(value.myeonghaCommitSha)
      || typeof value.sajuCommitSha !== 'string' || !SHA.test(value.sajuCommitSha)
      || typeof value.authorityId !== 'string' || !ID.test(value.authorityId)
      || typeof value.observedAtMs !== 'number' || !Number.isSafeInteger(value.observedAtMs)
      || value.observedAtMs < 0
      || typeof value.expiresAtMs !== 'number' || !Number.isSafeInteger(value.expiresAtMs)
      || value.expiresAtMs <= value.observedAtMs
      || value.expiresAtMs - value.observedAtMs > MAX_EVIDENCE_LIFETIME_MS
      || (value.result !== 'REPORTED_PASS' && value.result !== 'REPORTED_BLOCKED')) return null;
    return Object.freeze({
      gate: value.gate as SajuHeldStagingEvidenceGateV1,
      manifestDigest: value.manifestDigest,
      environmentId: value.environmentId,
      myeonghaCommitSha: value.myeonghaCommitSha,
      sajuCommitSha: value.sajuCommitSha,
      authorityId: value.authorityId,
      observedAtMs: value.observedAtMs,
      expiresAtMs: value.expiresAtMs,
      result: value.result,
    } as SajuHeldStagingEvidenceClaimV1);
  } catch {
    return null;
  }
}

/**
 * Static evidence coverage only. No networking, Auth, database, secret lookup,
 * signing, operator grant, retry, credential exposure or runtime port creation.
 * An apparently complete set of self-reported PASS claims is NEVER VERIFIED.
 */
export function assessSajuHeldStagingReadinessV1(
  input: SajuHeldStagingReadinessInputV1,
): SajuHeldStagingReadinessReportV1 {
  let configuration: 'VALID' | 'BLOCKED' = 'BLOCKED';
  let manifest: ReturnType<typeof parseSajuHeldStagingTargetManifestV1> | null = null;
  let digest: string | null = null;
  try {
    configuration = assessSajuHeldStagingTargetConfigV1(input?.configInput).configuration;
    manifest = parseSajuHeldStagingTargetManifestV1(input?.configInput?.manifest);
    digest = digestSajuHeldStagingTargetManifestV1(manifest);
  } catch {
    configuration = 'BLOCKED';
  }

  const checks: Record<SajuHeldStagingEvidenceGateV1, 'MISSING' | 'REPORTED_ONLY' | 'BLOCKED'> =
    Object.fromEntries(SAJU_HELD_STAGING_EVIDENCE_GATES_V1.map(gate =>
      [gate, 'MISSING' as const],
    )) as Record<SajuHeldStagingEvidenceGateV1, 'MISSING' | 'REPORTED_ONLY' | 'BLOCKED'>;

  let invalid = false;
  let claims: unknown[] = [];
  try {
    if (input?.evidence !== null && input?.evidence !== undefined) {
      if (!Array.isArray(input.evidence)
        || Object.getPrototypeOf(input.evidence) !== Array.prototype
        || input.evidence.length > SAJU_HELD_STAGING_EVIDENCE_GATES_V1.length
        || Reflect.ownKeys(input.evidence).some(key =>
          key !== 'length' && !/^(0|[1-9][0-9]*)$/u.test(String(key)))) {
        invalid = true;
      } else {
        claims = input.evidence;
      }
    }
  } catch {
    invalid = true;
  }

  const seen = new Set<SajuHeldStagingEvidenceGateV1>();
  for (const untrusted of claims) {
    const claim = parseEvidenceClaim(untrusted);
    if (claim === null) {
      invalid = true;
      continue;
    }
    if (seen.has(claim.gate)) {
      checks[claim.gate] = 'BLOCKED';
      invalid = true;
      continue;
    }
    seen.add(claim.gate);
    const validBinding = manifest !== null && digest !== null
      && claim.manifestDigest === digest
      && claim.environmentId === manifest.environmentId
      && claim.myeonghaCommitSha === manifest.myeonghaCommitSha
      && claim.sajuCommitSha === manifest.sajuCommitSha
      && typeof input?.nowMs === 'number' && Number.isSafeInteger(input.nowMs)
      && input.nowMs >= claim.observedAtMs && input.nowMs < claim.expiresAtMs;
    if (!validBinding || claim.result === 'REPORTED_BLOCKED') {
      checks[claim.gate] = 'BLOCKED';
      invalid = true;
    } else {
      checks[claim.gate] = 'REPORTED_ONLY';
    }
  }

  if (input?.nowMs === null || typeof input?.nowMs !== 'number'
    || !Number.isSafeInteger(input.nowMs) || input.nowMs < 0) invalid = true;

  const coverage = invalid || configuration === 'BLOCKED'
    ? 'BLOCKED' as const
    : SAJU_HELD_STAGING_EVIDENCE_GATES_V1.every(gate => checks[gate] === 'REPORTED_ONLY')
      ? 'COMPLETE_UNTRUSTED' as const : 'INCOMPLETE' as const;

  return Object.freeze({
    version: SAJU_HELD_STAGING_READINESS_VERSION_V1,
    configuration,
    evidenceCoverage: coverage,
    operationalEvidence: coverage === 'BLOCKED' ? 'BLOCKED' as const : 'NOT_VERIFIED' as const,
    checks: Object.freeze(checks),
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
