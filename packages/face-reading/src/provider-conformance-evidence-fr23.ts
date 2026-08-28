import {
  FACE_OBSERVATION_PROVIDER_CONTRACT_FR22,
  FACE_OBSERVATION_PROVIDER_IMPLEMENTATIONS_FR22,
  validateFaceObservationProviderImplementationFR22,
  type FaceObservationProviderImplementationAttestationFR22V1,
} from './face-observation-provider-contract-fr22.js';
import { FaceAuthorityValidationError } from './validation.js';

export const FR23_REQUIRED_PROVIDER_CONFORMANCE_CHECKS = Object.freeze([
  'contract_shape',
  'capability_coverage',
  'slot_geometry_shape',
  'slot_source_authority',
  'deterministic_replay',
  'provenance_binding',
  'privacy_non_persistence',
  'failure_fail_closed',
  'laterality_non_authority',
  'semantic_non_authority',
] as const);

export type FaceObservationProviderConformanceCheckIdFR23V1 =
  typeof FR23_REQUIRED_PROVIDER_CONFORMANCE_CHECKS[number];

export interface FaceObservationProviderConformanceCheckFR23V1 {
  readonly checkId: FaceObservationProviderConformanceCheckIdFR23V1;
  readonly result: 'pass' | 'fail';
  readonly assertionCount: number;
  readonly resultArtifactDigest: string;
}

export interface FaceObservationProviderConformanceEvidenceFR23V1 {
  readonly schemaVersion: 'fr23-evidence-v1';
  readonly evidenceRef: string;
  readonly evidenceVersion: '0.1.0';
  readonly authorityState: 'implementation_conformance_only';
  readonly implementationRef: string;
  readonly consumerContractRef: string;
  readonly providerContractVersion: string;
  readonly runtimeArtifactDigest: string;
  readonly adapterSourcePin: {
    readonly repository: string;
    readonly repositoryCommit: string;
    readonly sourcePath: string;
    readonly sourceBlobSha: string;
  };
  readonly fixtureCorpusDigest: string;
  readonly suiteRef: 'suite.face.observation_provider.fr23@0.1.0';
  readonly executionRef: string;
  readonly checks: readonly FaceObservationProviderConformanceCheckFR23V1[];
  readonly reviewState: 'candidate' | 'reviewed';
  readonly reviewerEvidenceRefs: readonly string[];
  readonly semanticAuthorityClaimed: false;
  readonly anatomicalLateralityClaimed: false;
}

export interface FaceObservationProviderConformanceReadinessFR23V1 {
  readonly contractRef: string;
  readonly implementationRef: string | null;
  readonly evidenceRef: string | null;
  readonly implementationConformanceReady: boolean;
  readonly providerActivationCandidate: boolean;
  readonly traditionalSemanticAuthorityGranted: false;
  readonly blockers: readonly string[];
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;
const STABLE_KEY = /^[a-z0-9][a-z0-9._:@/-]{0,255}$/u;

const EVIDENCE_KEYS = new Set([
  'schemaVersion', 'evidenceRef', 'evidenceVersion', 'authorityState', 'implementationRef',
  'consumerContractRef', 'providerContractVersion', 'runtimeArtifactDigest', 'adapterSourcePin',
  'fixtureCorpusDigest', 'suiteRef', 'executionRef', 'checks', 'reviewState', 'reviewerEvidenceRefs',
  'semanticAuthorityClaimed', 'anatomicalLateralityClaimed',
]);
const ADAPTER_SOURCE_KEYS = new Set(['repository', 'repositoryCommit', 'sourcePath', 'sourceBlobSha']);
const CHECK_KEYS = new Set(['checkId', 'result', 'assertionCount', 'resultArtifactDigest']);
const REQUIRED_CHECK_SET = new Set<FaceObservationProviderConformanceCheckIdFR23V1>(FR23_REQUIRED_PROVIDER_CONFORMANCE_CHECKS);

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function stableKey(value: string, path: string): void {
  nonEmpty(value, path);
  if (!STABLE_KEY.test(value)) throw new FaceAuthorityValidationError(`${path} must be a stable authority key.`);
}

function sha256(value: string, path: string): void {
  if (!SHA256.test(value)) throw new FaceAuthorityValidationError(`${path} must be sha256:<64 lowercase hex>.`);
}

function commitSha(value: string, path: string): void {
  if (!HEX40.test(value)) throw new FaceAuthorityValidationError(`${path} must be a 40-char lowercase git SHA.`);
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

function currentContractRef(): string {
  return `${FACE_OBSERVATION_PROVIDER_CONTRACT_FR22.contractId}@${FACE_OBSERVATION_PROVIDER_CONTRACT_FR22.contractVersion}`;
}

export const FACE_OBSERVATION_PROVIDER_CONFORMANCE_EVIDENCE_FR23:
readonly FaceObservationProviderConformanceEvidenceFR23V1[] = Object.freeze([]);

export function validateFaceObservationProviderConformanceEvidenceFR23(
  evidence: FaceObservationProviderConformanceEvidenceFR23V1,
  implementation: FaceObservationProviderImplementationAttestationFR22V1,
): FaceObservationProviderConformanceEvidenceFR23V1 {
  validateFaceObservationProviderImplementationFR22(implementation);
  exactKeys(evidence, EVIDENCE_KEYS, `FR-23 evidence ${evidence.evidenceRef}`);
  if (evidence.schemaVersion !== 'fr23-evidence-v1' || evidence.evidenceVersion !== '0.1.0') {
    throw new FaceAuthorityValidationError('FR-23 evidence schema/version mismatch.');
  }
  stableKey(evidence.evidenceRef, 'fr23.evidenceRef');
  if (evidence.authorityState !== 'implementation_conformance_only') {
    throw new FaceAuthorityValidationError('FR-23 evidence authorityState must remain implementation_conformance_only.');
  }
  if (evidence.implementationRef !== implementation.implementationRef) {
    throw new FaceAuthorityValidationError('FR-23 evidence implementationRef must match the implementation attestation.');
  }
  if (evidence.consumerContractRef !== currentContractRef() || evidence.consumerContractRef !== implementation.consumerContractRef) {
    throw new FaceAuthorityValidationError('FR-23 evidence must pin the exact FR-22 consumer contract.');
  }
  if (evidence.providerContractVersion !== implementation.providerContractVersion) {
    throw new FaceAuthorityValidationError('FR-23 evidence providerContractVersion must match the implementation attestation.');
  }
  sha256(evidence.runtimeArtifactDigest, 'fr23.runtimeArtifactDigest');
  if (implementation.runtimeArtifact.runtimeArtifactDigest === null ||
      evidence.runtimeArtifactDigest !== implementation.runtimeArtifact.runtimeArtifactDigest) {
    throw new FaceAuthorityValidationError('FR-23 evidence requires the exact independently recorded implementation runtime artifact digest.');
  }

  exactKeys(evidence.adapterSourcePin, ADAPTER_SOURCE_KEYS, 'FR-23 adapterSourcePin');
  nonEmpty(evidence.adapterSourcePin.repository, 'fr23.adapterSourcePin.repository');
  nonEmpty(evidence.adapterSourcePin.sourcePath, 'fr23.adapterSourcePin.sourcePath');
  commitSha(evidence.adapterSourcePin.repositoryCommit, 'fr23.adapterSourcePin.repositoryCommit');
  commitSha(evidence.adapterSourcePin.sourceBlobSha, 'fr23.adapterSourcePin.sourceBlobSha');
  if (evidence.adapterSourcePin.repository !== implementation.adapterSource.repository ||
      evidence.adapterSourcePin.repositoryCommit !== implementation.adapterSource.repositoryCommit ||
      evidence.adapterSourcePin.sourcePath !== implementation.adapterSource.sourcePath ||
      evidence.adapterSourcePin.sourceBlobSha !== implementation.adapterSource.sourceBlobSha) {
    throw new FaceAuthorityValidationError('FR-23 adapter source pin must exactly match the FR-22 implementation attestation.');
  }

  sha256(evidence.fixtureCorpusDigest, 'fr23.fixtureCorpusDigest');
  if (evidence.suiteRef !== 'suite.face.observation_provider.fr23@0.1.0') {
    throw new FaceAuthorityValidationError('FR-23 suiteRef mismatch.');
  }
  stableKey(evidence.executionRef, 'fr23.executionRef');

  unique(evidence.checks.map((check) => check.checkId), 'fr23.checkIds');
  if (evidence.checks.length !== FR23_REQUIRED_PROVIDER_CONFORMANCE_CHECKS.length) {
    throw new FaceAuthorityValidationError('FR-23 evidence must contain every required conformance check exactly once.');
  }
  for (const check of evidence.checks) {
    exactKeys(check, CHECK_KEYS, `FR-23 check ${check.checkId}`);
    if (!REQUIRED_CHECK_SET.has(check.checkId)) {
      throw new FaceAuthorityValidationError(`FR-23 unknown conformance check: ${String(check.checkId)}`);
    }
    if (check.result !== 'pass' && check.result !== 'fail') {
      throw new FaceAuthorityValidationError(`FR-23 invalid check result: ${String(check.result)}`);
    }
    if (!Number.isInteger(check.assertionCount) || check.assertionCount <= 0) {
      throw new FaceAuthorityValidationError(`FR-23 check assertionCount must be a positive integer: ${check.checkId}`);
    }
    sha256(check.resultArtifactDigest, `fr23.${check.checkId}.resultArtifactDigest`);
  }

  if (evidence.reviewState !== 'candidate' && evidence.reviewState !== 'reviewed') {
    throw new FaceAuthorityValidationError(`FR-23 invalid reviewState: ${String(evidence.reviewState)}`);
  }
  unique(evidence.reviewerEvidenceRefs, 'fr23.reviewerEvidenceRefs');
  if (evidence.reviewState === 'reviewed') {
    if (implementation.reviewState !== 'verified') {
      throw new FaceAuthorityValidationError('FR-23 reviewed evidence requires a verified FR-22 implementation attestation.');
    }
    if (evidence.checks.some((check) => check.result !== 'pass')) {
      throw new FaceAuthorityValidationError('FR-23 reviewed evidence requires every conformance check to pass.');
    }
    if (evidence.reviewerEvidenceRefs.length === 0) {
      throw new FaceAuthorityValidationError('FR-23 reviewed evidence requires reviewerEvidenceRefs.');
    }
  }
  if (evidence.semanticAuthorityClaimed !== false || evidence.anatomicalLateralityClaimed !== false) {
    throw new FaceAuthorityValidationError('FR-23 conformance evidence cannot claim traditional semantic or anatomical-side authority.');
  }
  return evidence;
}

export function assessFaceObservationProviderConformanceFR23(input?: {
  readonly implementation?: FaceObservationProviderImplementationAttestationFR22V1;
  readonly evidence?: FaceObservationProviderConformanceEvidenceFR23V1;
}): FaceObservationProviderConformanceReadinessFR23V1 {
  const implementation = input?.implementation;
  const evidence = input?.evidence;
  const blockers: string[] = [];

  if (implementation === undefined) {
    blockers.push('no FR-22 implementation attestation supplied');
  } else {
    validateFaceObservationProviderImplementationFR22(implementation);
    if (implementation.reviewState !== 'verified') {
      blockers.push(`FR-22 implementation reviewState=${implementation.reviewState}`);
    }
    if (!FACE_OBSERVATION_PROVIDER_IMPLEMENTATIONS_FR22.some((entry) => entry.implementationRef === implementation.implementationRef)) {
      blockers.push(`implementation is not registered in FR-22: ${implementation.implementationRef}`);
    }
  }

  if (evidence === undefined) {
    blockers.push('no FR-23 conformance evidence supplied');
  } else if (implementation === undefined) {
    blockers.push('FR-23 evidence cannot be evaluated without its FR-22 implementation attestation');
  } else {
    validateFaceObservationProviderConformanceEvidenceFR23(evidence, implementation);
    if (evidence.reviewState !== 'reviewed') blockers.push(`FR-23 evidence reviewState=${evidence.reviewState}`);
    const registered = FACE_OBSERVATION_PROVIDER_CONFORMANCE_EVIDENCE_FR23.find((entry) => entry.evidenceRef === evidence.evidenceRef);
    if (registered === undefined) {
      blockers.push(`conformance evidence is not registered in FR-23: ${evidence.evidenceRef}`);
    } else if (registered.implementationRef !== evidence.implementationRef ||
               registered.runtimeArtifactDigest !== evidence.runtimeArtifactDigest ||
               registered.fixtureCorpusDigest !== evidence.fixtureCorpusDigest ||
               registered.executionRef !== evidence.executionRef) {
      blockers.push(`FR-23 registered evidence identity mismatch: ${evidence.evidenceRef}`);
    }
  }

  if (FACE_OBSERVATION_PROVIDER_CONFORMANCE_EVIDENCE_FR23.length === 0) {
    blockers.push('FR-23 has zero registered conformance evidence records');
  }
  if (FACE_OBSERVATION_PROVIDER_CONTRACT_FR22.providerActivationAllowed !== false) {
    blockers.push('FR-22 contract activation flag is inconsistent with the FR-23 v0.1 authority snapshot');
  } else {
    blockers.push('FR-22 v0.1 still explicitly disables provider activation');
  }

  const implementationConformanceReady = blockers.length === 0;
  return Object.freeze({
    contractRef: currentContractRef(),
    implementationRef: implementation?.implementationRef ?? null,
    evidenceRef: evidence?.evidenceRef ?? null,
    implementationConformanceReady,
    providerActivationCandidate: FACE_OBSERVATION_PROVIDER_CONTRACT_FR22.providerActivationAllowed && implementationConformanceReady,
    traditionalSemanticAuthorityGranted: false,
    blockers: Object.freeze(blockers),
  });
}
