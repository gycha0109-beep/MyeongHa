import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_SAFE_FOLLOW_UP_FRAMING_V1,
  CHARACTER_FACE_SAFE_REACTION_FRAMING_V1,
  admitCharacterFaceDeliveryProfileV1,
  admitCharacterFaceDeliverySourceV1,
  resolveCharacterFaceFollowUpFramingV1,
  resolveCharacterFaceReactionFramingV1,
} from './character-face-delivery-profile.js';

function source(
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion:
      CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
    deliveryVersion:
      'face-delivery-fixture-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-v1',
    locale: 'ko-KR',
    neutralFactStyle:
      'soft_observation',
    unavailableStyle: 'soft',
    reactionFramingKey:
      'face_neutral_boundary_soft_v1',
    followUpFraming: [
      {
        questionStrategy:
          'ask_current_context',
        framingKey:
          'face_question_detail_plain_v1',
      },
    ],
    ...overrides,
  };
}

function candidate(
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion:
      CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
    deliveryVersion:
      'face-delivery-fixture-v1',
    characterId:
      'character.alpha',
    sourceContentVersion:
      'character-content-alpha-v1',
    sourceFaceProfileVersion:
      'face-profile-alpha-v1',
    locale: 'ko-KR',
    neutralFactStyle:
      'soft_observation',
    unavailableStyle: 'soft',
    reactionFramingKey:
      'face_neutral_boundary_soft_v1',
    followUpFraming: [
      {
        questionStrategy:
          'ask_current_context',
        framingKey:
          'face_question_detail_plain_v1',
      },
    ],
    ...overrides,
  };
}

describe(
  'TOPIC-FACE-005F-A Face delivery profile',
  () => {
    it('admits an exact source-backed bounded delivery profile', () => {
      const profile =
        admitCharacterFaceDeliveryProfileV1({
          source: source(),
          candidate: candidate(),
        });

      expect(profile).toEqual(
        candidate(),
      );
      expect(
        Object.isFrozen(profile),
      ).toBe(true);
      expect(
        Object.isFrozen(
          profile.followUpFraming,
        ),
      ).toBe(true);
    });

    it('resolves only code-owned safe reaction and follow-up framing', () => {
      const profile =
        admitCharacterFaceDeliveryProfileV1({
          source: source(),
          candidate: candidate(),
        });

      expect(
        resolveCharacterFaceReactionFramingV1(
          profile,
        ),
      ).toEqual({
        key:
          'face_neutral_boundary_soft_v1',
        text:
          CHARACTER_FACE_SAFE_REACTION_FRAMING_V1
            .face_neutral_boundary_soft_v1,
      });

      expect(
        resolveCharacterFaceFollowUpFramingV1({
          profile,
          questionStrategy:
            'ask_current_context',
        }),
      ).toEqual({
        key:
          'face_question_detail_plain_v1',
        text:
          CHARACTER_FACE_SAFE_FOLLOW_UP_FRAMING_V1
            .face_question_detail_plain_v1,
      });

      expect(
        resolveCharacterFaceFollowUpFramingV1({
          profile,
          questionStrategy:
            'not-authored',
        }),
      ).toBeNull();
    });

    it('rejects unsupported styles, locale, and arbitrary framing keys', () => {
      for (const invalidSource of [
        source({
          neutralFactStyle:
            'interpretive',
        }),
        source({
          unavailableStyle:
            'guess',
        }),
        source({
          locale: 'en-US',
        }),
        source({
          reactionFramingKey:
            'custom-free-prose',
        }),
        source({
          followUpFraming: [
            {
              questionStrategy:
                'ask_current_context',
              framingKey:
                'custom-free-prose',
            },
          ],
        }),
      ]) {
        expect(() =>
          admitCharacterFaceDeliverySourceV1(
            invalidSource,
          ),
        ).toThrow();
      }
    });

    it('rejects duplicate follow-up strategies', () => {
      expect(() =>
        admitCharacterFaceDeliverySourceV1(
          source({
            followUpFraming: [
              {
                questionStrategy:
                  'ask_current_context',
                framingKey:
                  'face_question_detail_plain_v1',
              },
              {
                questionStrategy:
                  'ask_current_context',
                framingKey:
                  'face_question_detail_compact_v1',
              },
            ],
          }),
        ),
      ).toThrow(
        'duplicate question strategies',
      );
    });

    it('rejects stale or cross-Character profile identity', () => {
      expect(() =>
        admitCharacterFaceDeliveryProfileV1({
          source: source(),
          candidate:
            candidate({
              characterId:
                'character.beta',
            }),
        }),
      ).toThrow(
        'characterId does not match',
      );

      expect(() =>
        admitCharacterFaceDeliveryProfileV1({
          source: source(),
          candidate:
            candidate({
              sourceContentVersion:
                'stale',
            }),
        }),
      ).toThrow(
        'contentVersion is stale',
      );

      expect(() =>
        admitCharacterFaceDeliveryProfileV1({
          source: source(),
          candidate:
            candidate({
              sourceFaceProfileVersion:
                'stale',
            }),
        }),
      ).toThrow(
        'faceProfileVersion is stale',
      );
    });

    it('rejects semantic, relationship, Commerce, arbitrary template, and provider widening', () => {
      for (const injected of [
        {
          template:
            '{value} means personality',
        },
        {
          classificationRule:
            'large',
        },
        {
          personalityMapping:
            'forbidden',
        },
        {
          fortuneMapping:
            'forbidden',
        },
        {
          relationshipState:
            'forbidden',
        },
        {
          price: 9900,
        },
        {
          entitlement: true,
        },
        {
          providerPrompt:
            'write freely',
        },
      ]) {
        expect(() =>
          admitCharacterFaceDeliveryProfileV1({
            source: source(),
            candidate: {
              ...candidate(),
              ...injected,
            },
          }),
        ).toThrow(
          'contains unexpected field',
        );
      }
    });
  },
);
