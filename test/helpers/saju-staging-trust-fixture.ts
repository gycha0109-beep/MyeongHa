import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { canonicalSajuHeldStagingAuthorityRegistryBytesV1 } from
  '../../apps/api/src/saju-held-staging-authority-registry-v1.js';
import { canonicalSajuHeldStagingTargetEvidenceBytesV1,
  digestSajuHeldStagingObservationsV1 } from
  '../../apps/api/src/saju-held-staging-target-evidence-v1.js';
import { canonicalSajuHeldStagingPermitApprovalBytesV2 } from
  '../../apps/api/src/saju-held-staging-admission-signature-v2.js';
import { digestSajuHeldStagingConnectionPlanV1 } from
  '../../apps/api/src/saju-held-staging-connection-plan-v1.js';
import { digestSajuHeldStagingTargetManifestV1 } from
  '../../apps/api/src/saju-held-staging-target-manifest-v1.js';

export const TRUST_TIME = 1_800_000_000_000;
const REF = 'abcdefghijklmnopqrst';
const root = generateKeyPairSync('ed25519');
const operator = generateKeyPairSync('ed25519');
const attestor = generateKeyPairSync('ed25519');
const spki = (k: KeyObject) => Buffer.from(k.export({format:'der',type:'spki'}))
  .toString('base64url');

export function stagingTrustFixture() {
  const manifest = {
    version: 'myeongha-saju-staging-target-v1',
    environmentId: 'myeongha-staging-trust-test',
    myeonghaCommitSha: 'a'.repeat(40), sajuCommitSha: 'b'.repeat(40),
    authProjectRef: REF, authOrigin: 'https://' + REF + '.supabase.co',
    subjectDbTargetId: 'stage-subject-db', nonceDbTargetId: 'stage-nonce-db',
    proofServiceOrigin: 'https://proof.staging.example.com',
    proofIssuer: 'saju-preview', proofAudience: 'myeongha-staging-api',
    proofKeyId: 'proof-key-v1', proofTtlMs: 60000,
  };
  const db = (targetId: string, loginRole: string, runtimeRole: string, hostname: string, pin: string) => ({
    targetId, loginRole, runtimeRole, tlsHostname: hostname,
    caFingerprint256: pin, tlsMode: 'verify-full',
  });
  const plan = {
    version: 'myeongha-saju-staging-connection-plan-v1',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha, authProjectRef: REF,
    authOrigin: manifest.authOrigin, proofServiceOrigin: manifest.proofServiceOrigin,
    proofIssuer: manifest.proofIssuer, proofAudience: manifest.proofAudience,
    proofKeyId: manifest.proofKeyId,
    subjectDb: db('stage-subject-db','staging_subject_login','myeongha_api_executor',
      'subject.staging.example.com', '1'.repeat(64)),
    nonceDb: db('stage-nonce-db','staging_nonce_login','myeongha_saju_proof_nonce_runtime',
      'nonce.staging.example.com', '2'.repeat(64)),
    admissionDb: db('stage-admission-db','staging_admission_login',
      'myeongha_saju_staging_admission_runtime','admission.staging.example.com','3'.repeat(64)),
  };
  const permit = {
    version: 'myeongha-saju-staging-admission-contract-v2',
    permitId: '123e4567-e89b-42d3-a456-426614174000',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    connectionPlanDigest: digestSajuHeldStagingConnectionPlanV1(plan),
    environmentId: manifest.environmentId, myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha, approvedOperatorId: 'operator-1',
    issuedAtMs: TRUST_TIME - 15_000, expiresAtMs: TRUST_TIME + 45_000,
    consumedAtMs: null, status: 'ISSUED', approvalSignatureKeyId: 'operator-key-v1',
  };
  const registry = {
    version: 'myeongha-saju-staging-authority-registry-v1',
    rootKeyId: 'governed-root-v1', revision: 10,
    environmentId: manifest.environmentId, issuedAtMs: TRUST_TIME - 100000,
    expiresAtMs: TRUST_TIME + 3600000,
    keys: [
      { keyId: 'attestor-key-v1', principalId: 'attestor-1', purpose: 'TARGET_ATTESTATION',
        publicKeySpkiBase64url: spki(attestor.publicKey),
        notBeforeMs: TRUST_TIME - 50000, notAfterMs: TRUST_TIME + 100000,
        revokedAtMs: null },
      { keyId: 'operator-key-v1', principalId: 'operator-1', purpose: 'OPERATOR_APPROVAL',
        publicKeySpkiBase64url: spki(operator.publicKey),
        notBeforeMs: TRUST_TIME - 50000, notAfterMs: TRUST_TIME + 100000,
        revokedAtMs: null },
    ],
  };
  const observedDb = (x: typeof plan.subjectDb, clusterIdentityDigest: string) => ({
    targetId:x.targetId,loginRole:x.loginRole,runtimeRole:x.runtimeRole,
    tlsHostname:x.tlsHostname,caFingerprint256:x.caFingerprint256,
    clusterIdentityDigest,sessionUser:x.loginRole,currentUser:x.runtimeRole,
    tlsPeerVerified:true,roleMembershipObserved:true,nonPrivilegedLoginObserved:true,
    rlsObserved:true,crossDomainDeniedObserved:true,
  });
  const observations = {
    auth: { projectRef:REF,origin:manifest.authOrigin,memberOnlyObserved:true,
      productionSeparatedObserved:true },
    subjectDb: observedDb(plan.subjectDb,'4'.repeat(64)),
    nonceDb: observedDb(plan.nonceDb,'5'.repeat(64)),
    admissionDb: observedDb(plan.admissionDb,'6'.repeat(64)),
    proof: { origin:manifest.proofServiceOrigin,issuer:manifest.proofIssuer,
      audience:manifest.proofAudience,keyId:manifest.proofKeyId,httpsPeerVerified:true,
      bearerIsolatedObserved:true,hmacIsolatedObserved:true,
      productionSeparatedObserved:true },
  };
  const evidence = {
    version: 'myeongha-saju-staging-target-evidence-v1',
    environmentId: manifest.environmentId,
    manifestDigest: permit.manifestDigest,
    connectionPlanDigest: permit.connectionPlanDigest,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha, attestorId:'attestor-1',
    attestorKeyId:'attestor-key-v1',
    challengeDigest: 'e'.repeat(64),
    observedAtMs: TRUST_TIME - 5000,
    expiresAtMs: TRUST_TIME + 20000,
    observationsDigest: digestSajuHeldStagingObservationsV1(observations),
    observations,
  };
  return {
    manifest, plan, permit, registry, evidence, rootPublicKey:root.publicKey,
    minimumRevision:10, expectedRootKeyId:'governed-root-v1',
    nowMs: TRUST_TIME, expectedChallengeDigest:evidence.challengeDigest,
    registrySignature: sign(null, canonicalSajuHeldStagingAuthorityRegistryBytesV1(registry),
      root.privateKey).toString('base64url'),
    permitSignature: sign(null, canonicalSajuHeldStagingPermitApprovalBytesV2(permit),
      operator.privateKey).toString('base64url'),
    evidenceSignature: sign(null, canonicalSajuHeldStagingTargetEvidenceBytesV1(evidence),
      attestor.privateKey).toString('base64url'),
    rootPrivateKey:root.privateKey, operatorPrivateKey:operator.privateKey,
    attestorPrivateKey:attestor.privateKey,
  };
}
