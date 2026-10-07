import { describe, expect, it } from 'vitest';

import {
  CHARACTER_FACE_ATTENTION_KEYS_V1,
} from './character-face-perspective.js';
import {
  CHARACTER_FACE_SAFE_FOLLOW_UP_FRAMING_V1,
  CHARACTER_FACE_SAFE_REACTION_FRAMING_V1,
  resolveCharacterFaceFollowUpFramingV1,
  resolveCharacterFaceReactionFramingV1,
} from './character-face-delivery-profile.js';
import {
  resolveCharacterFaceNamedProfileBundleV1,
  assertCharacterFaceNamedProfileCompatibilityV1,
  CharacterFaceNamedProfileCompatibilityErrorV1,
  SEYEON_FACE_PROFILE_VERSION_V1,
} from './character-face-named-profile-registry.js';

describe('TOPIC-FACE-005I-B named Character Face profiles', () => {
  it('resolves only Seyeon as the first named profile bundle', () => {
    expect(
      resolveCharacterFaceNamedProfileBundleV1('seyeon'),
    ).not.toBeNull();
    expect(
      resolveCharacterFaceNamedProfileBundleV1('yeoul'),
    ).toBeNull();
    expect(
      resolveCharacterFaceNamedProfileBundleV1('rahyeon'),
    ).toBeNull();
  });

  it('pins every Seyeon profile to the same named Character identity', () => {
    const bundle =
      resolveCharacterFaceNamedProfileBundleV1('seyeon');
    expect(bundle).not.toBeNull();
    if (bundle === null) throw new Error('Seyeon profile bundle is required');

    const source = bundle.authoringSource;
    expect(bundle.capability.characterId).toBe(source.characterId);
    expect(bundle.governedCapability.characterId).toBe(source.characterId);
    expect(bundle.perspective.characterId).toBe(source.characterId);
    expect(bundle.delivery.characterId).toBe(source.characterId);

    expect(bundle.capability.sourceContentVersion).toBe(source.contentVersion);
    expect(bundle.governedCapability.sourceContentVersion).toBe(source.contentVersion);
    expect(bundle.perspective.sourceContentVersion).toBe(source.contentVersion);
    expect(bundle.delivery.sourceContentVersion).toBe(source.contentVersion);

    expect(bundle.capability.sourceFaceProfileVersion).toBe(
      SEYEON_FACE_PROFILE_VERSION_V1,
    );
    expect(bundle.governedCapability.sourceFaceProfileVersion).toBe(
      SEYEON_FACE_PROFILE_VERSION_V1,
    );
    expect(bundle.perspective.sourceFaceProfileVersion).toBe(
      SEYEON_FACE_PROFILE_VERSION_V1,
    );
    expect(bundle.delivery.sourceFaceProfileVersion).toBe(
      SEYEON_FACE_PROFILE_VERSION_V1,
    );
  });

  it('keeps capability bounded to production-neutral Face discovery', () => {
    const bundle =
      resolveCharacterFaceNamedProfileBundleV1('seyeon');
    expect(bundle).not.toBeNull();
    if (bundle === null) throw new Error('Seyeon profile bundle is required');

    expect(bundle.capability.allowedTopicKeys).toEqual([
      'face.discover.structure',
      'face.discover.extended',
    ]);
    expect(bundle.capability.allowedModes).toEqual([
      'neutral_fact_realization',
    ]);
    expect(bundle.capability.allowPartial).toBe(true);
    expect(bundle.capability.canInitiate).toBe(false);
  });

  it('uses neutral registry attention order instead of inventing Seyeon morphology preference', () => {
    const bundle =
      resolveCharacterFaceNamedProfileBundleV1('seyeon');
    expect(bundle).not.toBeNull();
    if (bundle === null) throw new Error('Seyeon profile bundle is required');

    expect(bundle.perspective.attentionOrder).toEqual(
      CHARACTER_FACE_ATTENTION_KEYS_V1,
    );
    expect(bundle.perspective.selection.maxUnits).toBe(3);
    expect(bundle.perspective.uncertaintyHandling).toBe('state_directly');
  });

  it('uses only code-owned soft delivery and Seyeon-authored question strategies', () => {
    const bundle =
      resolveCharacterFaceNamedProfileBundleV1('seyeon');
    expect(bundle).not.toBeNull();
    if (bundle === null) throw new Error('Seyeon profile bundle is required');

    expect(bundle.delivery.neutralFactStyle).toBe('soft_observation');
    expect(bundle.delivery.unavailableStyle).toBe('soft');

    expect(
      resolveCharacterFaceReactionFramingV1(bundle.delivery),
    ).toEqual({
      key: 'face_neutral_boundary_soft_v1',
      text:
        CHARACTER_FACE_SAFE_REACTION_FRAMING_V1
          .face_neutral_boundary_soft_v1,
    });

    expect(
      resolveCharacterFaceFollowUpFramingV1({
        profile: bundle.delivery,
        questionStrategy: 'activate_next_step',
      }),
    ).toEqual({
      key: 'face_question_detail_compact_v1',
      text:
        CHARACTER_FACE_SAFE_FOLLOW_UP_FRAMING_V1
          .face_question_detail_compact_v1,
    });

    const authoredStrategies = new Set(
      bundle.authoringSource.questioning.preferredStrategies,
    );
    expect(
      bundle.delivery.followUpFraming.every((entry) =>
        authoredStrategies.has(entry.questionStrategy),
      ),
    ).toBe(true);
  });

  it('fails closed on mixed identity or unauthorized follow-up strategy', () => {
    const bundle =
      resolveCharacterFaceNamedProfileBundleV1('seyeon');
    expect(bundle).not.toBeNull();
    if (bundle === null) throw new Error('Seyeon profile bundle is required');

    expect(() =>
      assertCharacterFaceNamedProfileCompatibilityV1({
        authoringSource: bundle.authoringSource,
        faceProfileVersion: SEYEON_FACE_PROFILE_VERSION_V1,
        capability: bundle.capability,
        governedCapability: bundle.governedCapability,
        perspective: bundle.perspective,
        delivery: {
          ...bundle.delivery,
          characterId: 'yeoul',
        },
      }),
    ).toThrow(CharacterFaceNamedProfileCompatibilityErrorV1);

    expect(() =>
      assertCharacterFaceNamedProfileCompatibilityV1({
        authoringSource: bundle.authoringSource,
        faceProfileVersion: SEYEON_FACE_PROFILE_VERSION_V1,
        capability: bundle.capability,
        governedCapability: bundle.governedCapability,
        perspective: bundle.perspective,
        delivery: {
          ...bundle.delivery,
          followUpFraming: [
            ...bundle.delivery.followUpFraming,
            {
              questionStrategy: 'invent_face_meaning',
              framingKey: 'face_question_detail_plain_v1',
            },
          ],
        },
      }),
    ).toThrow('not authored by the named Character source');
  });

  it('contains no semantic widening fields', () => {
    const bundle =
      resolveCharacterFaceNamedProfileBundleV1('seyeon');
    expect(bundle).not.toBeNull();
    if (bundle === null) throw new Error('Seyeon profile bundle is required');

    const serialized = JSON.stringify(bundle);
    for (const forbidden of [
      'personalityMapping',
      'fortuneMapping',
      'relationshipInference',
      'classificationRule',
      'threshold',
      'providerPrompt',
      'freeFormTemplate',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
