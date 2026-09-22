import { describe, expect, it } from 'vitest';
import {
  FACE_INTERPRETATION_BRIDGE_VERSION_FE038,
  buildFaceInterpretationShellFE038,
} from './interpretation-shell-bridge-fe038.js';
import type { FacePreviewOneShotResultFE031 } from '../face-preview/one-shot-fe031.js';

const readyObservation: FacePreviewOneShotResultFE031 = {
  schemaVersion: 'myeongha-face-preview-one-shot-result-v1',
  contractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
  status: 'ok',
  preview: {
    metrics: [{
      regionKey: 'eye_pair',
      metricRef: 'eye.span',
      value: 0.42,
      unit: 'ratio',
    }],
    regions: [
      { regionKey: 'eye_pair', state: 'available', unavailableSurfaces: [] },
      {
        regionKey: 'cheek_mid_face',
        state: 'partial',
        unavailableSurfaces: ['cheek_mid_face.visible_contour_prominence'],
      },
      { regionKey: 'mouth_lips', state: 'available', unavailableSurfaces: [] },
      { regionKey: 'chin_lower_face', state: 'available', unavailableSurfaces: [] },
    ],
  },
  lifecycle: {
    metadataStrippedBeforeAnalysis: true,
    rawInputPersisted: false,
    canonicalImagePersisted: false,
    identityEmbeddingCreated: false,
    sessionClosed: true,
  },
};

describe('FE038 neutral observation interpretation bridge', () => {
  it('connects FE031 provenance without copying neutral metric values into the shell', () => {
    const result = buildFaceInterpretationShellFE038({
      schemaVersion: 'myeongha-face-interpretation-bridge-input-v1',
      observationRef: 'obs_fe038_fixture_001',
      observation: readyObservation,
    });

    expect(FACE_INTERPRETATION_BRIDGE_VERSION_FE038)
      .toBe('MHA-FACE-INTERPRETATION-BRIDGE-FE038-v1');
    expect(result).toMatchObject({
      status: 'ready',
      shell: {
        observation: {
          observationRef: 'obs_fe038_fixture_001',
          sourceContractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
          sourceProjectionSchemaVersion:
            'myeongha-face-preview-one-shot-result-v1',
          metricCount: 1,
          regionCount: 4,
        },
        criterion: { state: 'not_admitted' },
        claims: [],
        narrative: { allowed: false },
      },
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('eye.span');
    expect(serialized).not.toContain('0.42');
    expect(serialized).not.toContain('visible_contour_prominence');
  });

  it('produces the same shell for the same observation provenance', () => {
    const input = {
      schemaVersion: 'myeongha-face-interpretation-bridge-input-v1' as const,
      observationRef: 'obs_fe038_fixture_001',
      observation: readyObservation,
    };
    expect(buildFaceInterpretationShellFE038(input))
      .toEqual(buildFaceInterpretationShellFE038(input));
  });

  it('does not create a shell when FE031 has no neutral observation', () => {
    const rejectedObservation: FacePreviewOneShotResultFE031 = {
      schemaVersion: 'myeongha-face-preview-one-shot-result-v1',
      contractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
      status: 'rejected',
      rejection: {
        code: 'NO_FACE_DETECTED',
        stage: 'analysis',
      },
      lifecycle: {
        rawInputPersisted: false,
        canonicalImagePersisted: false,
        identityEmbeddingCreated: false,
      },
    };

    expect(buildFaceInterpretationShellFE038({
      schemaVersion: 'myeongha-face-interpretation-bridge-input-v1',
      observationRef: 'obs_fe038_fixture_002',
      observation: rejectedObservation,
    })).toMatchObject({
      status: 'rejected',
      reason: 'neutral_observation_unavailable',
    });
  });

  it('fails closed on malformed provenance input', () => {
    expect(buildFaceInterpretationShellFE038({
      schemaVersion: 'myeongha-face-interpretation-bridge-input-v1',
      observationRef: 'not an opaque ref',
      observation: readyObservation,
    })).toMatchObject({
      status: 'rejected',
      reason: 'invalid_input',
    });
  });
});
