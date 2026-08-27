import { describe, expect, it } from 'vitest';
import {
  FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16,
  FR16_PROVIDER_ADAPTER_EVIDENCE,
  MEDIAPIPE_FACE_TOPOLOGY_RESEARCH_FR16,
  assessProviderAdapterReadinessFR16,
  runProviderAdapterResearchMappingFR16,
  validateProviderAdapterDefinitionFR16,
  type ProviderRawLandmarkFixtureV1,
} from '../packages/face-reading/src/index.js';

const EXPECTED_RECTANGLE = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
] as const;
const EXPECTED_FINGERPRINT = 'sha256:6ccf096bb4cf15c3188421bdb9175a41572a320e487719f96a5e1be5f1e6ca2e';

function fixtureFor(mappingId: string): ProviderRawLandmarkFixtureV1 {
  const mapping = FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16.mappings.find((entry) => entry.mappingId === mappingId);
  if (mapping === undefined) throw new Error(`missing mapping fixture target: ${mappingId}`);
  const indices = [...new Set(mapping.sourceConnectionSetRefs.flatMap((sourceRef) =>
    MEDIAPIPE_FACE_TOPOLOGY_RESEARCH_FR16.connectionSets[sourceRef].flatMap((connection) => [connection.start, connection.end]),
  ))].sort((a, b) => a - b);
  const coords = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ] as const;
  return {
    fixtureId: `fixture.${mappingId}`,
    providerKey: 'mediapipe_face_landmarker',
    providerPackageRef: '@mediapipe/tasks-vision@0.10.35',
    topologyRef: MEDIAPIPE_FACE_TOPOLOGY_RESEARCH_FR16.topologyRef,
    landmarks: indices.map((index) => ({
      index,
      ...coords[index % 4]!,
      z: (index % 11) / 100,
    })),
  };
}

describe('FR-16 provider adapter evidence contract', () => {
  it('validates the research-only adapter and provider topology snapshot', () => {
    expect(validateProviderAdapterDefinitionFR16()).toBe(FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16);
    expect(FR16_PROVIDER_ADAPTER_EVIDENCE.map((entry) => entry.status)).toContain('research_only');
    expect(MEDIAPIPE_FACE_TOPOLOGY_RESEARCH_FR16.landmarkCount).toBe(478);
  });

  it('keeps all six FR-14 neutral slots accounted for while only three are executable candidates', () => {
    expect(FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16.mappings).toHaveLength(6);
    const candidates = FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16.mappings.filter((entry) => entry.status === 'research_candidate');
    expect(candidates.map((entry) => entry.anchorRef).sort()).toEqual(['left_eye', 'nose', 'right_eye']);
  });

  it('blocks eyebrow mappings because the provider topology has disjoint contour chains', () => {
    for (const anchorRef of ['left_brow', 'right_brow']) {
      const mapping = FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16.mappings.find((entry) => entry.anchorRef === anchorRef)!;
      expect(mapping.status).toBe('blocked_requires_neutral_derivation_definition');
      expect(mapping.transform).toBe('blocked');
      expect(mapping.blockers).toContain('neutral brow-curve derivation definition required');
    }
  });

  it('blocks brow midline until reviewed neutral brow representations exist', () => {
    const mapping = FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16.mappings.find((entry) => entry.anchorRef === 'brow_midline')!;
    expect(mapping.status).toBe('blocked_dependency');
    expect(mapping.transform).toBe('blocked');
  });

  it.each([
    'mapping.fr16.left_eye_region',
    'mapping.fr16.right_eye_region',
    'mapping.fr16.nose_region',
  ])('maps %s deterministically to a bounded neutral region', (mappingId) => {
    const fixture = fixtureFor(mappingId);
    const first = runProviderAdapterResearchMappingFR16({ mappingId, fixture });
    const second = runProviderAdapterResearchMappingFR16({ mappingId, fixture });
    expect(first.geometry).toEqual({ kind: 'region', boundary: EXPECTED_RECTANGLE });
    expect(first.outputFingerprint).toBe(EXPECTED_FINGERPRINT);
    expect(second.outputFingerprint).toBe(first.outputFingerprint);
    expect(first.ignoredProviderDimensions).toEqual(['z']);
    expect(first.authorityState).toBe('adapter_research_only');
  });

  it('does not execute blocked eyebrow/brow-midline mappings', () => {
    const fixture = fixtureFor('mapping.fr16.left_brow_region');
    expect(() => runProviderAdapterResearchMappingFR16({
      mappingId: 'mapping.fr16.left_brow_region',
      fixture,
    })).toThrow(/not executable/u);
  });

  it('rejects missing provider vertices instead of synthesizing geometry', () => {
    const fixture = fixtureFor('mapping.fr16.left_eye_region');
    const missing = { ...fixture, landmarks: fixture.landmarks.slice(1) };
    expect(() => runProviderAdapterResearchMappingFR16({
      mappingId: 'mapping.fr16.left_eye_region',
      fixture: missing,
    })).toThrow(/missing required landmark index/u);
  });

  it('rejects provider fixture version/topology drift', () => {
    const fixture = fixtureFor('mapping.fr16.nose_region');
    expect(() => runProviderAdapterResearchMappingFR16({
      mappingId: 'mapping.fr16.nose_region',
      fixture: { ...fixture, providerPackageRef: '@mediapipe/tasks-vision@0.10.34' } as never,
    })).toThrow(/provider\/package mismatch/u);
    expect(() => runProviderAdapterResearchMappingFR16({
      mappingId: 'mapping.fr16.nose_region',
      fixture: { ...fixture, topologyRef: 'topology.other' },
    })).toThrow(/topology mismatch/u);
  });

  it('rejects provider-specific identity payloads outside the adapter fixture schema', () => {
    const fixture = fixtureFor('mapping.fr16.nose_region');
    const forged = { ...fixture, faceEmbedding: [0.1, 0.2] } as ProviderRawLandmarkFixtureV1;
    expect(() => runProviderAdapterResearchMappingFR16({
      mappingId: 'mapping.fr16.nose_region',
      fixture: forged,
    })).toThrow(/unauthorized field: faceEmbedding/u);
  });

  it('cannot become a neutral provider candidate while downstream contract/topology/laterality blockers remain', () => {
    const readiness = assessProviderAdapterReadinessFR16();
    expect(readiness.readyForNeutralProviderCandidate).toBe(false);
    expect(readiness.candidateMappingIds).toHaveLength(3);
    expect(readiness.blockedMappingIds).toHaveLength(3);
    expect(readiness.blockers.join(' ')).toMatch(/downstream contract is unpublished/u);
    expect(readiness.blockers.join(' ')).toMatch(/laterality/u);
  });

  it('rejects attempts to smuggle a traditional anchor into the provider adapter', () => {
    const forged = {
      ...FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16,
      mappings: FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16.mappings.map((entry, index) => index === 0
        ? { ...entry, anchorRef: 'shangen' }
        : entry),
    } as never;
    expect(() => validateProviderAdapterDefinitionFR16(forged)).toThrow(/non-neutral\/unregistered anchor/u);
  });

  it('rejects attempts to claim the current downstream FaceLab neutral contract is published', () => {
    const forged = {
      ...FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16,
      downstreamProviderContractState: 'published',
    } as never;
    expect(() => validateProviderAdapterDefinitionFR16(forged)).toThrow(/cannot claim a published downstream/u);
  });
});
