import {
  parseSajuHeldStagingTargetManifestV1,
  digestSajuHeldStagingTargetManifestV1,
} from './saju-held-staging-target-manifest-v1.js';
import {
  parseSajuHeldStagingConnectionPlanV1,
  digestSajuHeldStagingConnectionPlanV1,
  assessSajuHeldStagingConnectionPlanV1,
} from './saju-held-staging-connection-plan-v1.js';

/**
 * 3-04-03A: Evidence *index* only. Neither independent observation, artifact
 * integrity, trusted clock nor custody is established by this pure function.
 */
export const SAJU_HELD_STAGING_EVIDENCE_INDEX_VERSION_V1 =
  'myeongha-saju-staging-operational-evidence-index-v1' as const;

export const SAJU_HELD_STAGING_REQUIRED_EVIDENCE_V1 = Object.freeze([
  { id: 'R01', sourceKind: 'ROOT_CUSTODY' },
  { id: 'R02', sourceKind: 'REGISTRY_ROLLBACK_LEDGER' },
  { id: 'R03', sourceKind: 'OPERATOR_APPROVAL_LEDGER' },
  { id: 'R04', sourceKind: 'CHALLENGE_LEDGER' },
  { id: 'R05', sourceKind: 'AUTH_MANAGEMENT_PLANE' },
  { id: 'R06', sourceKind: 'SUBJECT_DB_TLS_PROBE' },
  { id: 'R07', sourceKind: 'SUBJECT_DB_PRIVILEGE_PROBE' },
  { id: 'R08', sourceKind: 'NONCE_DB_ISOLATION_PROBE' },
  { id: 'R09', sourceKind: 'ADMISSION_DB_ISOLATION_PROBE' },
  { id: 'R10', sourceKind: 'PROOF_INGRESS_PROBE' },
  { id: 'R11', sourceKind: 'PROOF_KEY_CUSTODY' },
  { id: 'R12', sourceKind: 'DEPLOYMENT_ATTESTATION' },
  { id: 'R13', sourceKind: 'TEST_MEMBER_ACCESS_PROBE' },
  { id: 'R14', sourceKind: 'ROLLBACK_DRILL_RECORD' },
] as const);
export type SajuStagingEvidenceIdV1 = (typeof SAJU_HELD_STAGING_REQUIRED_EVIDENCE_V1)[number]['id'];

const FIELDS = [
  'evidenceId', 'sourceKind', 'environmentId', 'manifestDigest',
  'connectionPlanDigest', 'myeonghaCommitSha', 'sajuCommitSha',
  'artifactDigest', 'auditRecordId', 'collectorId', 'reviewerId',
  'claimedObservedAtMs',
] as const;
const HEX64 = /^[a-f0-9]{64}$/u;
const SHA40 = /^[a-f0-9]{40}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;

function exactData(x: unknown): x is Record<string, unknown> {
  try {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
    const proto: unknown = Object.getPrototypeOf(x);
    if (proto !== Object.prototype && proto !== null) return false;
    const keys = Object.keys(x);
    return keys.length === FIELDS.length && Reflect.ownKeys(x).length === keys.length
      && FIELDS.every(key => {
        const d = Object.getOwnPropertyDescriptor(x, key);
        return d?.enumerable === true && Object.hasOwn(d, 'value');
      });
  } catch { return false; }
}
const digest = (x: unknown): x is string => typeof x === 'string' && HEX64.test(x);
const ref = (x: unknown): x is string => typeof x === 'string' && SAFE_REF.test(x);
const clock = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;

export interface SajuHeldStagingEvidenceIndexInputV1 {
  readonly manifest: unknown;
  readonly reviewedManifest: unknown;
  readonly connectionPlan: unknown;
  readonly reviewedConnectionPlan: unknown;
  /** Untrusted references, NOT the underlying evidence or probe output. */
  readonly entries: unknown;
  /** Caller-provided comparison clock, NOT an independently trusted time. */
  readonly nowMs: unknown;
}

export type SajuHeldStagingEvidenceIndexReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_EVIDENCE_INDEX_VERSION_V1;
  inventory: 'INDEXED_UNVERIFIED' | 'BLOCKED';
  targetBinding: 'DECLARED_MATCH_UNVERIFIED' | 'BLOCKED';
  missingEvidenceIds: readonly SajuStagingEvidenceIdV1[];
  blockedEvidenceIds: readonly SajuStagingEvidenceIdV1[];
  evidenceProvenance: 'NOT_VERIFIED';
  operationalEvidence: 'NOT_VERIFIED';
  rootAuthority: 'NOT_VERIFIED';
  stagingConnection: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

/** No I/O, no signature validation, no privilege escalation and no Runner port. */
export function assessSajuHeldStagingEvidenceIndexV1(
  input: SajuHeldStagingEvidenceIndexInputV1,
): SajuHeldStagingEvidenceIndexReportV1 {
  const byId = new Map<SajuStagingEvidenceIdV1, Record<string, unknown>>();
  const blocked = new Set<SajuStagingEvidenceIdV1>();
  let invalidExtra = false;
  let targetMatches = false;

  try {
    const m = parseSajuHeldStagingTargetManifestV1(input?.manifest);
    const reviewed = parseSajuHeldStagingTargetManifestV1(input?.reviewedManifest);
    const p = parseSajuHeldStagingConnectionPlanV1(input?.connectionPlan);
    targetMatches = clock(input.nowMs)
      && digestSajuHeldStagingTargetManifestV1(m)
        === digestSajuHeldStagingTargetManifestV1(reviewed)
      && assessSajuHeldStagingConnectionPlanV1({
        plan: p, manifest: m, approvedNonSecretPlan: input.reviewedConnectionPlan,
      }).configuration === 'MATCHED_UNVERIFIED';
    if (targetMatches && Array.isArray(input.entries) && input.entries.length <= 14) {
      const mh = digestSajuHeldStagingTargetManifestV1(m);
      const ph = digestSajuHeldStagingConnectionPlanV1(p);
      const digests = new Map<string, SajuStagingEvidenceIdV1>();
      const auditRefs = new Map<string, SajuStagingEvidenceIdV1>();
      for (const raw of input.entries as unknown[]) {
        if (!exactData(raw)) { invalidExtra = true; continue; }
        const spec = SAJU_HELD_STAGING_REQUIRED_EVIDENCE_V1.find(s => s.id === raw.evidenceId);
        if (!spec) { invalidExtra = true; continue; }
        const evidenceId = spec.id;
        if (byId.has(evidenceId)) { blocked.add(evidenceId); continue; }
        byId.set(evidenceId, raw);
        if (raw.sourceKind !== spec.sourceKind
          || raw.environmentId !== m.environmentId
          || raw.manifestDigest !== mh || raw.connectionPlanDigest !== ph
          || raw.myeonghaCommitSha !== m.myeonghaCommitSha
          || raw.sajuCommitSha !== m.sajuCommitSha
          || !digest(raw.artifactDigest) || !ref(raw.auditRecordId)
          || !ref(raw.collectorId) || !ref(raw.reviewerId)
          || raw.collectorId === raw.reviewerId
          || !clock(raw.claimedObservedAtMs) || !clock(input.nowMs)
          || raw.claimedObservedAtMs > input.nowMs
          || typeof raw.myeonghaCommitSha !== 'string' || !SHA40.test(raw.myeonghaCommitSha)
          || typeof raw.sajuCommitSha !== 'string' || !SHA40.test(raw.sajuCommitSha)) {
          blocked.add(evidenceId);
          continue;
        }
        const priorDigest = digests.get(raw.artifactDigest);
        if (priorDigest) { blocked.add(priorDigest); blocked.add(evidenceId); }
        else digests.set(raw.artifactDigest, evidenceId);
        const priorAudit = auditRefs.get(raw.auditRecordId);
        if (priorAudit) { blocked.add(priorAudit); blocked.add(evidenceId); }
        else auditRefs.set(raw.auditRecordId, evidenceId);
      }
    } else invalidExtra = true;
  } catch { invalidExtra = true; }

  const missingEvidenceIds = SAJU_HELD_STAGING_REQUIRED_EVIDENCE_V1
    .filter(s => !byId.has(s.id)).map(s => s.id);
  const blockedEvidenceIds = SAJU_HELD_STAGING_REQUIRED_EVIDENCE_V1
    .filter(s => blocked.has(s.id)).map(s => s.id);
  const inventory = targetMatches && !invalidExtra
    && missingEvidenceIds.length === 0 && blockedEvidenceIds.length === 0
    ? 'INDEXED_UNVERIFIED' as const : 'BLOCKED' as const;
  return Object.freeze({
    version: SAJU_HELD_STAGING_EVIDENCE_INDEX_VERSION_V1,
    inventory,
    targetBinding: targetMatches ? 'DECLARED_MATCH_UNVERIFIED' as const : 'BLOCKED' as const,
    missingEvidenceIds: Object.freeze(missingEvidenceIds),
    blockedEvidenceIds: Object.freeze(blockedEvidenceIds),
    evidenceProvenance: 'NOT_VERIFIED' as const,
    operationalEvidence: 'NOT_VERIFIED' as const,
    rootAuthority: 'NOT_VERIFIED' as const,
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
