import { describe, expect, it } from 'vitest';
import {
  FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER,
  FR24_EYE_TOPOLOGY_WITNESS_EDGES,
  assessFaceEyePairResearchBridgeFR24,
  issueFaceEyePairResearchArtifactFR24,
  orderClosedCycleProviderVerticesFR16,
  validateFaceEyePairResearchArtifactFR24,
  type FaceEyePairResearchProjectionInputFR24V1,
  type NormalizedPoint2DV1,
  type ProviderEyeTopologySymbolFR24,
} from '../packages/face-reading/src/index.js';

const ASSET_DIGEST = `sha256:${'a'.repeat(64)}`;

function fixturePoints(symbol: ProviderEyeTopologySymbolFR24): Readonly<Record<number, NormalizedPoint2DV1>> {
  const vertices = orderClosedCycleProviderVerticesFR16(FR24_EYE_TOPOLOGY_WITNESS_EDGES[symbol]);
  return Object.freeze(Object.fromEntries(vertices.map((vertex, index) => [
    vertex,
    Object.freeze({
      x: (index + 1) / 20,
      y: (index + 2) / 20,
    }),
  ])) as Record<number, NormalizedPoint2DV1>);
}

function fixtureInput(): FaceEyePairResearchProjectionInputFR24V1 {
  return {
    providerRunRef: 'provider.run.fr24.fixture.001',
    canonicalAssetDigest: ASSET_DIGEST,
    topologyInputs: {
      FACE_LANDMARKS_RIGHT_EYE: { pointsByProviderVertex: fixturePoints('FACE_LANDMARKS_RIGHT_EYE') },
      FACE_LANDMARKS_LEFT_EYE: { pointsByProviderVertex: fixturePoints('FACE_LANDMARKS_LEFT_EYE') },
    },
  };
}

describe('FR-24 research-only eye-pair runtime bridge', () => {
  it('pins the exact FR-16 upstream eye topology witness edges instead of accepting caller-supplied graphs', () => {
    expect(FR24_EYE_TOPOLOGY_WITNESS_EDGES.FACE_LANDMARKS_LEFT_EYE).toHaveLength(16);
    expect(FR24_EYE_TOPOLOGY_WITNESS_EDGES.FACE_LANDMARKS_RIGHT_EYE).toHaveLength(16);
    expect(FR24_EYE_TOPOLOGY_WITNESS_EDGES.FACE_LANDMARKS_LEFT_EYE[0]).toEqual({ start: 263, end: 249 });
    expect(FR24_EYE_TOPOLOGY_WITNESS_EDGES.FACE_LANDMARKS_RIGHT_EYE[0]).toEqual({ start: 33, end: 7 });
    expect(orderClosedCycleProviderVerticesFR16(FR24_EYE_TOPOLOGY_WITNESS_EDGES.FACE_LANDMARKS_LEFT_EYE)).toHaveLength(16);
    expect(orderClosedCycleProviderVerticesFR16(FR24_EYE_TOPOLOGY_WITNESS_EDGES.FACE_LANDMARKS_RIGHT_EYE)).toHaveLength(16);
  });

  it('projects both provider-labeled eye regions deterministically without issuing FR-15 consumer slots', () => {
    const artifact = issueFaceEyePairResearchArtifactFR24(fixtureInput());
    expect(artifact.regions.map((region) => region.providerTopologySymbol)).toEqual(FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER);
    expect(artifact.regions[0]?.boundary).toHaveLength(16);
    expect(artifact.regions[1]?.boundary).toHaveLength(16);
    expect(artifact.sideAuthority).toBe('provider_label_only');
    expect(artifact.pairConsumptionState).toBe('unordered_provider_labeled_pair_only');
    expect(artifact.consumerSlotAssignment).toBeNull();
    expect(artifact.anatomicalLateralityResolved).toBe(false);
    expect(artifact.traditionalSemanticAuthority).toBe(false);
    expect(artifact.productionNeutralObservationIssued).toBe(false);
  });

  it('uses fixed serialization order only for deterministic bytes, not side authority', () => {
    const artifact = issueFaceEyePairResearchArtifactFR24(fixtureInput());
    expect(artifact.serializationOrder).toBe('provider_topology_symbol_fixed_order_not_side_authority');
    expect(artifact.regions[0]?.providerTopologySymbol).toBe('FACE_LANDMARKS_LEFT_EYE');
    expect(artifact.regions[1]?.providerTopologySymbol).toBe('FACE_LANDMARKS_RIGHT_EYE');
    expect(Object.keys(artifact.regions[0] ?? {})).not.toContain('imageSide');
    expect(Object.keys(artifact.regions[0] ?? {})).not.toContain('anatomicalSide');
    expect(Object.keys(artifact.regions[0] ?? {})).not.toContain('consumerSlot');
  });

  it('rejects missing or extra topology inputs', () => {
    const input = fixtureInput();
    expect(() => issueFaceEyePairResearchArtifactFR24({
      ...input,
      topologyInputs: {
        FACE_LANDMARKS_LEFT_EYE: input.topologyInputs.FACE_LANDMARKS_LEFT_EYE,
      } as never,
    })).toThrow(/missing required provider topology/u);

    expect(() => issueFaceEyePairResearchArtifactFR24({
      ...input,
      topologyInputs: {
        ...input.topologyInputs,
        FACE_LANDMARKS_NOSE: { pointsByProviderVertex: {} },
      } as never,
    })).toThrow(/unauthorized field: FACE_LANDMARKS_NOSE/u);
  });

  it('rejects unused provider vertices instead of silently carrying hidden landmark data', () => {
    const input = fixtureInput();
    expect(() => issueFaceEyePairResearchArtifactFR24({
      ...input,
      topologyInputs: {
        ...input.topologyInputs,
        FACE_LANDMARKS_LEFT_EYE: {
          pointsByProviderVertex: {
            ...input.topologyInputs.FACE_LANDMARKS_LEFT_EYE.pointsByProviderVertex,
            999: { x: 0.5, y: 0.5 },
          },
        },
      },
    })).toThrow(/exactly the vertices referenced|unauthorized provider vertex/u);
  });

  it('rejects provider-specific z fields at the neutralized x/y projection boundary', () => {
    const input = fixtureInput();
    const left = { ...input.topologyInputs.FACE_LANDMARKS_LEFT_EYE.pointsByProviderVertex };
    const vertex = Number(Object.keys(left)[0]);
    left[vertex] = { ...left[vertex]!, z: 0.1 } as never;
    expect(() => issueFaceEyePairResearchArtifactFR24({
      ...input,
      topologyInputs: {
        ...input.topologyInputs,
        FACE_LANDMARKS_LEFT_EYE: { pointsByProviderVertex: left },
      },
    })).toThrow(/unauthorized field: z/u);
  });

  it('requires a content-addressed canonical asset and a non-empty provider run reference', () => {
    const input = fixtureInput();
    expect(() => issueFaceEyePairResearchArtifactFR24({
      ...input,
      canonicalAssetDigest: 'sha256:not-valid',
    })).toThrow(/canonicalAssetDigest must be sha256/u);
    expect(() => issueFaceEyePairResearchArtifactFR24({
      ...input,
      providerRunRef: '   ',
    })).toThrow(/providerRunRef must be non-empty/u);
  });

  it('rejects hidden image/anatomical side fields and FR-15 consumer-slot promotion in artifacts', () => {
    const artifact = issueFaceEyePairResearchArtifactFR24(fixtureInput());
    expect(() => validateFaceEyePairResearchArtifactFR24({
      ...artifact,
      regions: artifact.regions.map((region, index) => index === 0
        ? { ...region, imageSide: 'left' }
        : region),
    } as never)).toThrow(/unauthorized field: imageSide/u);

    expect(() => validateFaceEyePairResearchArtifactFR24({
      ...artifact,
      consumerSlotAssignment: 'neutral.face.left_eye_region',
    } as never)).toThrow(/cannot be assigned to FR-15 consumer slots/u);
  });

  it('rejects attempts to resolve anatomical laterality, issue production observations, or grant traditional semantics', () => {
    const artifact = issueFaceEyePairResearchArtifactFR24(fixtureInput());
    expect(() => validateFaceEyePairResearchArtifactFR24({
      ...artifact,
      anatomicalLateralityResolved: true,
    } as never)).toThrow(/cannot resolve anatomical laterality/u);
    expect(() => validateFaceEyePairResearchArtifactFR24({
      ...artifact,
      productionNeutralObservationIssued: true,
    } as never)).toThrow(/cannot resolve anatomical laterality/u);
    expect(() => validateFaceEyePairResearchArtifactFR24({
      ...artifact,
      traditionalSemanticAuthority: true,
    } as never)).toThrow(/cannot resolve anatomical laterality/u);
  });

  it('rejects provenance promotion from upstream structure witness to release-exact evidence', () => {
    const artifact = issueFaceEyePairResearchArtifactFR24(fixtureInput());
    expect(() => validateFaceEyePairResearchArtifactFR24({
      ...artifact,
      provenance: {
        ...artifact.provenance,
        releaseExactForInstalledPackage: true,
      },
    } as never)).toThrow(/without release-exact promotion/u);
  });

  it('reports research projection ready while all production and semantic promotions remain closed', () => {
    const readiness = assessFaceEyePairResearchBridgeFR24();
    expect(readiness.researchProjectionReady).toBe(true);
    expect(readiness.productionNeutralObservationReady).toBe(false);
    expect(readiness.consumerSlotAssignmentReady).toBe(false);
    expect(readiness.anatomicalLateralityReady).toBe(false);
    expect(readiness.traditionalSemanticAuthorityGranted).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/release-exact/u);
    expect(readiness.blockers.join(' ')).toMatch(/providerContractVersion=null/u);
    expect(readiness.blockers.join(' ')).toMatch(/not assigned to FR-15 image-side consumer slots/u);
  });
});
