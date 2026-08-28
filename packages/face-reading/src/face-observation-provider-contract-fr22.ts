import { FACELAB_COMPATIBILITY_REPORT_V0 } from './facelab-compat.js';
import {
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  type NeutralAnchorConsumerSlotV1,
  type NeutralProviderCapabilityV1,
} from './neutral-provider-bindings-fr14.js';
import type { NeutralObservationGeometryV1 } from './neutral-observation-schema-fr15.js';
import { FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16 } from './provider-adapter-evidence-fr16.js';
import {
  NEUTRAL_DERIVATION_REGISTRY_FR17,
  isNeutralDerivationExecutableFR17,
} from './neutral-derivation-registry-fr17.js';
import { PROVIDER_RELEASE_ATTESTATION_FR18 } from './provider-release-attestation-fr18.js';
import { CAPTURE_ORIENTATION_AUTHORITY_FR19 } from './capture-orientation-authority-fr19.js';
import { LATERALITY_CONSUMPTION_POLICY_FR20 } from './laterality-consumption-policy-fr20.js';
import { FaceAuthorityValidationError } from './validation.js';

export type FaceObservationProviderSlotSourceModeFR22V1 =
  | 'direct_provider_topology'
  | 'reviewed_neutral_derivation'
  | 'unimplemented';

export interface FaceObservationProviderContractSlotFR22V1 {
  readonly consumerSlot: NeutralAnchorConsumerSlotV1;
  readonly outputGeometryKind: NeutralObservationGeometryV1['kind'];
  readonly requiredCapabilities: readonly NeutralProviderCapabilityV1[];
}

export interface FaceObservationProviderContractFR22V1 {
  readonly schemaVersion: 'fr22-v1';
  readonly contractId: 'contract.face.observation_provider.fr22';
  readonly contractVersion: '0.1.0';
  readonly authorityState: 'consumer_contract_only';
  readonly neutralObservationContractVersion: 'myeongha-neutral-observation-v1';
  readonly neutralAnchorConsumerContractVersion: string;
  readonly bindingProfileVersion: string;
  readonly derivationRegistryRef: string;
  readonly captureOrientationAuthorityVersion: string;
  readonly lateralityPolicyVersion: string;
  readonly requiredCapabilities: readonly NeutralProviderCapabilityV1[];
  readonly slots: readonly FaceObservationProviderContractSlotFR22V1[];
  readonly provenanceRequirements: {
    readonly canonicalAssetDigest: 'sha256';
    readonly adapterSourcePinRequired: true;
    readonly runtimeArtifactDigestRequiredForActivation: true;
    readonly providerRunRefRequired: true;
    readonly rawSourcePersisted: false;
    readonly rawProviderResponsePersisted: false;
    readonly biometricEmbeddingPersisted: false;
  };
  readonly authorityBoundary: {
    readonly traditionalSemanticOutputAllowed: false;
    readonly providerLandmarkIndexInNeutralOutputAllowed: false;
    readonly providerSideLabelToAnatomicalSideAllowed: false;
    readonly dynamicAppearanceAsStaticGeometryAllowed: false;
    readonly llmVisionSemanticAuthorityAllowed: false;
    readonly thirdPartySourceEquivalenceIsSemanticAuthority: false;
  };
  readonly implementationRegistryState: 'no_verified_implementation';
  readonly verifiedImplementationRefs: readonly [];
  readonly providerActivationAllowed: false;
  readonly prohibitedPromotions: readonly [
    'provider_output_to_traditional_semantic_authority',
    'provider_landmark_index_to_neutral_contract_output',
    'provider_side_label_to_anatomical_side',
    'consumer_lockfile_to_implementation_conformance',
    'implementation_conformance_to_traditional_semantic_authority',
    'unreviewed_derivation_to_provider_slot',
  ];
}

export interface FaceObservationProviderImplementationSlotFR22V1 {
  readonly consumerSlot: NeutralAnchorConsumerSlotV1;
  readonly outputGeometryKind: NeutralObservationGeometryV1['kind'];
  readonly sourceMode: FaceObservationProviderSlotSourceModeFR22V1;
  readonly sourceRef: string | null;
}

export interface FaceObservationProviderImplementationAttestationFR22V1 {
  readonly schemaVersion: 'fr22-implementation-v1';
  readonly implementationRef: string;
  readonly providerKey: 'visually_facelab';
  readonly consumerContractRef: string;
  readonly providerContractVersion: string;
  readonly adapterSource: {
    readonly repository: string;
    readonly repositoryCommit: string;
    readonly sourcePath: string;
    readonly sourceBlobSha: string;
  };
  readonly runtimeArtifact: {
    readonly packageName: '@mediapipe/tasks-vision';
    readonly packageVersion: '0.10.35';
    readonly artifactIdentityEvidenceRef: string;
    readonly runtimeArtifactDigest: string | null;
  };
  readonly supportedCapabilities: readonly NeutralProviderCapabilityV1[];
  readonly slots: readonly FaceObservationProviderImplementationSlotFR22V1[];
  readonly reviewState: 'candidate' | 'verified';
  readonly conformanceEvidenceRefs: readonly string[];
  readonly semanticAuthorityClaimed: false;
  readonly anatomicalLateralityClaimed: false;
}

export interface FaceObservationProviderActivationReadinessFR22V1 {
  readonly contractReady: true;
  readonly implementationReady: boolean;
  readonly providerActivationAllowed: boolean;
  readonly thirdPartySourceEquivalenceRequiredForSemanticAuthority: false;
  readonly blockers: readonly string[];
}

const HEX40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;

const GEOMETRY_BY_SLOT: Readonly<Record<NeutralAnchorConsumerSlotV1, NeutralObservationGeometryV1['kind']>> = Object.freeze({
  'neutral.face.brow_midline': 'point',
  'neutral.face.nose_region': 'region',
  'neutral.face.left_brow_region': 'curve',
  'neutral.face.right_brow_region': 'curve',
  'neutral.face.left_eye_region': 'region',
  'neutral.face.right_eye_region': 'region',
});

const REQUIRED_CAPABILITIES: readonly NeutralProviderCapabilityV1[] = Object.freeze([
  'neutral_pose_quality',
  'neutral_brow_regions',
  'neutral_brow_midline_derivation',
  'neutral_eye_regions',
  'neutral_nose_region',
]);

const CONTRACT_KEYS = new Set([
  'schemaVersion', 'contractId', 'contractVersion', 'authorityState', 'neutralObservationContractVersion',
  'neutralAnchorConsumerContractVersion', 'bindingProfileVersion', 'derivationRegistryRef',
  'captureOrientationAuthorityVersion', 'lateralityPolicyVersion', 'requiredCapabilities', 'slots',
  'provenanceRequirements', 'authorityBoundary', 'implementationRegistryState', 'verifiedImplementationRefs',
  'providerActivationAllowed', 'prohibitedPromotions',
]);
const CONTRACT_SLOT_KEYS = new Set(['consumerSlot', 'outputGeometryKind', 'requiredCapabilities']);
const PROVENANCE_KEYS = new Set([
  'canonicalAssetDigest', 'adapterSourcePinRequired', 'runtimeArtifactDigestRequiredForActivation',
  'providerRunRefRequired', 'rawSourcePersisted', 'rawProviderResponsePersisted', 'biometricEmbeddingPersisted',
]);
const AUTHORITY_BOUNDARY_KEYS = new Set([
  'traditionalSemanticOutputAllowed', 'providerLandmarkIndexInNeutralOutputAllowed',
  'providerSideLabelToAnatomicalSideAllowed', 'dynamicAppearanceAsStaticGeometryAllowed',
  'llmVisionSemanticAuthorityAllowed', 'thirdPartySourceEquivalenceIsSemanticAuthority',
]);
const IMPLEMENTATION_KEYS = new Set([
  'schemaVersion', 'implementationRef', 'providerKey', 'consumerContractRef', 'providerContractVersion',
  'adapterSource', 'runtimeArtifact', 'supportedCapabilities', 'slots', 'reviewState', 'conformanceEvidenceRefs',
  'semanticAuthorityClaimed', 'anatomicalLateralityClaimed',
]);
const ADAPTER_SOURCE_KEYS = new Set(['repository', 'repositoryCommit', 'sourcePath', 'sourceBlobSha']);
const RUNTIME_ARTIFACT_KEYS = new Set([
  'packageName', 'packageVersion', 'artifactIdentityEvidenceRef', 'runtimeArtifactDigest',
]);
const IMPLEMENTATION_SLOT_KEYS = new Set(['consumerSlot', 'outputGeometryKind', 'sourceMode', 'sourceRef']);

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

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  return [...actual].sort().join('|') === [...expected].sort().join('|');
}

function contractRef(contract: FaceObservationProviderContractFR22V1): string {
  return `${contract.contractId}@${contract.contractVersion}`;
}

function requiredSlots(): readonly FaceObservationProviderContractSlotFR22V1[] {
  return Object.freeze(FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((binding) => Object.freeze({
    consumerSlot: binding.consumerSlot,
    outputGeometryKind: GEOMETRY_BY_SLOT[binding.consumerSlot],
    requiredCapabilities: Object.freeze([...binding.requiredCapabilities]),
  })));
}

export const FACE_OBSERVATION_PROVIDER_CONTRACT_FR22: FaceObservationProviderContractFR22V1 = Object.freeze({
  schemaVersion: 'fr22-v1',
  contractId: 'contract.face.observation_provider.fr22',
  contractVersion: '0.1.0',
  authorityState: 'consumer_contract_only',
  neutralObservationContractVersion: 'myeongha-neutral-observation-v1',
  neutralAnchorConsumerContractVersion: FACELAB_NEUTRAL_BINDING_PROFILE_FR14.consumerContractVersion,
  bindingProfileVersion: FACELAB_NEUTRAL_BINDING_PROFILE_FR14.profileVersion,
  derivationRegistryRef: `${NEUTRAL_DERIVATION_REGISTRY_FR17.registryId}@${NEUTRAL_DERIVATION_REGISTRY_FR17.version}`,
  captureOrientationAuthorityVersion: CAPTURE_ORIENTATION_AUTHORITY_FR19.authorityVersion,
  lateralityPolicyVersion: LATERALITY_CONSUMPTION_POLICY_FR20.policyVersion,
  requiredCapabilities: REQUIRED_CAPABILITIES,
  slots: requiredSlots(),
  provenanceRequirements: Object.freeze({
    canonicalAssetDigest: 'sha256',
    adapterSourcePinRequired: true,
    runtimeArtifactDigestRequiredForActivation: true,
    providerRunRefRequired: true,
    rawSourcePersisted: false,
    rawProviderResponsePersisted: false,
    biometricEmbeddingPersisted: false,
  }),
  authorityBoundary: Object.freeze({
    traditionalSemanticOutputAllowed: false,
    providerLandmarkIndexInNeutralOutputAllowed: false,
    providerSideLabelToAnatomicalSideAllowed: false,
    dynamicAppearanceAsStaticGeometryAllowed: false,
    llmVisionSemanticAuthorityAllowed: false,
    thirdPartySourceEquivalenceIsSemanticAuthority: false,
  }),
  implementationRegistryState: 'no_verified_implementation',
  verifiedImplementationRefs: Object.freeze([]) as readonly [],
  providerActivationAllowed: false,
  prohibitedPromotions: Object.freeze([
    'provider_output_to_traditional_semantic_authority',
    'provider_landmark_index_to_neutral_contract_output',
    'provider_side_label_to_anatomical_side',
    'consumer_lockfile_to_implementation_conformance',
    'implementation_conformance_to_traditional_semantic_authority',
    'unreviewed_derivation_to_provider_slot',
  ] as const),
});

export const FACE_OBSERVATION_PROVIDER_IMPLEMENTATIONS_FR22: readonly FaceObservationProviderImplementationAttestationFR22V1[] = Object.freeze([]);

export function validateFaceObservationProviderContractFR22(
  contract: FaceObservationProviderContractFR22V1 = FACE_OBSERVATION_PROVIDER_CONTRACT_FR22,
): FaceObservationProviderContractFR22V1 {
  exactKeys(contract, CONTRACT_KEYS, 'FR-22 contract');
  if (contract.schemaVersion !== 'fr22-v1') throw new FaceAuthorityValidationError('FR-22 schemaVersion must be fr22-v1.');
  if (contract.contractId !== 'contract.face.observation_provider.fr22' || contract.contractVersion !== '0.1.0') {
    throw new FaceAuthorityValidationError('FR-22 contract identity/version mismatch.');
  }
  if (contract.authorityState !== 'consumer_contract_only') {
    throw new FaceAuthorityValidationError('FR-22 authorityState must remain consumer_contract_only.');
  }
  if (contract.neutralObservationContractVersion !== 'myeongha-neutral-observation-v1') {
    throw new FaceAuthorityValidationError('FR-22 must pin the FR-15 neutral observation contract.');
  }
  if (contract.neutralAnchorConsumerContractVersion !== FACELAB_NEUTRAL_BINDING_PROFILE_FR14.consumerContractVersion ||
      contract.bindingProfileVersion !== FACELAB_NEUTRAL_BINDING_PROFILE_FR14.profileVersion) {
    throw new FaceAuthorityValidationError('FR-22 must pin the exact FR-14 neutral consumer/binding contract.');
  }
  if (contract.derivationRegistryRef !== `${NEUTRAL_DERIVATION_REGISTRY_FR17.registryId}@${NEUTRAL_DERIVATION_REGISTRY_FR17.version}`) {
    throw new FaceAuthorityValidationError('FR-22 must pin the exact FR-17 derivation registry.');
  }
  if (contract.captureOrientationAuthorityVersion !== CAPTURE_ORIENTATION_AUTHORITY_FR19.authorityVersion ||
      contract.lateralityPolicyVersion !== LATERALITY_CONSUMPTION_POLICY_FR20.policyVersion) {
    throw new FaceAuthorityValidationError('FR-22 must pin the merged FR-19/FR-20 coordinate/laterality authorities.');
  }
  if (!sameSet(contract.requiredCapabilities, REQUIRED_CAPABILITIES)) {
    throw new FaceAuthorityValidationError('FR-22 required capability set must exactly match the neutral consumer contract.');
  }
  unique(contract.slots.map((slot) => slot.consumerSlot), 'fr22.contract.slots');
  const expectedSlots = FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((binding) => binding.consumerSlot);
  if (!sameSet(contract.slots.map((slot) => slot.consumerSlot), expectedSlots)) {
    throw new FaceAuthorityValidationError('FR-22 contract must cover every FR-14 neutral consumer slot exactly once.');
  }
  const bindingBySlot = new Map(FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((binding) => [binding.consumerSlot, binding] as const));
  for (const slot of contract.slots) {
    exactKeys(slot, CONTRACT_SLOT_KEYS, `FR-22 contract slot ${slot.consumerSlot}`);
    if (slot.outputGeometryKind !== GEOMETRY_BY_SLOT[slot.consumerSlot]) {
      throw new FaceAuthorityValidationError(`FR-22 geometry kind mismatch: ${slot.consumerSlot}`);
    }
    const binding = bindingBySlot.get(slot.consumerSlot)!;
    if (!sameSet(slot.requiredCapabilities, binding.requiredCapabilities)) {
      throw new FaceAuthorityValidationError(`FR-22 slot capabilities must match FR-14: ${slot.consumerSlot}`);
    }
  }

  exactKeys(contract.provenanceRequirements, PROVENANCE_KEYS, 'FR-22 provenanceRequirements');
  const provenance = contract.provenanceRequirements;
  if (provenance.canonicalAssetDigest !== 'sha256' || provenance.adapterSourcePinRequired !== true ||
      provenance.runtimeArtifactDigestRequiredForActivation !== true || provenance.providerRunRefRequired !== true ||
      provenance.rawSourcePersisted !== false || provenance.rawProviderResponsePersisted !== false ||
      provenance.biometricEmbeddingPersisted !== false) {
    throw new FaceAuthorityValidationError('FR-22 provenance requirements must remain fail-closed and content-addressed.');
  }

  exactKeys(contract.authorityBoundary, AUTHORITY_BOUNDARY_KEYS, 'FR-22 authorityBoundary');
  if (Object.values(contract.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-22 authority boundary must not grant semantic/provider-side shortcut authority.');
  }
  if (contract.implementationRegistryState !== 'no_verified_implementation' ||
      contract.verifiedImplementationRefs.length !== 0 || contract.providerActivationAllowed !== false) {
    throw new FaceAuthorityValidationError('FR-22 v0.1 must remain unactivated with zero verified provider implementations.');
  }
  if (contract.prohibitedPromotions.length !== 6) {
    throw new FaceAuthorityValidationError('FR-22 prohibited promotion set is incomplete.');
  }
  return contract;
}

export function validateFaceObservationProviderImplementationFR22(
  implementation: FaceObservationProviderImplementationAttestationFR22V1,
  contract: FaceObservationProviderContractFR22V1 = FACE_OBSERVATION_PROVIDER_CONTRACT_FR22,
): FaceObservationProviderImplementationAttestationFR22V1 {
  validateFaceObservationProviderContractFR22(contract);
  exactKeys(implementation, IMPLEMENTATION_KEYS, `FR-22 implementation ${implementation.implementationRef}`);
  if (implementation.schemaVersion !== 'fr22-implementation-v1') {
    throw new FaceAuthorityValidationError('FR-22 implementation schemaVersion must be fr22-implementation-v1.');
  }
  stableKey(implementation.implementationRef, 'fr22.implementationRef');
  if (implementation.providerKey !== 'visually_facelab') throw new FaceAuthorityValidationError('FR-22 implementation providerKey mismatch.');
  if (implementation.consumerContractRef !== contractRef(contract)) {
    throw new FaceAuthorityValidationError('FR-22 implementation must pin the exact MyeongHa consumer contract version.');
  }
  nonEmpty(implementation.providerContractVersion, `fr22.${implementation.implementationRef}.providerContractVersion`);

  exactKeys(implementation.adapterSource, ADAPTER_SOURCE_KEYS, `FR-22 implementation ${implementation.implementationRef}.adapterSource`);
  nonEmpty(implementation.adapterSource.repository, `fr22.${implementation.implementationRef}.adapterSource.repository`);
  commitSha(implementation.adapterSource.repositoryCommit, `fr22.${implementation.implementationRef}.adapterSource.repositoryCommit`);
  nonEmpty(implementation.adapterSource.sourcePath, `fr22.${implementation.implementationRef}.adapterSource.sourcePath`);
  commitSha(implementation.adapterSource.sourceBlobSha, `fr22.${implementation.implementationRef}.adapterSource.sourceBlobSha`);

  exactKeys(implementation.runtimeArtifact, RUNTIME_ARTIFACT_KEYS, `FR-22 implementation ${implementation.implementationRef}.runtimeArtifact`);
  if (implementation.runtimeArtifact.packageName !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.packageName ||
      implementation.runtimeArtifact.packageVersion !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.packageVersion ||
      implementation.runtimeArtifact.artifactIdentityEvidenceRef !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.evidenceRef) {
    throw new FaceAuthorityValidationError('FR-22 runtime artifact must pin the exact FR-18 consumer artifact identity evidence.');
  }
  if (implementation.runtimeArtifact.runtimeArtifactDigest !== null && !SHA256.test(implementation.runtimeArtifact.runtimeArtifactDigest)) {
    throw new FaceAuthorityValidationError('FR-22 runtimeArtifactDigest must be sha256:<64 lowercase hex> or null.');
  }

  unique(implementation.supportedCapabilities, `fr22.${implementation.implementationRef}.supportedCapabilities`);
  const allowedCapabilities = new Set(contract.requiredCapabilities);
  for (const capability of implementation.supportedCapabilities) {
    if (!allowedCapabilities.has(capability)) {
      throw new FaceAuthorityValidationError(`FR-22 implementation declares unknown capability: ${String(capability)}`);
    }
  }

  unique(implementation.slots.map((slot) => slot.consumerSlot), `fr22.${implementation.implementationRef}.slots`);
  if (!sameSet(implementation.slots.map((slot) => slot.consumerSlot), contract.slots.map((slot) => slot.consumerSlot))) {
    throw new FaceAuthorityValidationError('FR-22 implementation must declare every consumer slot exactly once, including unimplemented slots.');
  }
  const contractSlotByRef = new Map(contract.slots.map((slot) => [slot.consumerSlot, slot] as const));
  const fr16BySlot = new Map(FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence.map((slot) => [slot.consumerSlot, slot] as const));
  const fr17BySlot = new Map(NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => [entry.consumerSlot, entry] as const));

  for (const slot of implementation.slots) {
    exactKeys(slot, IMPLEMENTATION_SLOT_KEYS, `FR-22 implementation slot ${slot.consumerSlot}`);
    const contractSlot = contractSlotByRef.get(slot.consumerSlot)!;
    if (slot.outputGeometryKind !== contractSlot.outputGeometryKind) {
      throw new FaceAuthorityValidationError(`FR-22 implementation geometry kind mismatch: ${slot.consumerSlot}`);
    }
    if (slot.sourceMode === 'unimplemented') {
      if (slot.sourceRef !== null) throw new FaceAuthorityValidationError(`FR-22 unimplemented slot cannot carry sourceRef: ${slot.consumerSlot}`);
      continue;
    }
    for (const capability of contractSlot.requiredCapabilities) {
      if (!implementation.supportedCapabilities.includes(capability)) {
        throw new FaceAuthorityValidationError(`FR-22 implemented slot is missing required capability ${capability}: ${slot.consumerSlot}`);
      }
    }
    if (slot.sourceRef === null) throw new FaceAuthorityValidationError(`FR-22 implemented slot requires sourceRef: ${slot.consumerSlot}`);
    nonEmpty(slot.sourceRef, `fr22.${implementation.implementationRef}.${slot.consumerSlot}.sourceRef`);

    if (slot.sourceMode === 'direct_provider_topology') {
      const evidence = fr16BySlot.get(slot.consumerSlot);
      if (evidence === undefined || evidence.mappingState !== 'research_candidate_closed_cycle' ||
          evidence.providerTopologySymbol !== slot.sourceRef) {
        throw new FaceAuthorityValidationError(`FR-22 direct provider topology is not an FR-16 closed-cycle candidate: ${slot.consumerSlot}`);
      }
      if (implementation.reviewState === 'verified') {
        throw new FaceAuthorityValidationError(`FR-22 verified implementation cannot promote FR-16 research-only direct topology: ${slot.consumerSlot}`);
      }
    } else if (slot.sourceMode === 'reviewed_neutral_derivation') {
      const derivation = fr17BySlot.get(slot.consumerSlot);
      if (derivation === undefined || derivation.derivationId !== slot.sourceRef) {
        throw new FaceAuthorityValidationError(`FR-22 derivation sourceRef does not match the FR-17 slot registry: ${slot.consumerSlot}`);
      }
      if (implementation.reviewState === 'verified' && !isNeutralDerivationExecutableFR17(derivation)) {
        throw new FaceAuthorityValidationError(`FR-22 verified implementation requires an executable FR-17 derivation: ${slot.sourceRef}`);
      }
    } else {
      throw new FaceAuthorityValidationError(`FR-22 implementation has unknown sourceMode: ${String(slot.sourceMode)}`);
    }
  }

  if (implementation.reviewState !== 'candidate' && implementation.reviewState !== 'verified') {
    throw new FaceAuthorityValidationError(`FR-22 implementation has unknown reviewState: ${String(implementation.reviewState)}`);
  }
  unique(implementation.conformanceEvidenceRefs, `fr22.${implementation.implementationRef}.conformanceEvidenceRefs`);
  if (implementation.reviewState === 'verified') {
    if (implementation.runtimeArtifact.runtimeArtifactDigest === null) {
      throw new FaceAuthorityValidationError('FR-22 verified implementation requires an independently recorded runtime artifact digest.');
    }
    if (implementation.conformanceEvidenceRefs.length === 0) {
      throw new FaceAuthorityValidationError('FR-22 verified implementation requires conformanceEvidenceRefs.');
    }
    if (implementation.slots.some((slot) => slot.sourceMode === 'unimplemented')) {
      throw new FaceAuthorityValidationError('FR-22 verified implementation cannot leave required neutral slots unimplemented.');
    }
    if (!sameSet(implementation.supportedCapabilities, contract.requiredCapabilities)) {
      throw new FaceAuthorityValidationError('FR-22 verified implementation must declare the complete required capability set.');
    }
  }
  if (implementation.semanticAuthorityClaimed !== false || implementation.anatomicalLateralityClaimed !== false) {
    throw new FaceAuthorityValidationError('FR-22 implementation cannot claim traditional semantic or anatomical-side authority.');
  }
  return implementation;
}

export function assessFaceObservationProviderActivationFR22(input?: {
  readonly implementation?: FaceObservationProviderImplementationAttestationFR22V1;
  readonly contract?: FaceObservationProviderContractFR22V1;
}): FaceObservationProviderActivationReadinessFR22V1 {
  const contract = input?.contract ?? FACE_OBSERVATION_PROVIDER_CONTRACT_FR22;
  validateFaceObservationProviderContractFR22(contract);
  const implementation = input?.implementation;
  const blockers: string[] = [];

  if (implementation === undefined) {
    blockers.push('no FR-22 provider implementation attestation is registered');
  } else {
    validateFaceObservationProviderImplementationFR22(implementation, contract);
    if (implementation.reviewState !== 'verified') blockers.push(`implementation reviewState=${implementation.reviewState}`);
    if (implementation.runtimeArtifact.runtimeArtifactDigest === null) {
      blockers.push('runtime artifact digest has not been independently recorded');
    }
    if (!FACE_OBSERVATION_PROVIDER_IMPLEMENTATIONS_FR22.some((entry) => entry.implementationRef === implementation.implementationRef)) {
      blockers.push(`implementation is not registered in the FR-22 verified implementation registry: ${implementation.implementationRef}`);
    }
    if (FACELAB_COMPATIBILITY_REPORT_V0.state !== 'production_neutral_contract_available') {
      blockers.push(`FaceLab compatibility state=${FACELAB_COMPATIBILITY_REPORT_V0.state}`);
    }
    if (FACELAB_NEUTRAL_BINDING_PROFILE_FR14.providerContractVersion === null) {
      blockers.push('FR-14 provider-side neutral contract version is not pinned');
    } else if (FACELAB_NEUTRAL_BINDING_PROFILE_FR14.providerContractVersion !== implementation.providerContractVersion) {
      blockers.push('FR-14 provider-side neutral contract version does not match implementation attestation');
    }

    for (const slot of implementation.slots) {
      if (slot.sourceMode === 'unimplemented') {
        blockers.push(`neutral slot is unimplemented: ${slot.consumerSlot}`);
      } else if (slot.sourceMode === 'direct_provider_topology') {
        blockers.push(`FR-16 direct topology mapping remains research-only: ${slot.consumerSlot}`);
      } else {
        const derivation = NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.find((entry) => entry.derivationId === slot.sourceRef);
        if (derivation === undefined || !isNeutralDerivationExecutableFR17(derivation)) {
          blockers.push(`FR-17 derivation is not executable: ${slot.sourceRef ?? slot.consumerSlot}`);
        }
      }
    }
  }

  if (contract.implementationRegistryState !== 'no_verified_implementation' || contract.verifiedImplementationRefs.length !== 0) {
    blockers.push('FR-22 v0.1 implementation registry snapshot is inconsistent');
  } else {
    blockers.push('FR-22 v0.1 has no verified implementation registered');
  }
  if (contract.providerActivationAllowed !== false) {
    blockers.push('FR-22 contract activation flag is invalid');
  } else {
    blockers.push('FR-22 v0.1 contract explicitly keeps provider activation disabled');
  }

  const implementationReady = blockers.length === 0;
  return Object.freeze({
    contractReady: true,
    implementationReady,
    providerActivationAllowed: contract.providerActivationAllowed && implementationReady,
    thirdPartySourceEquivalenceRequiredForSemanticAuthority: false,
    blockers: Object.freeze(blockers),
  });
}
