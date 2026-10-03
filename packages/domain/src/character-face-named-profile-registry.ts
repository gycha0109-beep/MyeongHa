import {
  CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
  CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFaceCapabilityProfileV1,
  type CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import {
  CHARACTER_FACE_DELIVERY_LOCALE_V1,
  CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFaceDeliveryProfileV1,
  type CharacterFaceDeliveryProfileV1,
} from './character-face-delivery-profile.js';
import {
  CHARACTER_FACE_REALIZATION_MODE_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
} from './character-face-grounding-admission.js';
import {
  resolveCharacterFaceNamedAuthoringSourceV1,
  type CharacterFaceNamedAuthoringSourceV1,
} from './character-face-named-authoring-source.js';
import {
  CHARACTER_FACE_ATTENTION_KEYS_V1,
  CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
  CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFacePerspectiveProfileV1,
  assertCharacterFacePerspectiveCapabilityCompatibilityV1,
  type CharacterFacePerspectiveProfileV1,
} from './character-face-perspective.js';

export const CHARACTER_FACE_NAMED_PROFILE_REGISTRY_VERSION_V1 =
  'character-face-named-profile-registry-v1' as const;

export const SEYEON_FACE_PROFILE_VERSION_V1 =
  'seyeon-face-profile-v1' as const;

export interface CharacterFaceNamedProfileBundleV1 {
  readonly registryVersion:
    typeof CHARACTER_FACE_NAMED_PROFILE_REGISTRY_VERSION_V1;
  readonly authoringSource: CharacterFaceNamedAuthoringSourceV1;
  readonly capability: CharacterFaceCapabilityProfileV1;
  readonly perspective: CharacterFacePerspectiveProfileV1;
  readonly delivery: CharacterFaceDeliveryProfileV1;
}

export class CharacterFaceNamedProfileCompatibilityErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterFaceNamedProfileCompatibilityErrorV1';
  }
}

function fail(message: string): never {
  throw new CharacterFaceNamedProfileCompatibilityErrorV1(message);
}

function assertIdentity(
  label: string,
  characterId: string,
  contentVersion: string,
  faceProfileVersion: string,
  source: CharacterFaceNamedAuthoringSourceV1,
  expectedFaceProfileVersion: string,
): void {
  if (characterId !== source.characterId) {
    fail(`${label} characterId does not match the named Character authoring source.`);
  }
  if (contentVersion !== source.contentVersion) {
    fail(`${label} contentVersion does not match the named Character authoring source.`);
  }
  if (faceProfileVersion !== expectedFaceProfileVersion) {
    fail(`${label} faceProfileVersion does not match the named profile bundle.`);
  }
}

export function assertCharacterFaceNamedProfileCompatibilityV1(
  input: Readonly<{
    authoringSource: CharacterFaceNamedAuthoringSourceV1;
    faceProfileVersion: string;
    capability: CharacterFaceCapabilityProfileV1;
    perspective: CharacterFacePerspectiveProfileV1;
    delivery: CharacterFaceDeliveryProfileV1;
  }>,
): void {
  assertCharacterFacePerspectiveCapabilityCompatibilityV1({
    capability: input.capability,
    perspective: input.perspective,
  });

  assertIdentity(
    'Capability',
    input.capability.characterId,
    input.capability.sourceContentVersion,
    input.capability.sourceFaceProfileVersion,
    input.authoringSource,
    input.faceProfileVersion,
  );
  assertIdentity(
    'Perspective',
    input.perspective.characterId,
    input.perspective.sourceContentVersion,
    input.perspective.sourceFaceProfileVersion,
    input.authoringSource,
    input.faceProfileVersion,
  );
  assertIdentity(
    'Delivery',
    input.delivery.characterId,
    input.delivery.sourceContentVersion,
    input.delivery.sourceFaceProfileVersion,
    input.authoringSource,
    input.faceProfileVersion,
  );

  const preferredStrategies = new Set(
    input.authoringSource.questioning.preferredStrategies,
  );
  for (const binding of input.delivery.followUpFraming) {
    if (!preferredStrategies.has(binding.questionStrategy)) {
      fail(
        `Delivery follow-up strategy is not authored by the named Character source: ${binding.questionStrategy}`,
      );
    }
  }
}

function buildSeyeonBundle(): CharacterFaceNamedProfileBundleV1 | null {
  const authoringSource =
    resolveCharacterFaceNamedAuthoringSourceV1('seyeon');
  if (authoringSource === null) return null;

  const faceProfileVersion = SEYEON_FACE_PROFILE_VERSION_V1;

  const capabilitySource = Object.freeze({
    schemaVersion:
      CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
    capabilityVersion:
      'seyeon-face-capability-v1',
    characterId: authoringSource.characterId,
    contentVersion: authoringSource.contentVersion,
    faceProfileVersion,
    allowedTopicKeys: Object.freeze([
      'face.discover.structure',
      'face.discover.extended',
    ] as const),
    allowedModes: Object.freeze([
      CHARACTER_FACE_REALIZATION_MODE_V1,
    ] as const),
    allowPartial: true,
    canInitiate: false,
  });

  const capability =
    admitCharacterFaceCapabilityProfileV1({
      source: capabilitySource,
      candidate: {
        schemaVersion:
          CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
        capabilityVersion:
          capabilitySource.capabilityVersion,
        characterId:
          capabilitySource.characterId,
        sourceContentVersion:
          capabilitySource.contentVersion,
        sourceFaceProfileVersion:
          capabilitySource.faceProfileVersion,
        allowedTopicKeys:
          capabilitySource.allowedTopicKeys,
        allowedModes:
          capabilitySource.allowedModes,
        allowPartial:
          capabilitySource.allowPartial,
        canInitiate:
          capabilitySource.canInitiate,
      },
    });

  const perspectiveSource = Object.freeze({
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
    perspectiveVersion:
      'seyeon-face-perspective-v1',
    characterId: authoringSource.characterId,
    contentVersion: authoringSource.contentVersion,
    faceProfileVersion,
    attentionOrder:
      CHARACTER_FACE_ATTENTION_KEYS_V1,
    maxUnits: 3,
    uncertaintyHandling:
      'state_directly' as const,
  });

  const perspective =
    admitCharacterFacePerspectiveProfileV1({
      source: perspectiveSource,
      candidate: {
        schemaVersion:
          CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1,
        perspectiveVersion:
          perspectiveSource.perspectiveVersion,
        characterId:
          perspectiveSource.characterId,
        sourceContentVersion:
          perspectiveSource.contentVersion,
        sourceFaceProfileVersion:
          perspectiveSource.faceProfileVersion,
        groundingProjectionVersion:
          FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
        attentionRegistryVersion:
          CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
        attentionOrder:
          perspectiveSource.attentionOrder,
        selection: {
          maxUnits:
            perspectiveSource.maxUnits,
          avoidDuplicateCapability: true,
          preserveSourceOrderForTies: true,
        },
        uncertaintyHandling:
          perspectiveSource.uncertaintyHandling,
        deliveryAuthority: {
          speech:
            'published_character_speech',
          communication:
            'published_character_persona_communication',
          relationship:
            'active_relationship_projection',
        },
      },
    });

  const deliverySource = Object.freeze({
    schemaVersion:
      CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
    deliveryVersion:
      'seyeon-face-delivery-v1',
    characterId: authoringSource.characterId,
    contentVersion: authoringSource.contentVersion,
    faceProfileVersion,
    locale:
      CHARACTER_FACE_DELIVERY_LOCALE_V1,
    neutralFactStyle:
      'soft_observation' as const,
    unavailableStyle:
      'soft' as const,
    reactionFramingKey:
      'face_neutral_boundary_soft_v1' as const,
    followUpFraming: Object.freeze([
      Object.freeze({
        questionStrategy:
          'activate_next_step',
        framingKey:
          'face_question_detail_compact_v1' as const,
      }),
      Object.freeze({
        questionStrategy:
          'clarify_boundary',
        framingKey:
          'face_question_detail_plain_v1' as const,
      }),
    ]),
  });

  const delivery =
    admitCharacterFaceDeliveryProfileV1({
      source: deliverySource,
      candidate: {
        schemaVersion:
          CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
        deliveryVersion:
          deliverySource.deliveryVersion,
        characterId:
          deliverySource.characterId,
        sourceContentVersion:
          deliverySource.contentVersion,
        sourceFaceProfileVersion:
          deliverySource.faceProfileVersion,
        locale:
          deliverySource.locale,
        neutralFactStyle:
          deliverySource.neutralFactStyle,
        unavailableStyle:
          deliverySource.unavailableStyle,
        reactionFramingKey:
          deliverySource.reactionFramingKey,
        followUpFraming:
          deliverySource.followUpFraming,
      },
    });

  assertCharacterFaceNamedProfileCompatibilityV1({
    authoringSource,
    faceProfileVersion,
    capability,
    perspective,
    delivery,
  });

  return Object.freeze({
    registryVersion:
      CHARACTER_FACE_NAMED_PROFILE_REGISTRY_VERSION_V1,
    authoringSource,
    capability,
    perspective,
    delivery,
  });
}

const SEYEON_PROFILE_BUNDLE = buildSeyeonBundle();

export function resolveCharacterFaceNamedProfileBundleV1(
  characterId: string,
): CharacterFaceNamedProfileBundleV1 | null {
  if (characterId !== 'seyeon') return null;
  return SEYEON_PROFILE_BUNDLE;
}
