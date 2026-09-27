export const CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1 =
  'character-face-delivery-source-v1' as const;

export const CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1 =
  'character-face-delivery-profile-v1' as const;

export const CHARACTER_FACE_DELIVERY_LOCALE_V1 =
  'ko-KR' as const;

export const CHARACTER_FACE_NEUTRAL_FACT_STYLES_V1 =
  Object.freeze([
    'plain',
    'soft_observation',
    'compact',
  ] as const);

export const CHARACTER_FACE_UNAVAILABLE_STYLES_V1 =
  Object.freeze([
    'direct',
    'soft',
  ] as const);

export const CHARACTER_FACE_SAFE_REACTION_FRAMING_V1 =
  Object.freeze({
    face_neutral_boundary_plain_v1:
      '여기까지는 얼굴에서 직접 확인되는 정보만 정리했습니다.',
    face_neutral_boundary_soft_v1:
      '여기까지는 얼굴에서 직접 확인되는 정보만 정리했어요.',
  } as const);

export const CHARACTER_FACE_SAFE_FOLLOW_UP_FRAMING_V1 =
  Object.freeze({
    face_question_detail_plain_v1:
      '이 중에서 더 자세히 보고 싶은 부분이 있나요?',
    face_question_detail_compact_v1:
      '어느 항목을 더 볼까요?',
  } as const);

export type CharacterFaceNeutralFactStyleV1 =
  (typeof CHARACTER_FACE_NEUTRAL_FACT_STYLES_V1)[number];

export type CharacterFaceUnavailableStyleV1 =
  (typeof CHARACTER_FACE_UNAVAILABLE_STYLES_V1)[number];

export type CharacterFaceSafeReactionFramingKeyV1 =
  keyof typeof CHARACTER_FACE_SAFE_REACTION_FRAMING_V1;

export type CharacterFaceSafeFollowUpFramingKeyV1 =
  keyof typeof CHARACTER_FACE_SAFE_FOLLOW_UP_FRAMING_V1;

export interface CharacterFaceFollowUpFramingBindingV1 {
  readonly questionStrategy: string;
  readonly framingKey:
    CharacterFaceSafeFollowUpFramingKeyV1;
}

export interface CharacterFaceDeliverySourceV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1;
  readonly deliveryVersion: string;
  readonly characterId: string;
  readonly contentVersion: string;
  readonly faceProfileVersion: string;
  readonly locale:
    typeof CHARACTER_FACE_DELIVERY_LOCALE_V1;
  readonly neutralFactStyle:
    CharacterFaceNeutralFactStyleV1;
  readonly unavailableStyle:
    CharacterFaceUnavailableStyleV1;
  readonly reactionFramingKey:
    CharacterFaceSafeReactionFramingKeyV1;
  readonly followUpFraming:
    readonly CharacterFaceFollowUpFramingBindingV1[];
}

export interface CharacterFaceDeliveryProfileV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1;
  readonly deliveryVersion: string;
  readonly characterId: string;
  readonly sourceContentVersion: string;
  readonly sourceFaceProfileVersion: string;
  readonly locale:
    typeof CHARACTER_FACE_DELIVERY_LOCALE_V1;
  readonly neutralFactStyle:
    CharacterFaceNeutralFactStyleV1;
  readonly unavailableStyle:
    CharacterFaceUnavailableStyleV1;
  readonly reactionFramingKey:
    CharacterFaceSafeReactionFramingKeyV1;
  readonly followUpFraming:
    readonly CharacterFaceFollowUpFramingBindingV1[];
}

export class CharacterFaceDeliveryProfileAdmissionErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name =
      'CharacterFaceDeliveryProfileAdmissionErrorV1';
  }
}

const SOURCE_KEYS = Object.freeze([
  'schemaVersion',
  'deliveryVersion',
  'characterId',
  'contentVersion',
  'faceProfileVersion',
  'locale',
  'neutralFactStyle',
  'unavailableStyle',
  'reactionFramingKey',
  'followUpFraming',
] as const);

const PROFILE_KEYS = Object.freeze([
  'schemaVersion',
  'deliveryVersion',
  'characterId',
  'sourceContentVersion',
  'sourceFaceProfileVersion',
  'locale',
  'neutralFactStyle',
  'unavailableStyle',
  'reactionFramingKey',
  'followUpFraming',
] as const);

const FOLLOW_UP_KEYS = Object.freeze([
  'questionStrategy',
  'framingKey',
] as const);

function fail(message: string): never {
  throw new CharacterFaceDeliveryProfileAdmissionErrorV1(
    message,
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function requireRecord(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`${path} must be an object.`);
  }
  return value;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet =
    new Set(allowed);
  const unexpected =
    Object.keys(value).find(
      (key) =>
        !allowedSet.has(key),
    );
  if (unexpected !== undefined) {
    fail(
      `${path} contains unexpected field: ${unexpected}.`,
    );
  }
}

function requireString(
  value: unknown,
  path: string,
  maxLength = 512,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    fail(
      `${path} must be a non-empty bounded string.`,
    );
  }
  return value;
}

function requireNeutralFactStyle(
  value: unknown,
  path: string,
): CharacterFaceNeutralFactStyleV1 {
  if (
    typeof value !== 'string' ||
    !(
      CHARACTER_FACE_NEUTRAL_FACT_STYLES_V1 as readonly string[]
    ).includes(value)
  ) {
    fail(
      `${path} is not a supported bounded neutral fact style.`,
    );
  }
  return value as CharacterFaceNeutralFactStyleV1;
}

function requireUnavailableStyle(
  value: unknown,
  path: string,
): CharacterFaceUnavailableStyleV1 {
  if (
    typeof value !== 'string' ||
    !(
      CHARACTER_FACE_UNAVAILABLE_STYLES_V1 as readonly string[]
    ).includes(value)
  ) {
    fail(
      `${path} is not a supported unavailable style.`,
    );
  }
  return value as CharacterFaceUnavailableStyleV1;
}

function requireReactionFramingKey(
  value: unknown,
  path: string,
): CharacterFaceSafeReactionFramingKeyV1 {
  if (
    typeof value !== 'string' ||
    !(value in
      CHARACTER_FACE_SAFE_REACTION_FRAMING_V1)
  ) {
    fail(
      `${path} is not a code-owned safe reaction framing key.`,
    );
  }
  return value as CharacterFaceSafeReactionFramingKeyV1;
}

function requireFollowUpFramingKey(
  value: unknown,
  path: string,
): CharacterFaceSafeFollowUpFramingKeyV1 {
  if (
    typeof value !== 'string' ||
    !(value in
      CHARACTER_FACE_SAFE_FOLLOW_UP_FRAMING_V1)
  ) {
    fail(
      `${path} is not a code-owned safe follow-up framing key.`,
    );
  }
  return value as CharacterFaceSafeFollowUpFramingKeyV1;
}

function requireFollowUpFraming(
  value: unknown,
  path: string,
): readonly CharacterFaceFollowUpFramingBindingV1[] {
  if (!Array.isArray(value)) {
    fail(
      `${path} must be an array.`,
    );
  }

  const bindings =
    value.map(
      (entry, index) => {
        const record =
          requireRecord(
            entry,
            `${path}[${index}]`,
          );
        assertOnlyKeys(
          record,
          FOLLOW_UP_KEYS,
          `${path}[${index}]`,
        );

        return Object.freeze({
          questionStrategy:
            requireString(
              record.questionStrategy,
              `${path}[${index}].questionStrategy`,
              256,
            ),
          framingKey:
            requireFollowUpFramingKey(
              record.framingKey,
              `${path}[${index}].framingKey`,
            ),
        });
      },
    );

  const strategies =
    bindings.map(
      (binding) =>
        binding.questionStrategy,
    );
  if (
    new Set(strategies).size !==
    strategies.length
  ) {
    fail(
      `${path} must not contain duplicate question strategies.`,
    );
  }

  return Object.freeze(
    bindings,
  );
}

function sameBindings(
  left:
    readonly CharacterFaceFollowUpFramingBindingV1[],
  right:
    readonly CharacterFaceFollowUpFramingBindingV1[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (binding, index) =>
        binding.questionStrategy ===
          right[index]
            ?.questionStrategy &&
        binding.framingKey ===
          right[index]
            ?.framingKey,
    )
  );
}

export function admitCharacterFaceDeliverySourceV1(
  candidate: unknown,
): CharacterFaceDeliverySourceV1 {
  const source =
    requireRecord(
      candidate,
      'CharacterFaceDeliverySourceV1',
    );
  assertOnlyKeys(
    source,
    SOURCE_KEYS,
    'CharacterFaceDeliverySourceV1',
  );

  if (
    source.schemaVersion !==
    CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1
  ) {
    fail(
      'Character Face delivery source schemaVersion is not supported.',
    );
  }

  if (
    source.locale !==
    CHARACTER_FACE_DELIVERY_LOCALE_V1
  ) {
    fail(
      'Character Face delivery locale is not supported.',
    );
  }

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
    deliveryVersion:
      requireString(
        source.deliveryVersion,
        'source.deliveryVersion',
      ),
    characterId:
      requireString(
        source.characterId,
        'source.characterId',
      ),
    contentVersion:
      requireString(
        source.contentVersion,
        'source.contentVersion',
      ),
    faceProfileVersion:
      requireString(
        source.faceProfileVersion,
        'source.faceProfileVersion',
      ),
    locale:
      CHARACTER_FACE_DELIVERY_LOCALE_V1,
    neutralFactStyle:
      requireNeutralFactStyle(
        source.neutralFactStyle,
        'source.neutralFactStyle',
      ),
    unavailableStyle:
      requireUnavailableStyle(
        source.unavailableStyle,
        'source.unavailableStyle',
      ),
    reactionFramingKey:
      requireReactionFramingKey(
        source.reactionFramingKey,
        'source.reactionFramingKey',
      ),
    followUpFraming:
      requireFollowUpFraming(
        source.followUpFraming,
        'source.followUpFraming',
      ),
  });
}

export function admitCharacterFaceDeliveryProfileV1(
  input: Readonly<{
    source: unknown;
    candidate: unknown;
  }>,
): CharacterFaceDeliveryProfileV1 {
  const source =
    admitCharacterFaceDeliverySourceV1(
      input.source,
    );
  const candidate =
    requireRecord(
      input.candidate,
      'CharacterFaceDeliveryProfileV1',
    );
  assertOnlyKeys(
    candidate,
    PROFILE_KEYS,
    'CharacterFaceDeliveryProfileV1',
  );

  if (
    candidate.schemaVersion !==
    CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1
  ) {
    fail(
      'Character Face delivery profile schemaVersion is not supported.',
    );
  }

  if (
    candidate.locale !==
    CHARACTER_FACE_DELIVERY_LOCALE_V1
  ) {
    fail(
      'Character Face delivery profile locale is not supported.',
    );
  }

  const profile =
    Object.freeze({
      schemaVersion:
        CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
      deliveryVersion:
        requireString(
          candidate.deliveryVersion,
          'delivery.deliveryVersion',
        ),
      characterId:
        requireString(
          candidate.characterId,
          'delivery.characterId',
        ),
      sourceContentVersion:
        requireString(
          candidate.sourceContentVersion,
          'delivery.sourceContentVersion',
        ),
      sourceFaceProfileVersion:
        requireString(
          candidate.sourceFaceProfileVersion,
          'delivery.sourceFaceProfileVersion',
        ),
      locale:
        CHARACTER_FACE_DELIVERY_LOCALE_V1,
      neutralFactStyle:
        requireNeutralFactStyle(
          candidate.neutralFactStyle,
          'delivery.neutralFactStyle',
        ),
      unavailableStyle:
        requireUnavailableStyle(
          candidate.unavailableStyle,
          'delivery.unavailableStyle',
        ),
      reactionFramingKey:
        requireReactionFramingKey(
          candidate.reactionFramingKey,
          'delivery.reactionFramingKey',
        ),
      followUpFraming:
        requireFollowUpFraming(
          candidate.followUpFraming,
          'delivery.followUpFraming',
        ),
    }) satisfies CharacterFaceDeliveryProfileV1;

  if (
    profile.deliveryVersion !==
    source.deliveryVersion
  ) {
    fail(
      'Character Face deliveryVersion does not match the authored source.',
    );
  }
  if (
    profile.characterId !==
    source.characterId
  ) {
    fail(
      'Character Face delivery characterId does not match the authored source.',
    );
  }
  if (
    profile.sourceContentVersion !==
    source.contentVersion
  ) {
    fail(
      'Character Face delivery contentVersion is stale.',
    );
  }
  if (
    profile.sourceFaceProfileVersion !==
    source.faceProfileVersion
  ) {
    fail(
      'Character Face delivery faceProfileVersion is stale.',
    );
  }
  if (
    profile.neutralFactStyle !==
      source.neutralFactStyle ||
    profile.unavailableStyle !==
      source.unavailableStyle ||
    profile.reactionFramingKey !==
      source.reactionFramingKey ||
    !sameBindings(
      profile.followUpFraming,
      source.followUpFraming,
    )
  ) {
    fail(
      'Character Face delivery behavior does not exactly match the authored source.',
    );
  }

  return profile;
}

export function resolveCharacterFaceReactionFramingV1(
  profile:
    CharacterFaceDeliveryProfileV1,
): Readonly<{
  key:
    CharacterFaceSafeReactionFramingKeyV1;
  text: string;
}> {
  return Object.freeze({
    key:
      profile.reactionFramingKey,
    text:
      CHARACTER_FACE_SAFE_REACTION_FRAMING_V1[
        profile.reactionFramingKey
      ],
  });
}

export function resolveCharacterFaceFollowUpFramingV1(
  input: Readonly<{
    profile:
      CharacterFaceDeliveryProfileV1;
    questionStrategy: string;
  }>,
): Readonly<{
  key:
    CharacterFaceSafeFollowUpFramingKeyV1;
  text: string;
}> | null {
  const binding =
    input.profile.followUpFraming.find(
      (candidate) =>
        candidate.questionStrategy ===
        input.questionStrategy,
    );
  if (binding === undefined) {
    return null;
  }

  return Object.freeze({
    key:
      binding.framingKey,
    text:
      CHARACTER_FACE_SAFE_FOLLOW_UP_FRAMING_V1[
        binding.framingKey
      ],
  });
}
