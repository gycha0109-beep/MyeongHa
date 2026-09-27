import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  CharacterRuntimeContextV1,
} from './character-runtime-context.js';
import {
  CHARACTER_FACE_REALIZATION_MODE_V1,
  CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  admitCharacterRuntimeFaceGroundingV1,
  type CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';
import {
  assertCharacterFaceVoiceRuntimeInvariantV1,
} from './character-face-voice-authority.js';

const SOURCE_RESULT_HASH =
  `face-topic-source-result:${'a'.repeat(64)}`;
const PROJECTION_HASH =
  `face-product-projection:${'b'.repeat(64)}`;
const GROUNDING_HASH =
  `face-grounding:${'c'.repeat(64)}`;
const DISPLAY_FACTS_HASH =
  `face-display-facts:${'d'.repeat(64)}`;
const BUNDLE_HASH =
  `face-character-grounding:${'e'.repeat(64)}`;

function baseContext():
  CharacterRuntimeContextV1 {
  const speech = Object.freeze({});
  const communication =
    Object.freeze({});

  return {
    schemaVersion: 'v1',
    characterId:
      'character.alpha',
    contentBundleId:
      'character-content-bundle-test-v1',
    contentVersion:
      'character-content-alpha-v1',
    speech,
    voiceAuthority: {
      characterId:
        'character.alpha',
      surface:
        'general_chat',
      source:
        'published_character_content',
      contentVersion:
        'character-content-alpha-v1',
      speech,
      communication,
    },
    persona: {
      communication,
    },
    relationship: {
      relationshipRevision: 1,
      relationshipPolicyVersion:
        'relationship-policy-test-v1',
      projectionPolicyVersion:
        'projection-policy-test-v1',
      behaviorVersion:
        'relationship-behavior-test-v1',
    },
    saju: null,
  } as unknown as CharacterRuntimeContextV1;
}

function admitted():
  CharacterRuntimeContextWithFaceGroundingV1 {
  return admitCharacterRuntimeFaceGroundingV1({
    context: baseContext(),
    source: {
      schemaVersion:
        CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
      topicKey:
        'face.discover.structure',
      readinessState:
        'available',
      mode:
        CHARACTER_FACE_REALIZATION_MODE_V1,
      sourceResultHash:
        SOURCE_RESULT_HASH,
      projectionHash:
        PROJECTION_HASH,
      groundingHash:
        GROUNDING_HASH,
      displayFactsHash:
        DISPLAY_FACTS_HASH,
      bundleHash:
        BUNDLE_HASH,
      projectionVersion:
        FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
      unavailableSections: [],
    },
    groundingRef: {
      schemaVersion:
        FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
      topicKey:
        'face.discover.structure',
      sourceResultHash:
        SOURCE_RESULT_HASH,
      projectionHash:
        PROJECTION_HASH,
      groundingHash:
        GROUNDING_HASH,
      displayFactsHash:
        DISPLAY_FACTS_HASH,
      bundleHash:
        BUNDLE_HASH,
      projectionVersion:
        FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    },
  });
}

describe(
  'TOPIC-FACE-005F-A Face voice authority',
  () => {
    it('rebinds an admitted Face runtime to face_product while preserving the exact published voice objects', () => {
      const before =
        baseContext();
      const after =
        admitCharacterRuntimeFaceGroundingV1({
          context: before,
          source: {
            schemaVersion:
              CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
            topicKey:
              'face.discover.structure',
            readinessState:
              'available',
            mode:
              CHARACTER_FACE_REALIZATION_MODE_V1,
            sourceResultHash:
              SOURCE_RESULT_HASH,
            projectionHash:
              PROJECTION_HASH,
            groundingHash:
              GROUNDING_HASH,
            displayFactsHash:
              DISPLAY_FACTS_HASH,
            bundleHash:
              BUNDLE_HASH,
            projectionVersion:
              FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
            unavailableSections: [],
          },
          groundingRef: {
            schemaVersion:
              FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
            topicKey:
              'face.discover.structure',
            sourceResultHash:
              SOURCE_RESULT_HASH,
            projectionHash:
              PROJECTION_HASH,
            groundingHash:
              GROUNDING_HASH,
            displayFactsHash:
              DISPLAY_FACTS_HASH,
            bundleHash:
              BUNDLE_HASH,
            projectionVersion:
              FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
          },
        });

      expect(
        after.voiceAuthority.surface,
      ).toBe('face_product');
      expect(
        after.voiceAuthority.speech,
      ).toBe(before.speech);
      expect(
        after.voiceAuthority.communication,
      ).toBe(
        before.persona.communication,
      );
      expect(() =>
        assertCharacterFaceVoiceRuntimeInvariantV1(
          after,
        ),
      ).not.toThrow();
    });

    it('fails closed when Face is absent or the surface is not face_product', () => {
      const valid = admitted();

      expect(() =>
        assertCharacterFaceVoiceRuntimeInvariantV1({
          ...valid,
          face: null,
        }),
      ).toThrow(
        'requires a Face-bearing runtime context',
      );

      expect(() =>
        assertCharacterFaceVoiceRuntimeInvariantV1({
          ...valid,
          voiceAuthority: {
            ...valid.voiceAuthority,
            surface: 'general_chat',
          },
        }),
      ).toThrow(
        'surface must be face_product',
      );
    });

    it('fails closed on cross-Character or stale content authority', () => {
      const valid = admitted();

      expect(() =>
        assertCharacterFaceVoiceRuntimeInvariantV1({
          ...valid,
          voiceAuthority: {
            ...valid.voiceAuthority,
            characterId:
              'character.beta',
          },
        }),
      ).toThrow(
        'does not match the active Character',
      );

      expect(() =>
        assertCharacterFaceVoiceRuntimeInvariantV1({
          ...valid,
          voiceAuthority: {
            ...valid.voiceAuthority,
            contentVersion:
              'stale-content',
          },
        }),
      ).toThrow(
        'content version',
      );
    });

    it('fails closed when published speech or communication objects are cloned or swapped', () => {
      const valid = admitted();

      expect(() =>
        assertCharacterFaceVoiceRuntimeInvariantV1({
          ...valid,
          voiceAuthority: {
            ...valid.voiceAuthority,
            speech:
              {} as unknown as typeof valid.speech,
          },
        }),
      ).toThrow(
        'exact published Character speech object',
      );

      expect(() =>
        assertCharacterFaceVoiceRuntimeInvariantV1({
          ...valid,
          voiceAuthority: {
            ...valid.voiceAuthority,
            communication:
              {} as unknown as typeof valid.persona.communication,
          },
        }),
      ).toThrow(
        'exact published Character communication object',
      );
    });
  },
);
