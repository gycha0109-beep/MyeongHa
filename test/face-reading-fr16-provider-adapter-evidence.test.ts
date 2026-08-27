import { describe, expect, it } from 'vitest';
import {
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
  assessProviderAdapterEvidenceReadinessFR16,
  orderClosedCycleProviderVerticesFR16,
  projectClosedCycleRegionTestVectorFR16,
  validateProviderAdapterEvidenceManifestFR16,
} from '../packages/face-reading/src/index.js';

describe('FR-16 provider adapter evidence contract', () => {
  it('pins current K_beauty dependency evidence without claiming a FaceLab production contract', () => {
    const manifest = validateProviderAdapterEvidenceManifestFR16();
    expect(manifest).toBe(FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16);
    expect(manifest.authorityState).toBe('research_only');
    expect(manifest.dependencyEvidence).toMatchObject({
      repository: 'gycha0109-beep/K_beauty',
      repositoryCommit: '81c3b4139efdffc785439da005557dc38a6b4873',
      packageManifestBlobSha: '4cd6b7f65223857505578fcb8ca27a033e8361b6',
      packageName: '@mediapipe/tasks-vision',
      packageVersion: '0.10.35',
    });
    expect(FACELAB_NEUTRAL_BINDING_PROFILE_FR14.providerContractVersion).toBeNull();
    expect(FACELAB_NEUTRAL_BINDING_PROFILE_FR14.activationState).toBe('blocked');
  });

  it('pins upstream topology as a structure witness, never as release-exact 0.10.35 evidence', () => {
    const evidence = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence;
    expect(evidence.repository).toBe('google-ai-edge/mediapipe');
    expect(evidence.sourceCommit).toBe('30590fe8d3fdc57e63a0e9c5b2c0ececffb37301');
    expect(evidence.sourceRefClass).toBe('upstream_master_structure_witness');
    expect(evidence.releaseExactForInstalledPackage).toBe(false);
  });

  it('accounts for every FR-14 neutral slot but leaves only the two eye regions as research candidates', () => {
    const slots = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence;
    expect(slots).toHaveLength(6);
    const candidates = slots.filter((entry) => entry.mappingState === 'research_candidate_closed_cycle');
    expect(candidates.map((entry) => entry.anchorRef).sort()).toEqual(['left_eye', 'right_eye']);
    const blocked = slots.filter((entry) => entry.mappingState !== 'research_candidate_closed_cycle');
    expect(blocked.map((entry) => entry.anchorRef).sort()).toEqual([
      'brow_midline',
      'left_brow',
      'nose',
      'right_brow',
    ]);
  });

  it('records why eyes, brows, and nose are structurally different provider topologies', () => {
    const summaries = new Map(
      FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySummaries.map((entry) => [entry.topologySymbol, entry] as const),
    );
    expect(summaries.get('FACE_LANDMARKS_LEFT_EYE')).toMatchObject({
      topologyClass: 'closed_cycle',
      edgeCount: 16,
      connectedComponentCount: 1,
      cycleRank: 1,
      maxVertexDegree: 2,
    });
    expect(summaries.get('FACE_LANDMARKS_LEFT_EYEBROW')).toMatchObject({
      topologyClass: 'disconnected_open_chains',
      edgeCount: 8,
      connectedComponentCount: 2,
      cycleRank: 0,
      maxVertexDegree: 2,
    });
    expect(summaries.get('FACE_LANDMARKS_NOSE')).toMatchObject({
      topologyClass: 'branched_graph',
      edgeCount: 25,
      connectedComponentCount: 1,
      cycleRank: 2,
      maxVertexDegree: 3,
    });
  });

  it('blocks nose region derivation instead of inventing a polygon or convex hull', () => {
    const nose = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence.find((entry) => entry.anchorRef === 'nose')!;
    expect(nose.mappingState).toBe('blocked_requires_region_derivation_definition');
    expect(nose.topologyClass).toBe('branched_graph');
    expect(nose.requiredDerivationRef).toBe('derivation.neutral.nose_region.pending');
  });

  it('blocks eyebrow curves because provider topology is two disconnected chains', () => {
    for (const anchorRef of ['left_brow', 'right_brow']) {
      const brow = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence.find((entry) => entry.anchorRef === anchorRef)!;
      expect(brow.mappingState).toBe('blocked_requires_curve_derivation_definition');
      expect(brow.topologyClass).toBe('disconnected_open_chains');
      expect(brow.requiredDerivationRef).toMatch(/derivation\.neutral\..+_brow_curve\.pending/u);
    }
  });

  it('blocks brow midline because the provider has no direct neutral midline topology contract', () => {
    const midline = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence.find((entry) => entry.anchorRef === 'brow_midline')!;
    expect(midline.mappingState).toBe('blocked_requires_midline_derivation_definition');
    expect(midline.providerTopologySymbol).toBeNull();
    expect(midline.requiredDerivationRef).toBe('derivation.neutral.brow_midline.pending');
  });

  it('orders a closed provider cycle deterministically without convex-hull reshaping', () => {
    const edges = [
      { start: 30, end: 40 },
      { start: 10, end: 20 },
      { start: 40, end: 10 },
      { start: 20, end: 30 },
    ] as const;
    expect(orderClosedCycleProviderVerticesFR16(edges)).toEqual([10, 20, 30, 40]);
    expect(orderClosedCycleProviderVerticesFR16([...edges].reverse())).toEqual([10, 20, 30, 40]);
  });

  it('projects a deterministic closed-cycle test vector using x/y only', () => {
    const edges = [
      { start: 3, end: 4 },
      { start: 1, end: 2 },
      { start: 4, end: 1 },
      { start: 2, end: 3 },
    ] as const;
    const boundary = projectClosedCycleRegionTestVectorFR16({
      edges,
      pointsByProviderVertex: {
        1: { x: 0.2, y: 0.2 },
        2: { x: 0.8, y: 0.2 },
        3: { x: 0.65, y: 0.6 },
        4: { x: 0.3, y: 0.55 },
      },
    });
    expect(boundary).toEqual([
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.65, y: 0.6 },
      { x: 0.3, y: 0.55 },
    ]);
  });

  it('rejects branched graphs as closed-cycle region derivations', () => {
    expect(() => orderClosedCycleProviderVerticesFR16([
      { start: 1, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: 1 },
      { start: 2, end: 4 },
    ])).toThrow(/degree 2/u);
  });

  it('rejects disconnected cycle components', () => {
    expect(() => orderClosedCycleProviderVerticesFR16([
      { start: 1, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: 1 },
      { start: 10, end: 11 },
      { start: 11, end: 12 },
      { start: 12, end: 10 },
    ])).toThrow(/disconnected cycle components/u);
  });

  it('rejects duplicate provider edges and provider-specific point fields', () => {
    expect(() => orderClosedCycleProviderVerticesFR16([
      { start: 1, end: 2 },
      { start: 2, end: 1 },
      { start: 2, end: 3 },
    ])).toThrow(/duplicate undirected edge/u);

    expect(() => projectClosedCycleRegionTestVectorFR16({
      edges: [
        { start: 1, end: 2 },
        { start: 2, end: 3 },
        { start: 3, end: 1 },
      ],
      pointsByProviderVertex: {
        1: { x: 0.1, y: 0.1, z: 0.2 } as never,
        2: { x: 0.8, y: 0.1 },
        3: { x: 0.5, y: 0.7 },
      },
    })).toThrow(/unauthorized field: z/u);
  });

  it('rejects out-of-range neutral coordinates rather than normalizing them silently', () => {
    expect(() => projectClosedCycleRegionTestVectorFR16({
      edges: [
        { start: 1, end: 2 },
        { start: 2, end: 3 },
        { start: 3, end: 1 },
      ],
      pointsByProviderVertex: {
        1: { x: -0.1, y: 0.1 },
        2: { x: 0.8, y: 0.1 },
        3: { x: 0.5, y: 0.7 },
      },
    })).toThrow(/within \[0,1\]/u);
  });

  it('fails closed when a nose mapping is forged into a research candidate', () => {
    const forged = {
      ...FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
      slotEvidence: FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence.map((entry) =>
        entry.anchorRef === 'nose'
          ? { ...entry, mappingState: 'research_candidate_closed_cycle', requiredDerivationRef: null }
          : entry),
    } as never;
    expect(() => validateProviderAdapterEvidenceManifestFR16(forged)).toThrow(/mappingState is not justified/u);
  });

  it('fails closed when upstream master evidence is forged as release-exact', () => {
    const forged = {
      ...FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
      topologySourceEvidence: {
        ...FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence,
        releaseExactForInstalledPackage: true,
      },
    } as never;
    expect(() => validateProviderAdapterEvidenceManifestFR16(forged)).toThrow(/must not be promoted to release-exact/u);
  });

  it('rejects hidden provider-specific fields on the manifest boundary', () => {
    const forged = {
      ...FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
      providerLandmarkMap: { leftEye: [1, 2, 3] },
    } as never;
    expect(() => validateProviderAdapterEvidenceManifestFR16(forged)).toThrow(/unauthorized field: providerLandmarkMap/u);
  });

  it('remains research-only with four blocked slots and no production readiness', () => {
    const readiness = assessProviderAdapterEvidenceReadinessFR16();
    expect(readiness.productionReady).toBe(false);
    expect(readiness.authorityState).toBe('research_only');
    expect(readiness.researchCandidateSlots.sort()).toEqual([
      'neutral.face.left_eye_region',
      'neutral.face.right_eye_region',
    ]);
    expect(readiness.blockedSlots).toHaveLength(4);
    expect(readiness.blockers.join(' ')).toMatch(/providerContractVersion/u);
    expect(readiness.blockers.join(' ')).toMatch(/release-exact/u);
    expect(readiness.blockers.join(' ')).toMatch(/traditional physiognomy anchors/u);
  });
});
