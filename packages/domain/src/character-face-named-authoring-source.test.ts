import { describe, expect, it } from 'vitest';

import {
  resolveCharacterRuntimeAuthorityLaneV1,
} from '../../character-content/src/index.js';
import {
  CHARACTER_FACE_NAMED_AUTHORING_AUTHORITY_SOURCE_V1,
  resolveCharacterFaceNamedAuthoringSourceV1,
} from './character-face-named-authoring-source.js';

describe('named Character Face authoring source v1', () => {
  it('resolves Seyeon from the first admitted runtime-authority lane', () => {
    const source =
      resolveCharacterFaceNamedAuthoringSourceV1('seyeon');
    const lane =
      resolveCharacterRuntimeAuthorityLaneV1('seyeon');

    expect(source).not.toBeNull();
    expect(lane).not.toBeNull();
    if (source === null || lane === null) {
      throw new Error('Seyeon authority lane is required');
    }

    expect(source.authoritySource).toBe(
      CHARACTER_FACE_NAMED_AUTHORING_AUTHORITY_SOURCE_V1,
    );
    expect(source.characterId).toBe('seyeon');
    expect(source.contentVersion).toBe(lane.authorityVersion);
    expect(source.contentVersion).toMatch(
      /^sha256:v1:[0-9a-f]{64}$/u,
    );
    expect(source.provenance).toBe(lane.provenance);
  });

  it('reuses exact reviewed Seyeon voice and questioning objects', () => {
    const source =
      resolveCharacterFaceNamedAuthoringSourceV1('seyeon');
    const lane =
      resolveCharacterRuntimeAuthorityLaneV1('seyeon');

    expect(source).not.toBeNull();
    expect(lane).not.toBeNull();
    if (source === null || lane === null) {
      throw new Error('Seyeon authority lane is required');
    }

    expect(source.speech).toBe(lane.speech);
    expect(source.communication).toBe(lane.communication);
    expect(source.questioning).toBe(lane.questioning);
    expect(source.speech.register).toBe(
      '밝고 행동적인 현실형 동행자',
    );
    expect(source.questioning.preferredStrategies).toEqual([
      'activate_next_step',
      'clarify_boundary',
    ]);
  });

  it('fails closed for Characters without an admitted runtime-authority lane', () => {
    expect(
      resolveCharacterFaceNamedAuthoringSourceV1('yeoul'),
    ).toBeNull();
    expect(
      resolveCharacterFaceNamedAuthoringSourceV1('rahyeon'),
    ).toBeNull();
    expect(
      resolveCharacterFaceNamedAuthoringSourceV1('unknown'),
    ).toBeNull();
  });

  it('contains no Face semantic authoring fields', () => {
    const source =
      resolveCharacterFaceNamedAuthoringSourceV1('seyeon');
    expect(source).not.toBeNull();
    if (source === null) {
      throw new Error('Seyeon authority source is required');
    }

    const keys = Object.keys(source);
    expect(keys).not.toContain('faceProfileVersion');
    expect(keys).not.toContain('allowedTopicKeys');
    expect(keys).not.toContain('attentionOrder');
    expect(keys).not.toContain('morphology');
    expect(keys).not.toContain('thresholds');
    expect(keys).not.toContain('claims');
    expect(keys).not.toContain('templates');
  });
});
