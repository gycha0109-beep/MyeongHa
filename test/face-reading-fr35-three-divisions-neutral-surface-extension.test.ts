import { describe, expect, it } from 'vitest';
import {
  THREE_DIVISIONS_NEUTRAL_SURFACE_DEFINITIONS_FR35,
  THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
  THREE_DIVISIONS_NEUTRAL_SURFACE_REQUIREMENT_BRIDGES_FR35,
  assertThreeDivisionsNeutralSurfaceProviderReadyFR35,
  assessThreeDivisionsNeutralSurfaceExtensionReadinessFR35,
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35,
  type ThreeDivisionsNeutralSurfaceExtensionAuthorityFR35V1,
} from '../packages/face-reading/src/index.js';

describe('FR-35 Three Divisions neutral surface extension', () => {
  it('validates the three-slot neutral extension contract', () => {
    expect(() => validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35()).not.toThrow();
    expect(THREE_DIVISIONS_NEUTRAL_SURFACE_DEFINITIONS_FR35.map((entry) => [entry.consumerSlot, entry.geometryKind])).toEqual([
      ['neutral.face.hairline_boundary', 'curve'],
      ['neutral.face.philtrum_region', 'region'],
      ['neutral.face.chin_inferior_contour', 'curve'],
    ]);
  });

  it('bridges only the three FR-34 anchors that lacked neutral surfaces', () => {
    expect(THREE_DIVISIONS_NEUTRAL_SURFACE_REQUIREMENT_BRIDGES_FR35.map((entry) => [
      entry.traditionalAnchorRef,
      entry.surfaceSlot,
      entry.relation,
    ])).toEqual([
      ['hairline', 'neutral.face.hairline_boundary', 'candidate_dependency_only'],
      ['renzhong', 'neutral.face.philtrum_region', 'candidate_dependency_only'],
      ['dige', 'neutral.face.chin_inferior_contour', 'candidate_dependency_only'],
    ]);
  });

  it('does not assign provider indices or traditional semantics to new neutral surfaces', () => {
    for (const surface of THREE_DIVISIONS_NEUTRAL_SURFACE_DEFINITIONS_FR35) {
      expect(surface.providerBindingState).toBe('no_verified_binding');
      expect(surface.providerLandmarkRefs).toEqual([]);
      expect(surface.traditionalSemanticOutputAllowed).toBe(false);
      expect(surface.observationClass).toBe('source_neutral_geometry');
    }
    for (const bridge of THREE_DIVISIONS_NEUTRAL_SURFACE_REQUIREMENT_BRIDGES_FR35) {
      expect(bridge.traditionalNeutralEquivalenceAuthorized).toBe(false);
      expect(bridge.verticalReferenceDerivationState).toBe('not_defined');
    }
  });

  it('preserves FR-15 instead of silently widening the base neutral observation contract', () => {
    expect(THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.baseNeutralObservationContractRef).toBe(
      'myeongha-neutral-observation-v1',
    );
    expect(THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.extensionMode).toBe('separate_contract_extension');
    expect(THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityBoundary.mutateFR15BaseContractAllowed).toBe(false);
  });

  it('reports contract coverage as ready while provider/derivation/production remain blocked', () => {
    const readiness = assessThreeDivisionsNeutralSurfaceExtensionReadinessFR35();
    expect(readiness.neutralSurfaceContractReady).toBe(true);
    expect(readiness.missingFR34SurfaceCoverageDefined).toBe(true);
    expect(readiness.baseFR15ContractPreserved).toBe(true);
    expect(readiness.providerBindingReady).toBe(false);
    expect(readiness.verticalReferenceDerivationReady).toBe(false);
    expect(readiness.traditionalNeutralEquivalenceReady).toBe(false);
    expect(readiness.productionMetricReady).toBe(false);
    expect(readiness.productionF1Ready).toBe(false);
    expect(readiness.productionF6Ready).toBe(false);
  });

  it('fails closed when a provider index is injected', () => {
    const surfaces = THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.surfaces.map((entry, index) =>
      index === 0 ? { ...entry, providerLandmarkRefs: [10] } : entry,
    );
    const invalid = {
      ...THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
      surfaces,
    } as unknown as ThreeDivisionsNeutralSurfaceExtensionAuthorityFR35V1;
    expect(() => validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35(invalid)).toThrow(/neutral surface authority drift/u);
  });

  it('fails closed when traditional equivalence is promoted through a bridge', () => {
    const requirementBridges = THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.requirementBridges.map((entry, index) =>
      index === 1 ? { ...entry, traditionalNeutralEquivalenceAuthorized: true } : entry,
    );
    const invalid = {
      ...THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
      requirementBridges,
    } as unknown as ThreeDivisionsNeutralSurfaceExtensionAuthorityFR35V1;
    expect(() => validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35(invalid)).toThrow(/bridge drift/u);
  });

  it('refuses provider-ready promotion until real binding and derivation evidence exists', () => {
    expect(() => assertThreeDivisionsNeutralSurfaceProviderReadyFR35()).toThrow(
      /neutral surface contract extension only; verified provider bindings and vertical-reference derivations are not available/u,
    );
  });
});
