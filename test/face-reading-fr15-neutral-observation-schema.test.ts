import { describe, expect, it } from 'vitest';
import {
  FACELAB_COMPATIBILITY_REPORT_V0,
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  assertIssuedNeutralObservationArtifactFR15,
  assessNeutralObservationBundleReadinessFR15,
  issueNeutralObservationArtifactFR15,
  validateNeutralObservationBundleFR15,
  type FaceLabCompatibilityReport,
  type IssuedNeutralObservationArtifactV1,
  type NeutralObservationBundleV1,
  type NeutralObservationItemV1,
  type NeutralProviderBindingProfileV1,
  type NeutralProviderCapabilityV1,
} from '../packages/face-reading/src/index.js';

const CAPABILITIES: readonly NeutralProviderCapabilityV1[] = [
  'neutral_pose_quality',
  'neutral_brow_regions',
  'neutral_brow_midline_derivation',
  'neutral_eye_regions',
  'neutral_nose_region',
];

const candidateProfile: NeutralProviderBindingProfileV1 = {
  ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  providerContractVersion: 'facelab-neutral-v1',
  activationState: 'candidate',
};

const productionCompatibility: FaceLabCompatibilityReport = {
  ...FACELAB_COMPATIBILITY_REPORT_V0,
  state: 'production_neutral_contract_available',
  missingProductionCapabilities: [],
};

function fixtureBundle(): NeutralObservationBundleV1 {
  return {
    schemaVersion: 'v1',
    contractVersion: 'myeongha-neutral-observation-v1',
    bindingProfileVersion: candidateProfile.profileVersion,
    providerKey: 'visually_facelab',
    providerContractVersion: 'facelab-neutral-v1',
    coordinateFrame: 'canonical_image_normalized_2d',
    pose: { yawDegrees: 1.2, pitchDegrees: -0.8, rollDegrees: 0.4, qualityState: 'usable', reasons: [] },
    availableCapabilities: CAPABILITIES,
    observations: [
      {
        observationRef: 'obs.brow_midline',
        anchorRef: 'brow_midline',
        consumerSlot: 'neutral.face.brow_midline',
        availability: 'observed',
        geometry: { kind: 'point', point: { x: 0.5, y: 0.31 } },
        quality: { visibility: 'clear', confidence: 0.98, reasons: [] },
        producedByCapabilities: ['neutral_pose_quality', 'neutral_brow_regions', 'neutral_brow_midline_derivation'],
        derivedFromObservationRefs: ['obs.left_brow', 'obs.right_brow'],
      },
      {
        observationRef: 'obs.nose',
        anchorRef: 'nose',
        consumerSlot: 'neutral.face.nose_region',
        availability: 'observed',
        geometry: { kind: 'region', boundary: [{ x: 0.44, y: 0.38 }, { x: 0.56, y: 0.38 }, { x: 0.58, y: 0.66 }, { x: 0.42, y: 0.66 }] },
        quality: { visibility: 'clear', confidence: 0.97, reasons: [] },
        producedByCapabilities: ['neutral_pose_quality', 'neutral_nose_region'],
      },
      {
        observationRef: 'obs.left_brow',
        anchorRef: 'left_brow',
        consumerSlot: 'neutral.face.left_brow_region',
        availability: 'observed',
        geometry: { kind: 'curve', points: [{ x: 0.21, y: 0.31 }, { x: 0.29, y: 0.28 }, { x: 0.39, y: 0.31 }] },
        quality: { visibility: 'clear', confidence: 0.95, reasons: [] },
        producedByCapabilities: ['neutral_pose_quality', 'neutral_brow_regions'],
      },
      {
        observationRef: 'obs.right_brow',
        anchorRef: 'right_brow',
        consumerSlot: 'neutral.face.right_brow_region',
        availability: 'observed',
        geometry: { kind: 'curve', points: [{ x: 0.61, y: 0.31 }, { x: 0.71, y: 0.28 }, { x: 0.79, y: 0.31 }] },
        quality: { visibility: 'clear', confidence: 0.95, reasons: [] },
        producedByCapabilities: ['neutral_pose_quality', 'neutral_brow_regions'],
      },
      {
        observationRef: 'obs.left_eye',
        anchorRef: 'left_eye',
        consumerSlot: 'neutral.face.left_eye_region',
        availability: 'observed',
        geometry: { kind: 'region', boundary: [{ x: 0.22, y: 0.36 }, { x: 0.39, y: 0.35 }, { x: 0.38, y: 0.42 }, { x: 0.23, y: 0.42 }] },
        quality: { visibility: 'clear', confidence: 0.96, reasons: [] },
        producedByCapabilities: ['neutral_pose_quality', 'neutral_eye_regions'],
      },
      {
        observationRef: 'obs.right_eye',
        anchorRef: 'right_eye',
        consumerSlot: 'neutral.face.right_eye_region',
        availability: 'observed',
        geometry: { kind: 'region', boundary: [{ x: 0.61, y: 0.35 }, { x: 0.78, y: 0.36 }, { x: 0.77, y: 0.42 }, { x: 0.62, y: 0.42 }] },
        quality: { visibility: 'clear', confidence: 0.96, reasons: [] },
        producedByCapabilities: ['neutral_pose_quality', 'neutral_eye_regions'],
      },
    ],
    provenance: {
      providerKey: 'visually_facelab',
      providerContractVersion: 'facelab-neutral-v1',
      adapterVersion: 'myeongha-facelab-adapter-v1',
      providerModelRef: 'provider-model:fixture-v1',
      providerRunRef: 'provider-run:fixture-001',
      canonicalAssetDigest: `sha256:${'a'.repeat(64)}`,
      evidenceRefs: ['evidence:fixture-001'],
      rawSourcePersisted: false,
      rawProviderResponsePersisted: false,
      biometricEmbeddingPersisted: false,
    },
  };
}

function unavailable(entry: NeutralObservationItemV1): NeutralObservationItemV1 {
  return {
    observationRef: entry.observationRef,
    anchorRef: entry.anchorRef,
    consumerSlot: entry.consumerSlot,
    availability: 'unavailable',
    quality: { visibility: 'not_visible', confidence: null, reasons: ['occluded'] },
    producedByCapabilities: entry.producedByCapabilities,
    ...(entry.derivedFromObservationRefs === undefined ? {} : { derivedFromObservationRefs: entry.derivedFromObservationRefs }),
  };
}

describe('FR-15 neutral observation schema', () => {
  it('validates point, curve, and region geometry under a future neutral provider contract', () => {
    const bundle = fixtureBundle();
    expect(validateNeutralObservationBundleFR15(bundle, candidateProfile)).toBe(bundle);
    expect(new Set(bundle.observations.map((entry) => entry.geometry?.kind))).toEqual(new Set(['point', 'curve', 'region']));
  });

  it('keeps the current real Visually profile unable to admit an FR-15 bundle', () => {
    expect(() => validateNeutralObservationBundleFR15(fixtureBundle())).toThrow(/providerContractVersion/u);
  });

  it('opens only neutral ingestion under an explicitly production-neutral compatible provider', () => {
    const readiness = assessNeutralObservationBundleReadinessFR15({ bundle: fixtureBundle(), profile: candidateProfile, compatibilityReport: productionCompatibility });
    expect(readiness.state).toBe('usable');
    expect(readiness.neutralIngestionReady).toBe(true);
    expect(readiness.semanticPromotionState).toBe('blocked_traditional_operationalization_required');
  });

  it('accepts explicit unavailable observations without treating absence as negative evidence', () => {
    const base = fixtureBundle();
    const limited: NeutralObservationBundleV1 = {
      ...base,
      observations: base.observations.map((entry) => entry.anchorRef === 'left_eye' ? unavailable(entry) : entry),
    };
    const readiness = assessNeutralObservationBundleReadinessFR15({ bundle: limited, profile: candidateProfile, compatibilityReport: productionCompatibility });
    expect(readiness.state).toBe('section_limited');
    expect(readiness.unavailableAnchorRefs).toEqual(['left_eye']);
  });

  it('rejects observed geometry outside the canonical normalized image frame', () => {
    const base = fixtureBundle();
    const forged = {
      ...base,
      observations: base.observations.map((entry) => entry.anchorRef === 'brow_midline'
        ? { ...entry, geometry: { kind: 'point' as const, point: { x: 1.01, y: 0.3 } } }
        : entry),
    };
    expect(() => validateNeutralObservationBundleFR15(forged, candidateProfile)).toThrow(/within \[0,1\]/u);
  });

  it('rejects geometry carried by an unavailable observation', () => {
    const base = fixtureBundle();
    const forged = {
      ...base,
      observations: base.observations.map((entry) => entry.anchorRef === 'right_eye'
        ? { ...entry, availability: 'unavailable' as const, quality: { visibility: 'not_visible' as const, confidence: null, reasons: ['occluded'] } }
        : entry),
    };
    expect(() => validateNeutralObservationBundleFR15(forged, candidateProfile)).toThrow(/must not carry geometry/u);
  });

  it('rejects provider-specific geometry fields and top-level identity payloads', () => {
    const base = fixtureBundle();
    const providerGeometry = {
      ...base,
      observations: base.observations.map((entry) => entry.anchorRef === 'brow_midline'
        ? { ...entry, geometry: { kind: 'point', point: { x: 0.5, y: 0.31 }, landmarkIndex: 9 } as never }
        : entry),
    };
    expect(() => validateNeutralObservationBundleFR15(providerGeometry, candidateProfile)).toThrow(/unauthorized field: landmarkIndex/u);

    const identityPayload = { ...base, faceEmbedding: [0.1, 0.2] } as NeutralObservationBundleV1;
    expect(() => validateNeutralObservationBundleFR15(identityPayload, candidateProfile)).toThrow(/unauthorized field: faceEmbedding/u);
  });

  it('rejects provider-version drift and raw/biometric persistence', () => {
    const base = fixtureBundle();
    expect(() => validateNeutralObservationBundleFR15({ ...base, providerContractVersion: 'facelab-neutral-v2' }, candidateProfile)).toThrow(/exact pinned providerContractVersion/u);
    expect(() => validateNeutralObservationBundleFR15({
      ...base,
      provenance: { ...base.provenance, biometricEmbeddingPersisted: true } as never,
    }, candidateProfile)).toThrow(/biometric embedding persistence/u);
  });

  it('issues a detached neutral-only snapshot and rejects forged issued artifacts', () => {
    const source = fixtureBundle();
    const issued = issueNeutralObservationArtifactFR15({ bundle: source, profile: candidateProfile, compatibilityReport: productionCompatibility });
    expect(() => assertIssuedNeutralObservationArtifactFR15(issued)).not.toThrow();
    expect(issued.authorityState).toBe('neutral_observation_only');
    expect(issued.prohibitedSemanticUses).toContain('physiognomy_claim_generation');

    const mutable = source as unknown as { pose: { yawDegrees: number } };
    mutable.pose.yawDegrees = 99;
    expect(issued.bundle.pose.yawDegrees).toBe(1.2);
    expect(Object.isFrozen(issued.bundle)).toBe(true);
    expect(Object.isFrozen(issued.bundle.observations)).toBe(true);

    const forged = { ...issued } as IssuedNeutralObservationArtifactV1;
    expect(() => assertIssuedNeutralObservationArtifactFR15(forged)).toThrow(/was not issued/u);
  });
});
