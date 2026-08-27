import { describe, expect, it } from 'vitest';
import {
  FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
  FR17_NEUTRAL_DERIVATION_ALGORITHMS,
  FR17_NEUTRAL_DERIVATION_EVIDENCE,
  NEUTRAL_DERIVATION_REGISTRY_FR17,
  assessNeutralDerivationReadinessFR17,
  isNeutralDerivationExecutableFR17,
  validateNeutralDerivationEvidenceFR17,
  validateNeutralDerivationRegistryFR17,
} from '../packages/face-reading/src/index.js';

describe('FR-17 neutral derivation registry', () => {
  it('validates the registry and all inspected evidence records', () => {
    expect(validateNeutralDerivationRegistryFR17()).toBe(NEUTRAL_DERIVATION_REGISTRY_FR17);
    expect(validateNeutralDerivationEvidenceFR17()).toBe(FR17_NEUTRAL_DERIVATION_EVIDENCE);
    expect(FR17_NEUTRAL_DERIVATION_EVIDENCE).toHaveLength(3);
    expect(FR17_NEUTRAL_DERIVATION_EVIDENCE.map((entry) => entry.authorityState)).toEqual([
      'research_only', 'research_only', 'research_only',
    ]);
  });

  it('resolves exactly every pending derivation required by FR-16 blocked slots', () => {
    const requiredRefs = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence
      .map((entry) => entry.requiredDerivationRef)
      .filter((ref): ref is string => ref !== null)
      .sort();
    const registryRefs = NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => entry.derivationId).sort();
    expect(registryRefs).toEqual(requiredRefs);
    expect(registryRefs).toEqual([
      'derivation.neutral.brow_midline.pending',
      'derivation.neutral.left_brow_curve.pending',
      'derivation.neutral.nose_region.pending',
      'derivation.neutral.right_brow_curve.pending',
    ]);
  });

  it('authorizes zero derivation algorithms in FR-17 v0.1', () => {
    expect(FR17_NEUTRAL_DERIVATION_ALGORITHMS).toEqual([]);
    for (const definition of NEUTRAL_DERIVATION_REGISTRY_FR17.definitions) {
      expect(isNeutralDerivationExecutableFR17(definition)).toBe(false);
      expect(definition.algorithmRef).toBeNull();
    }
  });

  it('keeps nose unresolved and explicitly bans invented region shortcuts', () => {
    const nose = NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.find((entry) => entry.targetAnchorRef === 'nose')!;
    expect(nose.reviewState).toBe('blocked_unresolved');
    expect(nose.inputTopologyClasses).toEqual(['branched_graph']);
    expect(nose.outputGeometryKind).toBe('region');
    expect(nose.failureMode).toBe('unavailable');
    expect(nose.forbiddenShortcuts).toEqual(expect.arrayContaining([
      'convex_hull', 'bounding_box', 'manual_provider_index_subset', 'hand_drawn_polygon',
    ]));
  });

  it('keeps both brow curves unresolved and bans arbitrary chain collapse', () => {
    for (const targetAnchorRef of ['left_brow', 'right_brow']) {
      const brow = NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.find((entry) => entry.targetAnchorRef === targetAnchorRef)!;
      expect(brow.reviewState).toBe('blocked_unresolved');
      expect(brow.inputTopologyClasses).toEqual(['disconnected_open_chains']);
      expect(brow.outputGeometryKind).toBe('curve');
      expect(brow.forbiddenShortcuts).toEqual(expect.arrayContaining([
        'first_chain_only',
        'second_chain_only',
        'bridge_disconnected_chains',
        'pointwise_average_without_correspondence_authority',
        'bezier_smoothing',
      ]));
    }
  });

  it('keeps brow midline dependency-blocked on both reviewed brow representations', () => {
    const midline = NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.find((entry) => entry.targetAnchorRef === 'brow_midline')!;
    expect(midline.reviewState).toBe('blocked_dependency');
    expect(midline.outputGeometryKind).toBe('point');
    expect(midline.dependencyDerivationRefs).toEqual([
      'derivation.neutral.left_brow_curve.pending',
      'derivation.neutral.right_brow_curve.pending',
    ]);
    expect(midline.forbiddenShortcuts).toContain('fixed_provider_landmark_index');
  });

  it('pins evidence that current K_beauty runtime is qualitative VLM observation rather than landmark geometry authority', () => {
    const contractEvidence = FR17_NEUTRAL_DERIVATION_EVIDENCE.find((entry) =>
      entry.evidenceRef === 'evidence.fr17.kbeauty.face_observation_contract')!;
    const runtimeEvidence = FR17_NEUTRAL_DERIVATION_EVIDENCE.find((entry) =>
      entry.evidenceRef === 'evidence.fr17.kbeauty.unified_runtime_provider')!;
    expect(contractEvidence.sourceRef).toContain('lib/face-lab-observation-contract.js');
    expect(contractEvidence.observedValue).toMatch(/qualitative enums/u);
    expect(runtimeEvidence.sourceRef).toContain('lib/server/vision-observation-service.js');
    expect(runtimeEvidence.observedValue).toMatch(/OpenAI chat completions/u);
    expect(runtimeEvidence.limitations.join(' ')).toMatch(/does not by itself establish runtime geometry authority/u);
  });

  it('rejects traditional semantic anchors as derivation targets', () => {
    const forged = {
      ...NEUTRAL_DERIVATION_REGISTRY_FR17,
      definitions: NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry, index) => index === 0
        ? { ...entry, targetAnchorRef: 'shangen' }
        : entry),
    } as never;
    expect(() => validateNeutralDerivationRegistryFR17(forged)).toThrow(/only FR-14 neutral anchors/u);
  });

  it('rejects unresolved evidence references instead of accepting provenance-shaped strings', () => {
    const forged = {
      ...NEUTRAL_DERIVATION_REGISTRY_FR17,
      definitions: NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry, index) => index === 0
        ? { ...entry, evidenceRefs: ['evidence.fr17.does_not_exist'] }
        : entry),
    } as never;
    expect(() => validateNeutralDerivationRegistryFR17(forged)).toThrow(/unresolved derivation evidenceRef/u);
  });

  it('rejects a blocked derivation carrying an algorithmRef', () => {
    const forged = {
      ...NEUTRAL_DERIVATION_REGISTRY_FR17,
      definitions: NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => entry.targetAnchorRef === 'nose'
        ? { ...entry, algorithmRef: 'algorithm.neutral.fake' }
        : entry),
    } as never;
    expect(() => validateNeutralDerivationRegistryFR17(forged)).toThrow(/blocked derivation cannot carry algorithmRef/u);
  });

  it('rejects promotion to research candidate with an unregistered algorithm', () => {
    const forged = {
      ...NEUTRAL_DERIVATION_REGISTRY_FR17,
      definitions: NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => entry.targetAnchorRef === 'nose'
        ? {
            ...entry,
            reviewState: 'research_candidate',
            algorithmRef: 'algorithm.neutral.nose.fake_v1',
            calibrationRefs: ['calibration.fake'],
          }
        : entry),
    } as never;
    expect(() => validateNeutralDerivationRegistryFR17(forged)).toThrow(/unresolved neutral derivation algorithmRef/u);
  });

  it('rejects direct authorization of a shortcut explicitly banned by the derivation', () => {
    const forged = {
      ...NEUTRAL_DERIVATION_REGISTRY_FR17,
      definitions: NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => entry.targetAnchorRef === 'nose'
        ? {
            ...entry,
            reviewState: 'research_candidate',
            algorithmRef: 'convex_hull',
            calibrationRefs: ['calibration.fake'],
          }
        : entry),
    } as never;
    expect(() => validateNeutralDerivationRegistryFR17(forged)).toThrow(/cannot authorize its forbidden shortcut/u);
  });

  it('rejects wrong output geometry type rather than coercing it', () => {
    const forged = {
      ...NEUTRAL_DERIVATION_REGISTRY_FR17,
      definitions: NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => entry.targetAnchorRef === 'nose'
        ? { ...entry, outputGeometryKind: 'curve' }
        : entry),
    } as never;
    expect(() => validateNeutralDerivationRegistryFR17(forged)).toThrow(/outputGeometryKind mismatch/u);
  });

  it('rejects derivation dependency cycles', () => {
    const forged = {
      ...NEUTRAL_DERIVATION_REGISTRY_FR17,
      definitions: NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => entry.targetAnchorRef === 'left_brow'
        ? { ...entry, dependencyDerivationRefs: ['derivation.neutral.brow_midline.pending'] }
        : entry),
    } as never;
    expect(() => validateNeutralDerivationRegistryFR17(forged)).toThrow(/dependency cycle/u);
  });

  it('rejects missing FR-16 required derivations', () => {
    const forged = {
      ...NEUTRAL_DERIVATION_REGISTRY_FR17,
      definitions: NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.slice(1),
    } as never;
    expect(() => validateNeutralDerivationRegistryFR17(forged)).toThrow(/exactly the derivations required by FR-16/u);
  });

  it('reports all four derivations blocked, with no missing registry references', () => {
    const readiness = assessNeutralDerivationReadinessFR17();
    expect(readiness.productionReady).toBe(false);
    expect(readiness.executableDerivationRefs).toEqual([]);
    expect(readiness.blockedDerivationRefs).toHaveLength(4);
    expect(readiness.unresolvedRequiredRefs).toEqual([]);
    expect(readiness.blockers.join(' ')).toMatch(/zero authorized neutral derivation algorithms/u);
    expect(readiness.blockers.join(' ')).toMatch(/qualitative VLM observation/u);
  });
});
