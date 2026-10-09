import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import {
  verifySajuHeldStagingAuthorityRegistryV1,
  findSajuHeldStagingRegistryKeyV1,
  type SajuStagingRegistryVerifyInputV1,
  type SajuStagingAuthorityKeyV1,
} from './saju-held-staging-authority-registry-v1.js';
import {
  parseSajuHeldStagingTargetEvidenceV1,
  canonicalSajuHeldStagingTargetEvidenceBytesV1,
  type SajuStagingTargetEvidenceV1,
  type SajuStagingDbObservationV1,
} from './saju-held-staging-target-evidence-v1.js';
import {
  assessSajuHeldStagingAdmissionSignatureV2,
  parseSajuHeldStagingAdmissionPermitV2,
} from './saju-held-staging-admission-signature-v2.js';
import {
  parseSajuHeldStagingTargetManifestV1,
  digestSajuHeldStagingTargetManifestV1,
} from './saju-held-staging-target-manifest-v1.js';
import {
  parseSajuHeldStagingConnectionPlanV1,
  digestSajuHeldStagingConnectionPlanV1,
  assessSajuHeldStagingConnectionPlanV1,
  type SajuHeldStagingDbConnectionBindingV1,
} from './saju-held-staging-connection-plan-v1.js';

export const SAJU_HELD_STAGING_TARGET_TRUST_VERSION_V1 =
  'myeongha-saju-staging-target-trust-v1' as const;
const HEX64 = /^[a-f0-9]{64}$/u;
const SIG = /^[A-Za-z0-9_-]{86}$/u;

export interface SajuHeldStagingTargetTrustInputV1 {
  readonly manifest: unknown;
  readonly reviewedManifest: unknown;
  readonly connectionPlan: unknown;
  readonly reviewedConnectionPlan: unknown;
  readonly permit: unknown;
  readonly permitSignature: unknown;
  readonly registry: unknown;
  readonly registrySignature: unknown;
  /** Supplied outside registry/evidence. No pin/provenance established here. */
  readonly suppliedRootPublicKey: unknown;
  readonly expectedRootKeyId: unknown;
  /** Must originate in separately maintained, rollback-resistant custody. */
  readonly minimumRegistryRevision: unknown;
  readonly evidence: unknown;
  readonly evidenceSignature: unknown;
  /** Must be one-time and generated independently of the evidence submitter. */
  readonly expectedChallengeDigest: unknown;
  readonly nowMs: unknown;
}
type Check = 'PASS' | 'BLOCKED';
export type SajuHeldStagingTargetTrustReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_TARGET_TRUST_VERSION_V1;
  contract: 'SIGNED_ASSERTIONS_UNANCHORED' | 'BLOCKED';
  checks: Readonly<{
    registry_signature: Check;
    operator_key_purpose_and_validity: Check;
    permit_v2_signature: Check;
    evidence_attestor_key: Check;
    evidence_signature: Check;
    challenge_and_freshness: Check;
    target_bindings: Check;
    attested_observation_claims: Check;
  }>;
  rootAuthority: 'NOT_VERIFIED';
  signerAuthority: 'NOT_VERIFIED';
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

function verifiedSignature(
  raw: unknown,
  key: SajuStagingAuthorityKeyV1,
  bytes: Uint8Array,
): boolean {
  if (typeof raw !== 'string' || !SIG.test(raw)) return false;
  try {
    const pub = createPublicKey({
      key: Buffer.from(key.publicKeySpkiBase64url, 'base64url'),
      format: 'der', type: 'spki',
    });
    if (pub.asymmetricKeyType !== 'ed25519') return false;
    const signature = Buffer.from(raw, 'base64url');
    return signature.length === 64 && signature.toString('base64url') === raw
      && verify(null, bytes, pub, signature);
  } catch { return false; }
}

function observationMatchesBinding(
  x: Readonly<SajuStagingDbObservationV1>,
  p: Readonly<SajuHeldStagingDbConnectionBindingV1>,
): boolean {
  return x.targetId === p.targetId
    && x.loginRole === p.loginRole
    && x.runtimeRole === p.runtimeRole
    && x.sessionUser === p.loginRole
    && x.currentUser === p.runtimeRole
    && x.tlsHostname === p.tlsHostname
    && x.caFingerprint256 === p.caFingerprint256
    && x.tlsPeerVerified === true
    && x.roleMembershipObserved === true
    && x.nonPrivilegedLoginObserved === true
    && x.rlsObserved === true
    && x.crossDomainDeniedObserved === true;
}

function claimedTargetsMatch(
  e: Readonly<SajuStagingTargetEvidenceV1>,
  manifest: ReturnType<typeof parseSajuHeldStagingTargetManifestV1>,
  plan: ReturnType<typeof parseSajuHeldStagingConnectionPlanV1>,
): boolean {
  const o = e.observations;
  return o.auth.projectRef === manifest.authProjectRef
    && o.auth.origin === manifest.authOrigin
    && o.auth.memberOnlyObserved === true
    && o.auth.productionSeparatedObserved === true
    && observationMatchesBinding(o.subjectDb,plan.subjectDb)
    && observationMatchesBinding(o.nonceDb,plan.nonceDb)
    && observationMatchesBinding(o.admissionDb,plan.admissionDb)
    // Do not confuse different DB identifiers with real physical isolation.
    // This is a SIGNED ASSERTION of distinct cluster identities, not a probe.
    && new Set([o.subjectDb.clusterIdentityDigest,
      o.nonceDb.clusterIdentityDigest,o.admissionDb.clusterIdentityDigest]).size === 3
    && o.proof.origin === manifest.proofServiceOrigin
    && o.proof.issuer === manifest.proofIssuer
    && o.proof.audience === manifest.proofAudience
    && o.proof.keyId === manifest.proofKeyId
    && o.proof.httpsPeerVerified === true
    && o.proof.bearerIsolatedObserved === true
    && o.proof.hmacIsolatedObserved === true
    && o.proof.productionSeparatedObserved === true;
}

/**
 * Zero-I/O, non-executable crypto and signed-assertion evaluation.
 * The caller can supply a self-owned root and synthetic observations.
 * Consequently even a full cryptographic match is NOT a trustworthy
 * independent infrastructure probe or an authority to execute.
 *
 * Do not adapt this result to Runner V1's boolean TargetAuthority port.
 */
export function assessSajuHeldStagingTargetTrustV1(
  input: SajuHeldStagingTargetTrustInputV1,
): SajuHeldStagingTargetTrustReportV1 {
  let registryOK = false, operatorOK = false, permitOK = false;
  let attestorOK = false, evidenceSignatureOK = false;
  let challengeOK = false, bindingOK = false, observationsOK = false;

  try {
    const nowMs = input?.nowMs;
    if (typeof nowMs !== 'number' || !Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new TypeError();
    }
    const registered = verifySajuHeldStagingAuthorityRegistryV1({
      registry: input.registry,
      detachedSignature: input.registrySignature,
      suppliedRootPublicKey: input.suppliedRootPublicKey,
      expectedRootKeyId: input.expectedRootKeyId,
      minimumRevision: input.minimumRegistryRevision,
      nowMs,
    } satisfies SajuStagingRegistryVerifyInputV1);
    registryOK = registered.signature === 'VALID_FOR_SUPPLIED_ROOT';
    if (!registryOK || registered.registry === null) throw new TypeError();

    const manifest = parseSajuHeldStagingTargetManifestV1(input.manifest);
    const plan = parseSajuHeldStagingConnectionPlanV1(input.connectionPlan);
    const permit = parseSajuHeldStagingAdmissionPermitV2(input.permit);
    const evidence = parseSajuHeldStagingTargetEvidenceV1(input.evidence);

    const mDigest = digestSajuHeldStagingTargetManifestV1(manifest);
    const pDigest = digestSajuHeldStagingConnectionPlanV1(plan);
    bindingOK = registered.registry.environmentId === manifest.environmentId
      && assessSajuHeldStagingConnectionPlanV1({
        plan, manifest, approvedNonSecretPlan: input.reviewedConnectionPlan,
      }).configuration === 'MATCHED_UNVERIFIED'
      && mDigest === digestSajuHeldStagingTargetManifestV1(input.reviewedManifest)
      && permit.environmentId === manifest.environmentId
      && permit.manifestDigest === mDigest && permit.connectionPlanDigest === pDigest
      && evidence.environmentId === manifest.environmentId
      && evidence.manifestDigest === mDigest && evidence.connectionPlanDigest === pDigest
      && evidence.myeonghaCommitSha === manifest.myeonghaCommitSha
      && evidence.sajuCommitSha === manifest.sajuCommitSha;
    if (!bindingOK) throw new TypeError();

    const operator = findSajuHeldStagingRegistryKeyV1(
      registered,permit.approvalSignatureKeyId,'OPERATOR_APPROVAL',manifest.environmentId,nowMs,
    );
    operatorOK = operator !== null && operator.principalId === permit.approvedOperatorId
      && operator.notBeforeMs <= permit.issuedAtMs
      && operator.notAfterMs >= permit.expiresAtMs;
    if (!operatorOK || operator === null) throw new TypeError();

    const operatorPub = createPublicKey({
      key: Buffer.from(operator.publicKeySpkiBase64url, 'base64url'),
      format: 'der', type: 'spki',
    }) as KeyObject;
    permitOK = assessSajuHeldStagingAdmissionSignatureV2({
      manifest, approvedManifest: input.reviewedManifest,
      connectionPlan: plan, approvedConnectionPlan: input.reviewedConnectionPlan,
      permit, approvalSignature: input.permitSignature,
      approvalPublicKey: operatorPub, expectedOperatorId: operator.principalId,
      expectedApprovalKeyId: operator.keyId, nowMs,
    }).contract === 'SIGNED_TARGET_MATCHED_UNVERIFIED_AUTHORITY';
    if (!permitOK) throw new TypeError();

    const attestor = findSajuHeldStagingRegistryKeyV1(
      registered,evidence.attestorKeyId,'TARGET_ATTESTATION',manifest.environmentId,nowMs,
    );
    attestorOK = attestor !== null && attestor.principalId === evidence.attestorId
      && attestor.keyId !== operator.keyId
      && attestor.notBeforeMs <= evidence.observedAtMs
      && attestor.notAfterMs >= evidence.expiresAtMs;
    if (!attestorOK || attestor === null) throw new TypeError();
    evidenceSignatureOK = verifiedSignature(
      input.evidenceSignature,attestor,canonicalSajuHeldStagingTargetEvidenceBytesV1(evidence),
    );
    if (!evidenceSignatureOK) throw new TypeError();

    challengeOK = typeof input.expectedChallengeDigest === 'string'
      && HEX64.test(input.expectedChallengeDigest)
      && input.expectedChallengeDigest === evidence.challengeDigest
      && evidence.observedAtMs <= nowMs && nowMs < evidence.expiresAtMs;
    if (!challengeOK) throw new TypeError();

    observationsOK = claimedTargetsMatch(evidence,manifest,plan);
  } catch { /* Strict fail-closed; never return caller data or errors. */ }

  const checks = Object.freeze({
    registry_signature: registryOK ? 'PASS' as const : 'BLOCKED' as const,
    operator_key_purpose_and_validity: operatorOK ? 'PASS' as const : 'BLOCKED' as const,
    permit_v2_signature: permitOK ? 'PASS' as const : 'BLOCKED' as const,
    evidence_attestor_key: attestorOK ? 'PASS' as const : 'BLOCKED' as const,
    evidence_signature: evidenceSignatureOK ? 'PASS' as const : 'BLOCKED' as const,
    challenge_and_freshness: challengeOK ? 'PASS' as const : 'BLOCKED' as const,
    target_bindings: bindingOK ? 'PASS' as const : 'BLOCKED' as const,
    attested_observation_claims: observationsOK ? 'PASS' as const : 'BLOCKED' as const,
  });
  return Object.freeze({
    version: SAJU_HELD_STAGING_TARGET_TRUST_VERSION_V1,
    contract: Object.values(checks).every(x=>x==='PASS')
      ? 'SIGNED_ASSERTIONS_UNANCHORED' as const : 'BLOCKED' as const,
    checks,
    rootAuthority: 'NOT_VERIFIED' as const,
    signerAuthority: 'NOT_VERIFIED' as const,
    operationalEvidence: 'NOT_VERIFIED' as const,
    stagingConnection: 'NOT_VERIFIED' as const,
    stagingAdmission: 'HOLD' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    releaseAuthorization: 'NOT_EVALUATED' as const,
    canRunOnce: false as const, canExecute: false as const,
    canPublish: false as const, canSell: false as const,
  });
}
