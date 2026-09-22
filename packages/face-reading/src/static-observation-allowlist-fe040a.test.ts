import { describe, expect, it } from 'vitest';
import {
  FACE_STATIC_OBSERVATION_ALLOWLIST_FE040A,
  FACE_STATIC_OBSERVATION_ALLOWLIST_VERSION_FE040A,
  admitFaceStaticObservationFE040A,
  isFaceStaticObservationEnvelopeShapeFE040A,
} from './static-observation-allowlist-fe040a.js';
import { createFaceInterpretationShellFE038 } from './interpretation-shell-fe038.js';

function syntheticShape() {
  return {
    schemaVersion: 'myeongha-face-static-observation-envelope-v1',
    registryRef: 'synthetic.registry.ref',
    metrics: [{
      regionKey: 'eye_pair',
      metricRef: 'synthetic.metric',
      value: 0.42,
      unit: 'ratio',
    }],
    regions: [
      {
        regionKey: 'eye_pair',
        state: 'available',
        unavailableSurfaces: [],
      },
      {
        regionKey: 'cheek_mid_face',
        state: 'available',
        unavailableSurfaces: [],
      },
      {
        regionKey: 'mouth_lips',
        state: 'available',
        unavailableSurfaces: [],
      },
      {
        regionKey: 'chin_lower_face',
        state: 'available',
        unavailableSurfaces: [],
      },
    ],
  };
}

describe('FE040A static observation allowlist', () => {
  it('locks the input surface to neutral metrics and region availability only', () => {
    expect(FACE_STATIC_OBSERVATION_ALLOWLIST_VERSION_FE040A)
      .toBe('MHA-FACE-STATIC-OBSERVATION-ALLOWLIST-FE040A-v1');
    expect(FACE_STATIC_OBSERVATION_ALLOWLIST_FE040A).toMatchObject({
      allowedSurfaceKinds: ['neutral_metric', 'region_availability'],
      boundary: {
        staticNeutralObservationOnly: true,
        dynamicAppearanceAllowed: false,
        colorAppearanceAllowed: false,
        rawGeometryAllowed: false,
        rawLandmarkAllowed: false,
        rawImageAllowed: false,
        identityMaterialAllowed: false,
        embeddingAllowed: false,
        userAccountDataAllowed: false,
        traditionalBindingAuthorityIssued: false,
        thresholdAuthorityIssued: false,
        classificationAuthorityIssued: false,
        scoreAuthorityIssued: false,
        rankingAuthorityIssued: false,
        narrativeAuthorityIssued: false,
      },
    });
  });

  it('accepts the static envelope shape without granting authority', () => {
    expect(isFaceStaticObservationEnvelopeShapeFE040A(syntheticShape()))
      .toBe(true);
  });

  it.each([
    ['colorAppearance', { tone: 'warm' }],
    ['rawGeometry', { landmarks: [1, 2, 3] }],
    ['rawImage', 'base64'],
    ['identityEmbedding', [0.1, 0.2]],
    ['traditionalTerm', 'SYNTHETIC_TERM'],
    ['threshold', 0.5],
    ['score', 99],
    ['narrative', 'synthetic prose'],
  ])('rejects extra %s fields at the static input boundary', (key, injected) => {
    const value = {
      ...syntheticShape(),
      [key]: injected,
    };
    expect(isFaceStaticObservationEnvelopeShapeFE040A(value)).toBe(false);
  });

  it('cannot admit a static observation without an actually issued upstream registry', () => {
    const forgedRegistry = {
      status: 'admitted',
      registryState: 'canonical_upstream_registry_admitted',
      registryRef: 'synthetic.registry.ref',
      metrics: [],
      regions: [],
    };

    expect(
      admitFaceStaticObservationFE040A(forgedRegistry, syntheticShape()),
    ).toMatchObject({
      status: 'rejected',
      reason: 'registry_not_admitted',
    });
  });

  it('does not unlock the FE038 interpretation shell', () => {
    const shell = createFaceInterpretationShellFE038({
      schemaVersion: 'myeongha-face-neutral-observation-ref-v1',
      observationRef: 'fe040a.synthetic.observation',
      sourceContractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
      sourceProjectionSchemaVersion:
        'myeongha-face-preview-one-shot-result-v1',
      metricCount: 12,
      regionCount: 4,
    });

    expect(shell.criterion.state).toBe('not_admitted');
    expect(shell.claims).toEqual([]);
    expect(shell.narrative.allowed).toBe(false);
  });
});
