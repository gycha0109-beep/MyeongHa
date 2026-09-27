import { createHash } from 'node:crypto';

import {
  CHARACTER_FACE_NEUTRAL_FACT_STYLES_V1,
  CHARACTER_FACE_SAFE_REACTION_FRAMING_V1,
  CHARACTER_FACE_UNAVAILABLE_STYLES_V1,
  resolveCharacterFaceFollowUpFramingV1,
  resolveCharacterFaceReactionFramingV1,
  type CharacterFaceDeliveryProfileV1,
} from './character-face-delivery-profile.js';
import type {
  CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';
import {
  FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  admitCharacterFaceGroundingBundleViewV1,
  type CharacterFaceDisplayValueV1,
  type CharacterFaceGroundingBundleViewV1,
  type CharacterFaceObservationUnitViewV1,
} from './character-face-grounding-bundle.js';
import type {
  CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import type {
  CharacterFacePerspectiveProfileV1,
} from './character-face-perspective.js';
import {
  buildCharacterFaceReadingPlanDecisionV1,
  type CharacterFaceReadingPlanDecisionV1,
  type CharacterFaceReadingSemanticPurposeV1,
} from './character-face-reading-plan.js';
import {
  assertCharacterFaceVoiceRuntimeInvariantV1,
} from './character-face-voice-authority.js';
import { canonicalJson } from './registry.js';

export const CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1 =
  'myeongha-character-face-bounded-renderer-v1' as const;

export const CHARACTER_FACE_UTTERANCE_SCHEMA_VERSION_V1 =
  'myeongha-character-face-utterance-v1' as const;

export const CHARACTER_FACE_NEUTRAL_CAPABILITY_LABELS_V1 =
  Object.freeze({
    'eye.width_height_ratio':
      '눈 가로·세로 비율',
    'nose.alar_width_and_nostril_geometry':
      '코 날개 폭·콧구멍 가시 형상',
    'mouth.width_and_relative_size':
      '입 너비·상대 크기',
    'chin_lower_face.visible_width_ratio':
      '턱·하관 가시 너비 비율',
    'forehead.visible_width_shape':
      '이마 가시 너비·형상',
  } as const);

export type CharacterFaceUtteranceSegmentV1 =
  | Readonly<{
      kind:
        'neutral_fact_realization';
      text: string;
      sourceUnitRefs:
        readonly [string];
      displayFactRef: string;
      capabilityKey: string;
      purpose:
        CharacterFaceReadingSemanticPurposeV1;
    }>
  | Readonly<{
      kind:
        'unavailable_notice';
      text: string;
      attentionKey: string;
      status:
        | 'unavailable'
        | 'not_present';
    }>
  | Readonly<{
      kind:
        'character_reaction';
      text: string;
      sourceUnitRefs:
        readonly string[];
      framingKey: string;
    }>
  | Readonly<{
      kind:
        'follow_up_question';
      text: string;
      sourceUnitRefs:
        readonly string[];
      questionStrategy: string;
      framingKey: string;
    }>;

export interface CharacterFaceDeliveryProfileRefV1 {
  readonly characterId: string;
  readonly deliveryVersion: string;
  readonly sourceContentVersion: string;
  readonly sourceFaceProfileVersion: string;
  readonly profileHash: string;
}

export interface CharacterFaceUtteranceV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_UTTERANCE_SCHEMA_VERSION_V1;
  readonly utteranceId: string;
  readonly rendererVersion:
    typeof CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1;
  readonly characterId: string;
  readonly topicKey: string;
  readonly bundleHash: string;
  readonly readingPlanRef: string;
  readonly deliveryProfileRef:
    CharacterFaceDeliveryProfileRefV1;
  readonly renderedUnitIds:
    readonly string[];
  readonly segments:
    readonly CharacterFaceUtteranceSegmentV1[];
}

export type CharacterFaceProtectedFallbackReasonV1 =
  | 'qualifier_realization_not_authorized'
  | 'safe_framing_unavailable';

export type CharacterFaceBoundedRenderDecisionV1 =
  | Readonly<{
      mode: 'bounded_neutral';
      rendererVersion:
        typeof CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1;
      validationState:
        'template_validated';
      planDecision:
        CharacterFaceReadingPlanDecisionV1;
      utterance:
        CharacterFaceUtteranceV1;
    }>
  | Readonly<{
      mode:
        'protected_fallback';
      rendererVersion:
        typeof CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1;
      validationState:
        'fallback_used';
      reason:
        CharacterFaceProtectedFallbackReasonV1;
      planDecision:
        CharacterFaceReadingPlanDecisionV1;
    }>;

export class CharacterFaceBoundedRendererErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name =
      'CharacterFaceBoundedRendererErrorV1';
  }
}

function sha256Json(
  value: unknown,
): string {
  return createHash('sha256')
    .update(
      canonicalJson(value),
      'utf8',
    )
    .digest('hex');
}

function assertDeliveryCompatibility(
  input: Readonly<{
    context:
      CharacterRuntimeContextWithFaceGroundingV1;
    capability:
      CharacterFaceCapabilityProfileV1;
    perspective:
      CharacterFacePerspectiveProfileV1;
    delivery:
      CharacterFaceDeliveryProfileV1;
  }>,
): void {
  if (
    input.delivery.characterId !==
      input.context.characterId ||
    input.delivery.characterId !==
      input.capability.characterId ||
    input.delivery.characterId !==
      input.perspective.characterId
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Face delivery profile Character identity does not match the active runtime.',
    );
  }

  if (
    input.delivery.sourceContentVersion !==
      input.context.contentVersion ||
    input.delivery.sourceContentVersion !==
      input.capability.sourceContentVersion ||
    input.delivery.sourceContentVersion !==
      input.perspective.sourceContentVersion
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Face delivery profile contentVersion does not match the active runtime.',
    );
  }

  if (
    input.delivery.sourceFaceProfileVersion !==
      input.capability.sourceFaceProfileVersion ||
    input.delivery.sourceFaceProfileVersion !==
      input.perspective.sourceFaceProfileVersion
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Face delivery profile faceProfileVersion does not match the active Face profile.',
    );
  }

  if (
    !(
      CHARACTER_FACE_NEUTRAL_FACT_STYLES_V1 as readonly string[]
    ).includes(
      input.delivery.neutralFactStyle,
    ) ||
    !(
      CHARACTER_FACE_UNAVAILABLE_STYLES_V1 as readonly string[]
    ).includes(
      input.delivery.unavailableStyle,
    )
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Face delivery profile contains an unsupported bounded delivery style.',
    );
  }

  if (
    !(
      input.delivery.reactionFramingKey in
      CHARACTER_FACE_SAFE_REACTION_FRAMING_V1
    )
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Face delivery profile reaction framing is not code-owned.',
    );
  }

  const strategies =
    input.delivery.followUpFraming.map(
      (binding) =>
        binding.questionStrategy,
    );
  if (
    new Set(strategies).size !==
    strategies.length
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Face delivery profile contains duplicate follow-up strategies.',
    );
  }
}

function deliveryProfileRef(
  profile:
    CharacterFaceDeliveryProfileV1,
): CharacterFaceDeliveryProfileRefV1 {
  return Object.freeze({
    characterId:
      profile.characterId,
    deliveryVersion:
      profile.deliveryVersion,
    sourceContentVersion:
      profile.sourceContentVersion,
    sourceFaceProfileVersion:
      profile.sourceFaceProfileVersion,
    profileHash:
      sha256Json(profile),
  });
}

function capabilityLabel(
  capabilityKey: string,
): string {
  const label =
    CHARACTER_FACE_NEUTRAL_CAPABILITY_LABELS_V1[
      capabilityKey as keyof typeof CHARACTER_FACE_NEUTRAL_CAPABILITY_LABELS_V1
    ];

  if (label === undefined) {
    throw new CharacterFaceBoundedRendererErrorV1(
      `Face renderer has no code-owned neutral label for capability: ${capabilityKey}.`,
    );
  }
  return label;
}

function formatNumber(
  value: number,
): string {
  if (!Number.isFinite(value)) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Face renderer cannot realize a non-finite source value.',
    );
  }
  return String(value);
}

export function formatCharacterFaceDisplayValueV1(
  displayValue:
    CharacterFaceDisplayValueV1,
): string {
  if (
    displayValue.kind ===
    'scalar'
  ) {
    return `${formatNumber(
      displayValue.value,
    )} ${displayValue.unit}`;
  }

  return displayValue.axes
    .map(
      (axis) =>
        `${axis.axisKey}=${formatNumber(
          axis.value,
        )} ${axis.unit}`,
    )
    .join('; ');
}

function renderNeutralFactText(
  input: Readonly<{
    label: string;
    valueText: string;
    style:
      CharacterFaceDeliveryProfileV1['neutralFactStyle'];
  }>,
): string {
  switch (input.style) {
    case 'plain':
      return `${input.label}: ${input.valueText}.`;
    case 'soft_observation':
      return `${input.label}은 ${input.valueText}로 확인돼요.`;
    case 'compact':
      return `${input.label}, ${input.valueText}.`;
  }
}

function renderUnavailableText(
  input: Readonly<{
    label: string;
    status:
      | 'unavailable'
      | 'not_present';
    style:
      CharacterFaceDeliveryProfileV1['unavailableStyle'];
  }>,
): string {
  if (
    input.style === 'direct'
  ) {
    return input.status ===
      'unavailable'
      ? `${input.label} 항목은 현재 사용할 수 없습니다.`
      : `${input.label} 항목은 현재 결과에 포함되지 않습니다.`;
  }

  return input.status ===
    'unavailable'
    ? `${input.label}은 지금 확인 가능한 범위에 포함되지 않아요.`
    : `${input.label}은 지금 결과에서는 확인할 수 없어요.`;
}

function requireSelectedUnit(
  input: Readonly<{
    unitId: string;
    selected:
      ReadonlySet<string>;
    byId:
      ReadonlyMap<
        string,
        CharacterFaceObservationUnitViewV1
      >;
  }>,
): CharacterFaceObservationUnitViewV1 {
  if (
    !input.selected.has(
      input.unitId,
    )
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      `Face Reading Plan references an unselected unit: ${input.unitId}.`,
    );
  }

  const unit =
    input.byId.get(
      input.unitId,
    );
  if (unit === undefined) {
    throw new CharacterFaceBoundedRendererErrorV1(
      `Face Reading Plan references an unknown grounding unit: ${input.unitId}.`,
    );
  }
  return unit;
}

function validateSourceUnitRefs(
  input: Readonly<{
    refs: readonly string[];
    selected:
      ReadonlySet<string>;
    byId:
      ReadonlyMap<
        string,
        CharacterFaceObservationUnitViewV1
      >;
  }>,
): readonly CharacterFaceObservationUnitViewV1[] {
  if (
    input.refs.length === 0 ||
    new Set(input.refs).size !==
      input.refs.length
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Face Character framing sourceUnitRefs must be non-empty and unique.',
    );
  }

  return Object.freeze(
    input.refs.map(
      (unitId) =>
        requireSelectedUnit({
          unitId,
          selected:
            input.selected,
          byId: input.byId,
        }),
    ),
  );
}

function assertRenderedCoverage(
  input: Readonly<{
    orderedSelectedUnitIds:
      readonly string[];
    renderedUnitIds:
      readonly string[];
  }>,
): void {
  if (
    new Set(
      input.renderedUnitIds,
    ).size !==
    input.renderedUnitIds.length
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Each selected Face unit must be rendered at most once.',
    );
  }

  if (
    input.orderedSelectedUnitIds.length !==
      input.renderedUnitIds.length ||
    input.orderedSelectedUnitIds.some(
      (unitId, index) =>
        unitId !==
        input.renderedUnitIds[index],
    )
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Every selected Face unit must be rendered exactly once in Character order.',
    );
  }
}

function fallback(
  reason:
    CharacterFaceProtectedFallbackReasonV1,
  planDecision:
    CharacterFaceReadingPlanDecisionV1,
): CharacterFaceBoundedRenderDecisionV1 {
  return Object.freeze({
    mode:
      'protected_fallback' as const,
    rendererVersion:
      CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1,
    validationState:
      'fallback_used' as const,
    reason,
    planDecision,
  });
}

export function renderCharacterFaceBoundedNeutralV1(
  input: Readonly<{
    context:
      CharacterRuntimeContextWithFaceGroundingV1;
    grounding: unknown;
    characterContentVersion: string;
    capability:
      CharacterFaceCapabilityProfileV1;
    perspective:
      CharacterFacePerspectiveProfileV1;
    deliveryProfile:
      CharacterFaceDeliveryProfileV1;
  }>,
): CharacterFaceBoundedRenderDecisionV1 {
  assertCharacterFaceVoiceRuntimeInvariantV1(
    input.context,
  );
  assertDeliveryCompatibility({
    context: input.context,
    capability:
      input.capability,
    perspective:
      input.perspective,
    delivery:
      input.deliveryProfile,
  });

  const planDecision =
    buildCharacterFaceReadingPlanDecisionV1({
      context: input.context,
      grounding: input.grounding,
      characterContentVersion:
        input.characterContentVersion,
      capability:
        input.capability,
      perspective:
        input.perspective,
    });

  if (
    input.context.face === null
  ) {
    throw new CharacterFaceBoundedRendererErrorV1(
      'Bounded Face renderer requires an admitted Face context.',
    );
  }

  const grounding:
    CharacterFaceGroundingBundleViewV1 =
      admitCharacterFaceGroundingBundleViewV1({
        candidate:
          input.grounding,
        context:
          input.context.face,
      });

  const selected =
    new Set(
      planDecision.selection
        .selectedUnitIds,
    );
  const byId =
    new Map(
      grounding.units.map(
        (unit) => [
          unit.unitId,
          unit,
        ],
      ),
    );

  const segments:
    CharacterFaceUtteranceSegmentV1[] =
      [];
  const renderedUnitIds:
    string[] = [];

  for (
    const beat
    of planDecision.plan.beats
  ) {
    switch (beat.kind) {
      case 'neutral_fact_realization': {
        if (
          beat.unitRefs.length !==
          1
        ) {
          throw new CharacterFaceBoundedRendererErrorV1(
            'Face neutral fact beat must reference exactly one source unit.',
          );
        }

        const unit =
          requireSelectedUnit({
            unitId:
              beat.unitRefs[0]!,
            selected,
            byId,
          });

        if (
          unit.realizationPolicyRef !==
          FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1
        ) {
          throw new CharacterFaceBoundedRendererErrorV1(
            'Face source unit realization policy is not authorized for bounded neutral rendering.',
          );
        }

        if (
          unit.qualifiers.length >
          0
        ) {
          return fallback(
            'qualifier_realization_not_authorized',
            planDecision,
          );
        }

        const label =
          capabilityLabel(
            unit.capabilityKey,
          );
        const valueText =
          formatCharacterFaceDisplayValueV1(
            unit.displayValue,
          );

        renderedUnitIds.push(
          unit.unitId,
        );
        segments.push(
          Object.freeze({
            kind:
              'neutral_fact_realization' as const,
            text:
              renderNeutralFactText({
                label,
                valueText,
                style:
                  input.deliveryProfile
                    .neutralFactStyle,
              }),
            sourceUnitRefs:
              Object.freeze([
                unit.unitId,
              ]) as readonly [string],
            displayFactRef:
              unit.displayFactRef,
            capabilityKey:
              unit.capabilityKey,
            purpose:
              beat.purpose,
          }),
        );
        break;
      }

      case 'unavailable_notice': {
        segments.push(
          Object.freeze({
            kind:
              'unavailable_notice' as const,
            text:
              renderUnavailableText({
                label:
                  capabilityLabel(
                    beat.attentionKey,
                  ),
                status:
                  beat.status,
                style:
                  input.deliveryProfile
                    .unavailableStyle,
              }),
            attentionKey:
              beat.attentionKey,
            status:
              beat.status,
          }),
        );
        break;
      }

      case 'character_reaction': {
        validateSourceUnitRefs({
          refs:
            beat.allowedSourceUnitRefs,
          selected,
          byId,
        });
        const framing =
          resolveCharacterFaceReactionFramingV1(
            input.deliveryProfile,
          );
        if (
          framing.text.length === 0
        ) {
          return fallback(
            'safe_framing_unavailable',
            planDecision,
          );
        }

        segments.push(
          Object.freeze({
            kind:
              'character_reaction' as const,
            text:
              framing.text,
            sourceUnitRefs:
              Object.freeze([
                ...beat
                  .allowedSourceUnitRefs,
              ]),
            framingKey:
              framing.key,
          }),
        );
        break;
      }

      case 'follow_up_question': {
        validateSourceUnitRefs({
          refs:
            beat.sourceUnitRefs,
          selected,
          byId,
        });
        const framing =
          resolveCharacterFaceFollowUpFramingV1({
            profile:
              input.deliveryProfile,
            questionStrategy:
              beat.questionStrategy,
          });
        if (
          framing === null
        ) {
          return fallback(
            'safe_framing_unavailable',
            planDecision,
          );
        }

        segments.push(
          Object.freeze({
            kind:
              'follow_up_question' as const,
            text:
              framing.text,
            sourceUnitRefs:
              Object.freeze([
                ...beat
                  .sourceUnitRefs,
              ]),
            questionStrategy:
              beat.questionStrategy,
            framingKey:
              framing.key,
          }),
        );
        break;
      }
    }
  }

  assertRenderedCoverage({
    orderedSelectedUnitIds:
      planDecision.selection
        .orderedUnitIds,
    renderedUnitIds,
  });

  const withoutId = {
    schemaVersion:
      CHARACTER_FACE_UTTERANCE_SCHEMA_VERSION_V1,
    rendererVersion:
      CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1,
    characterId:
      input.context.characterId,
    topicKey:
      grounding.topicKey,
    bundleHash:
      grounding.bundleHash,
    readingPlanRef:
      planDecision.plan.planId,
    deliveryProfileRef:
      deliveryProfileRef(
        input.deliveryProfile,
      ),
    renderedUnitIds:
      Object.freeze([
        ...renderedUnitIds,
      ]),
    segments:
      Object.freeze(segments),
  } as const;

  const utterance =
    Object.freeze({
      ...withoutId,
      utteranceId:
        `character_face_utterance_${sha256Json(
          withoutId,
        ).slice(0, 24)}`,
    }) satisfies CharacterFaceUtteranceV1;

  return Object.freeze({
    mode:
      'bounded_neutral' as const,
    rendererVersion:
      CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1,
    validationState:
      'template_validated' as const,
    planDecision,
    utterance,
  });
}
