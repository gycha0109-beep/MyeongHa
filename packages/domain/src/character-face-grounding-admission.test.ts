import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  CharacterRuntimeContextV1,
} from './character-runtime-context.js';
import {
  CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1,
  CHARACTER_FACE_REALIZATION_MODE_V1,
  CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  admitCharacterFaceGroundingRefV1,
  admitCharacterRuntimeFaceGroundingV1,
} from './character-face-grounding-admission.js';
import {
  presentResearchFaceGroundingForCharacter,
  type CharacterFacePresentationModeV1,
  type ResearchCharacterFaceGroundingV1,
} from './character-face-presentation.js';

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

function makeRuntimeContext(
  characterId = 'character.alpha',
  relationshipRevision = 1,
): CharacterRuntimeContextV1 {
  return {
    characterId,
    relationship: {
      relationshipRevision,
    },
    saju: null,
  } as unknown as CharacterRuntimeContextV1;
}

function makeSource(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion:
      CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
    topicKey: 'face.discover.structure',
    readinessState: 'available',
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
    ...overrides,
  };
}

function makeGroundingRef(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion:
      FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
    topicKey: 'face.discover.structure',
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
    ...overrides,
  };
}

function makeResearchGrounding():
  ResearchCharacterFaceGroundingV1 {
  return {
    groundingVersion:
      'face-grounding-research-test-v1',
    faceReadingRef:
      'reading:research:test',
    faceEngineVersion:
      'face-research-engine-v1',
    methodologyPackRef:
      'face-fr3-research-pack-v0@0.1.0',
    semanticClaims: [
      {
        key:
          'face.five_officers.discernment.static_support.complete',
        pattern: 'complete',
        claimRef:
          'claim.research.five_officers.discernment.static_support.complete',
      },
    ],
    approvedNarrativeBlocks: [
      {
        key: 'face.research.framing',
        text:
          '연구 단계 관상 판독의 보호된 설명입니다.',
      },
      {
        key:
          'face.research.verdict.discernment_complete',
        text:
          '심변관이 중심을 잡는 연구 판독입니다.',
      },
      {
        key:
          'face.research.feature.discernment_bridge_straight',
        text:
          '코의 정적 조건이 선명하게 잡힙니다.',
      },
    ],
    unavailableSections: [],
    prohibitedInferences: [
      'medical_diagnosis',
      'biometric_identity',
    ],
    authorityState: 'research_only',
    assertionAuthority:
      'research_fixture',
    evidenceRefs: [
      'fixture:research:test',
    ],
    semanticSignature:
      'face-research-diagnosis@test',
  };
}

function profile(
  mode: CharacterFacePresentationModeV1,
  characterId: string,
) {
  return {
    schemaVersion: 'v1' as const,
    profileVersion:
      `face-presentation-${mode}-test-v1`,
    characterId,
    characterContentVersion:
      'character-content-test-v1',
    mode,
  };
}

describe(
  'TOPIC-FACE-005B production Face grounding admission',
  () => {
    it('admits the exact source-owned structure grounding identity', () => {
      const admitted =
        admitCharacterFaceGroundingRefV1({
          candidate:
            makeGroundingRef(),
          source: makeSource(),
        });

      expect(admitted).toEqual(
        makeGroundingRef(),
      );
      expect(
        Object.isFrozen(admitted),
      ).toBe(true);
    });

    it('attaches only the admitted ref and source readiness metadata to Character runtime context', () => {
      const result =
        admitCharacterRuntimeFaceGroundingV1(
          {
            context:
              makeRuntimeContext(),
            source: makeSource(),
            groundingRef:
              makeGroundingRef(),
          },
        );

      expect(result.face).toEqual({
        schemaVersion:
          CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1,
        topicKey:
          'face.discover.structure',
        readinessState: 'available',
        mode:
          'neutral_fact_realization',
        unavailableSections: [],
        groundingRef:
          makeGroundingRef(),
      });
      expect(
        Object.isFrozen(result),
      ).toBe(true);
      expect(
        Object.isFrozen(result.face),
      ).toBe(true);
      expect(
        Object.isFrozen(
          result.face?.groundingRef,
        ),
      ).toBe(true);
    });

    it('preserves partial readiness and unavailable forehead without inventing a value', () => {
      const unavailable = [
        'observation:forehead.visible_width_shape',
      ];
      const result =
        admitCharacterRuntimeFaceGroundingV1(
          {
            context:
              makeRuntimeContext(),
            source: makeSource({
              topicKey:
                'face.discover.extended',
              readinessState: 'partial',
              unavailableSections:
                unavailable,
            }),
            groundingRef:
              makeGroundingRef({
                topicKey:
                  'face.discover.extended',
              }),
          },
        );

      expect(
        result.face?.readinessState,
      ).toBe('partial');
      expect(
        result.face?.unavailableSections,
      ).toEqual(unavailable);
      expect(
        result.face?.groundingRef.topicKey,
      ).toBe(
        'face.discover.extended',
      );
    });

    it('keeps ordinary Character runtime contexts Face-neutral when no Face source exists', () => {
      const context =
        makeRuntimeContext();
      const admitted =
        admitCharacterRuntimeFaceGroundingV1(
          { context },
        );

      expect(admitted.face).toBeNull();
      expect(
        admitted.characterId,
      ).toBe(context.characterId);
    });

    it('rejects a grounding ref without an active Face source binding', () => {
      expect(() =>
        admitCharacterRuntimeFaceGroundingV1(
          {
            context:
              makeRuntimeContext(),
            groundingRef:
              makeGroundingRef(),
          },
        ),
      ).toThrow(
        'without an active Face source binding',
      );
    });

    it('rejects an active Face source when its admitted grounding ref is missing', () => {
      expect(() =>
        admitCharacterRuntimeFaceGroundingV1(
          {
            context:
              makeRuntimeContext(),
            source: makeSource(),
          },
        ),
      ).toThrow(
        'requires an admitted Character Face grounding ref',
      );
    });

    it('rejects blocked, failed, or caller-invented source readiness instead of treating it as Character input', () => {
      for (const readinessState of [
        'blocked',
        'failed',
        'pending',
      ]) {
        expect(() =>
          admitCharacterRuntimeFaceGroundingV1(
            {
              context:
                makeRuntimeContext(),
              source: makeSource({
                readinessState,
              }),
              groundingRef:
                makeGroundingRef(),
            },
          ),
        ).toThrow(
          'readinessState must be available or partial',
        );
      }
    });

    it('rejects unsupported source and grounding contract versions', () => {
      expect(() =>
        admitCharacterFaceGroundingRefV1(
          {
            candidate:
              makeGroundingRef({
                schemaVersion:
                  'face-character-grounding-ref-v2',
              }),
            source: makeSource(),
          },
        ),
      ).toThrow(
        'schemaVersion is not supported',
      );

      expect(() =>
        admitCharacterFaceGroundingRefV1(
          {
            candidate:
              makeGroundingRef({
                projectionVersion:
                  'face-character-grounding-projection-v2',
              }),
            source: makeSource(),
          },
        ),
      ).toThrow(
        'projection version is not supported',
      );

      expect(() =>
        admitCharacterFaceGroundingRefV1(
          {
            candidate:
              makeGroundingRef(),
            source: makeSource({
              projectionVersion:
                'face-character-grounding-projection-v2',
            }),
          },
        ),
      ).toThrow(
        'source projection version is not supported',
      );
    });

    it('rejects a self-consistent wire-shaped ref when any active source identity differs', () => {
      const cases = [
        {
          field: 'topicKey',
          value:
            'face.discover.forged',
        },
        {
          field:
            'sourceResultHash',
          value:
            `face-topic-source-result:${'1'.repeat(
              64,
            )}`,
        },
        {
          field: 'projectionHash',
          value:
            `face-product-projection:${'2'.repeat(
              64,
            )}`,
        },
        {
          field: 'groundingHash',
          value:
            `face-grounding:${'3'.repeat(
              64,
            )}`,
        },
        {
          field:
            'displayFactsHash',
          value:
            `face-display-facts:${'4'.repeat(
              64,
            )}`,
        },
        {
          field: 'bundleHash',
          value:
            `face-character-grounding:${'5'.repeat(
              64,
            )}`,
        },
      ] as const;

      for (
        const { field, value }
        of cases
      ) {
        expect(() =>
          admitCharacterFaceGroundingRefV1(
            {
              candidate:
                makeGroundingRef({
                  [field]: value,
                }),
              source: makeSource(),
            },
          ),
        ).toThrow(
          `${field} does not match the active Face source binding`,
        );
      }
    });

    it('rejects malformed or wrong-prefix protected hashes', () => {
      for (const [
        field,
        value,
      ] of [
        [
          'sourceResultHash',
          `face-topic-source-result:${'A'.repeat(
            64,
          )}`,
        ],
        [
          'projectionHash',
          `face-product-projection:${'b'.repeat(
            63,
          )}`,
        ],
        [
          'groundingHash',
          `face-product-projection:${'c'.repeat(
            64,
          )}`,
        ],
        [
          'displayFactsHash',
          'not-a-hash',
        ],
        [
          'bundleHash',
          'e'.repeat(64),
        ],
      ] as const) {
        expect(() =>
          admitCharacterFaceGroundingRefV1(
            {
              candidate:
                makeGroundingRef({
                  [field]: value,
                }),
              source: makeSource(),
            },
          ),
        ).toThrow();
      }
    });

    it('rejects semantic units, privacy material, Character metadata, Commerce metadata, and request metadata on the source ref', () => {
      for (const injected of [
        {
          units: [
            {
              unitId:
                'forbidden',
            },
          ],
        },
        {
          rawImage:
            'data:image/jpeg;base64,forbidden',
        },
        {
          rawLandmarks: [
            [0.1, 0.2],
          ],
        },
        {
          faceEmbedding: [0.1],
        },
        {
          characterId:
            'character:forbidden',
        },
        {
          relationshipState:
            'forbidden',
        },
        {
          personaVersion:
            'forbidden',
        },
        {
          price: 9900,
        },
        {
          offer: 'forbidden',
        },
        {
          entitlement: true,
        },
        {
          requestId:
            'request:forbidden',
        },
      ]) {
        expect(() =>
          admitCharacterFaceGroundingRefV1(
            {
              candidate: {
                ...makeGroundingRef(),
                ...injected,
              },
              source: makeSource(),
            },
          ),
        ).toThrow(
          'contains unexpected field',
        );
      }
    });

    it('rejects semantic, Character, Commerce, and privacy widening on the server source binding', () => {
      for (const injected of [
        {
          semanticClaims: [
            'forbidden',
          ],
        },
        {
          personality:
            'forbidden',
        },
        {
          rawImage:
            'forbidden',
        },
        {
          characterId:
            'character:forbidden',
        },
        {
          relationshipState:
            'forbidden',
        },
        {
          price: 9900,
        },
      ]) {
        expect(() =>
          admitCharacterRuntimeFaceGroundingV1(
            {
              context:
                makeRuntimeContext(),
              source: {
                ...makeSource(),
                ...injected,
              },
              groundingRef:
                makeGroundingRef(),
            },
          ),
        ).toThrow(
          'source binding contains unexpected field',
        );
      }
    });

    it('keeps the same source grounding identity across Character and relationship changes', () => {
      const alpha =
        admitCharacterRuntimeFaceGroundingV1(
          {
            context:
              makeRuntimeContext(
                'character.alpha',
                1,
              ),
            source: makeSource(),
            groundingRef:
              makeGroundingRef(),
          },
        );
      const beta =
        admitCharacterRuntimeFaceGroundingV1(
          {
            context:
              makeRuntimeContext(
                'character.beta',
                99,
              ),
            source: makeSource(),
            groundingRef:
              makeGroundingRef(),
          },
        );

      expect(
        alpha.characterId,
      ).not.toBe(beta.characterId);
      expect(
        alpha.face?.groundingRef,
      ).toEqual(
        beta.face?.groundingRef,
      );
    });

    it('does not admit legacy research-only Face grounding into the production-neutral path', () => {
      expect(() =>
        admitCharacterFaceGroundingRefV1(
          {
            candidate:
              makeResearchGrounding(),
            source: makeSource(),
          },
        ),
      ).toThrow(
        'contains unexpected field',
      );
    });

    it('does not let a production-neutral ref enter the research-only Face renderer', () => {
      expect(() =>
        presentResearchFaceGroundingForCharacter(
          {
            grounding:
              makeGroundingRef() as unknown as ResearchCharacterFaceGroundingV1,
            character: {
              characterId:
                'character.alpha',
              contentVersion:
                'character-content-test-v1',
            },
            profile: profile(
              'strongest_first',
              'character.alpha',
            ),
          },
        ),
      ).toThrow(
        'Unsupported Face grounding authority state',
      );
    });
  },
);
