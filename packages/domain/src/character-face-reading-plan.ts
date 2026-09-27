import { createHash } from 'node:crypto';

import type {
  CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';
import {
  admitCharacterFaceGroundingBundleViewV1,
  type CharacterFaceGroundingBundleViewV1,
  type CharacterFaceObservationUnitViewV1,
} from './character-face-grounding-bundle.js';
import type {
  CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import type {
  CharacterFaceAttentionKeyV1,
  CharacterFacePerspectiveProfileV1,
} from './character-face-perspective.js';
import {
  CHARACTER_FACE_INSIGHT_SELECTION_SCHEMA_VERSION_V1,
  selectCharacterFaceInsightsV1,
  type CharacterFaceInsightSelectionV1,
} from './character-face-insight-selector.js';
import { canonicalJson } from './registry.js';

export const CHARACTER_FACE_READING_PLAN_SCHEMA_VERSION_V1 =
  'character-face-reading-plan-v1' as const;

export const CHARACTER_FACE_READING_PLAN_DECISION_SCHEMA_VERSION_V1 =
  'character-face-reading-plan-decision-v1' as const;

export type CharacterFaceReadingSemanticPurposeV1 =
  | 'lead'
  | 'expand';

export type CharacterFaceReadingBeatV1 =
  | Readonly<{
      kind: 'neutral_fact_realization';
      unitRefs: readonly string[];
      purpose: CharacterFaceReadingSemanticPurposeV1;
    }>
  | Readonly<{
      kind: 'unavailable_notice';
      attentionKey:
        CharacterFaceAttentionKeyV1;
      status:
        | 'unavailable'
        | 'not_present';
    }>
  | Readonly<{
      kind: 'character_reaction';
      allowedSourceUnitRefs:
        readonly string[];
    }>
  | Readonly<{
      kind: 'follow_up_question';
      sourceUnitRefs:
        readonly string[];
      questionStrategy: string;
    }>;

export interface CharacterFaceReadingCapabilityRefV1 {
  readonly characterId: string;
  readonly capabilityVersion: string;
  readonly sourceContentVersion: string;
  readonly sourceFaceProfileVersion: string;
  readonly profileHash: string;
}

export interface CharacterFaceReadingPerspectiveRefV1 {
  readonly characterId: string;
  readonly perspectiveVersion: string;
  readonly sourceContentVersion: string;
  readonly sourceFaceProfileVersion: string;
  readonly profileHash: string;
}

export interface CharacterFaceReadingRelationshipProjectionRefV1 {
  readonly schemaVersion: 'v1';
  readonly relationshipRevision: number;
  readonly relationshipPolicyVersion: string;
  readonly projectionPolicyVersion: string;
  readonly behaviorVersion: string;
  readonly projectionHash: string;
}

export interface CharacterFaceReadingPlanV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_READING_PLAN_SCHEMA_VERSION_V1;
  readonly planId: string;
  readonly characterId: string;
  readonly topicKey: string;
  readonly bundleHash: string;
  readonly capabilityProfileRef:
    CharacterFaceReadingCapabilityRefV1;
  readonly perspectiveProfileRef:
    CharacterFaceReadingPerspectiveRefV1;
  readonly relationshipProjectionRef:
    CharacterFaceReadingRelationshipProjectionRefV1;
  readonly insightSelectionSchemaVersion:
    typeof CHARACTER_FACE_INSIGHT_SELECTION_SCHEMA_VERSION_V1;
  readonly beats:
    readonly CharacterFaceReadingBeatV1[];
}

export interface CharacterFaceReadingPlanDecisionV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_READING_PLAN_DECISION_SCHEMA_VERSION_V1;
  readonly mode: 'character_plan';
  readonly selection:
    CharacterFaceInsightSelectionV1;
  readonly plan:
    CharacterFaceReadingPlanV1;
}

export class CharacterFaceReadingPlanErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name =
      'CharacterFaceReadingPlanErrorV1';
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

function freezeRefs(
  refs: readonly string[],
): readonly string[] {
  return Object.freeze([...refs]);
}

function capabilityRef(
  capability:
    CharacterFaceCapabilityProfileV1,
): CharacterFaceReadingCapabilityRefV1 {
  return Object.freeze({
    characterId:
      capability.characterId,
    capabilityVersion:
      capability.capabilityVersion,
    sourceContentVersion:
      capability.sourceContentVersion,
    sourceFaceProfileVersion:
      capability.sourceFaceProfileVersion,
    profileHash:
      sha256Json(capability),
  });
}

function perspectiveRef(
  perspective:
    CharacterFacePerspectiveProfileV1,
): CharacterFaceReadingPerspectiveRefV1 {
  return Object.freeze({
    characterId:
      perspective.characterId,
    perspectiveVersion:
      perspective.perspectiveVersion,
    sourceContentVersion:
      perspective.sourceContentVersion,
    sourceFaceProfileVersion:
      perspective.sourceFaceProfileVersion,
    profileHash:
      sha256Json(perspective),
  });
}

function relationshipRef(
  context:
    CharacterRuntimeContextWithFaceGroundingV1,
): CharacterFaceReadingRelationshipProjectionRefV1 {
  return Object.freeze({
    schemaVersion: 'v1' as const,
    relationshipRevision:
      context.relationship
        .relationshipRevision,
    relationshipPolicyVersion:
      context.relationship
        .relationshipPolicyVersion,
    projectionPolicyVersion:
      context.relationship
        .projectionPolicyVersion,
    behaviorVersion:
      context.relationship
        .behaviorVersion,
    projectionHash:
      sha256Json(
        context.relationship,
      ),
  });
}

function selectedUnitsInPlanOrder(
  input: Readonly<{
    selection:
      CharacterFaceInsightSelectionV1;
    grounding:
      CharacterFaceGroundingBundleViewV1;
  }>,
): readonly CharacterFaceObservationUnitViewV1[] {
  if (
    new Set(
      input.selection.orderedUnitIds,
    ).size !==
    input.selection.orderedUnitIds.length
  ) {
    throw new CharacterFaceReadingPlanErrorV1(
      'Character Face insight selection orderedUnitIds must not contain duplicates.',
    );
  }

  if (
    input.selection.orderedUnitIds.length !==
      input.selection.selectedUnitIds.length ||
    input.selection.orderedUnitIds.some(
      (unitId) =>
        !input.selection.selectedUnitIds.includes(
          unitId,
        ),
    ) ||
    input.selection.selectedUnitIds.some(
      (unitId) =>
        !input.selection.orderedUnitIds.includes(
          unitId,
        ),
    )
  ) {
    throw new CharacterFaceReadingPlanErrorV1(
      'Character Face insight selection orderedUnitIds must contain exactly the selected units.',
    );
  }

  const byId =
    new Map(
      input.grounding.units.map(
        (unit) => [
          unit.unitId,
          unit,
        ],
      ),
    );

  return Object.freeze(
    input.selection.orderedUnitIds.map(
      (unitId) => {
        const unit =
          byId.get(unitId);
        if (unit === undefined) {
          throw new CharacterFaceReadingPlanErrorV1(
            `Character Face insight selection references unknown grounding unit: ${unitId}.`,
          );
        }
        return unit;
      },
    ),
  );
}

function firstAuthoredQuestionStrategy(
  context:
    CharacterRuntimeContextWithFaceGroundingV1,
): string | null {
  for (
    const raw
    of context.persona.questioning
      .preferredStrategies
  ) {
    const strategy =
      raw.trim();
    if (strategy.length > 0) {
      return strategy;
    }
  }

  return null;
}

function planBeats(
  input: Readonly<{
    context:
      CharacterRuntimeContextWithFaceGroundingV1;
    selection:
      CharacterFaceInsightSelectionV1;
    selectedUnits:
      readonly CharacterFaceObservationUnitViewV1[];
  }>,
): readonly CharacterFaceReadingBeatV1[] {
  const orderedUnitRefs =
    freezeRefs(
      input.selectedUnits.map(
        (unit) => unit.unitId,
      ),
    );

  const beats:
    CharacterFaceReadingBeatV1[] =
      input.selectedUnits.map(
        (unit, index) =>
          Object.freeze({
            kind:
              'neutral_fact_realization' as const,
            unitRefs:
              Object.freeze([
                unit.unitId,
              ]),
            purpose:
              index === 0
                ? ('lead' as const)
                : ('expand' as const),
          }),
      );

  for (
    const resolution
    of input.selection
      .attentionResolutions
  ) {
    if (
      resolution.status !==
        'unavailable' &&
      resolution.status !==
        'not_present'
    ) {
      continue;
    }

    beats.push(
      Object.freeze({
        kind:
          'unavailable_notice' as const,
        attentionKey:
          resolution.attentionKey,
        status:
          resolution.status,
      }),
    );
  }

  if (
    orderedUnitRefs.length > 0
  ) {
    beats.push(
      Object.freeze({
        kind:
          'character_reaction' as const,
        allowedSourceUnitRefs:
          orderedUnitRefs,
      }),
    );

    const questionStrategy =
      firstAuthoredQuestionStrategy(
        input.context,
      );
    if (
      questionStrategy !== null
    ) {
      beats.push(
        Object.freeze({
          kind:
            'follow_up_question' as const,
          sourceUnitRefs:
            orderedUnitRefs,
          questionStrategy,
        }),
      );
    }
  }

  return Object.freeze(beats);
}

function assertPlanBeatCoverage(
  input: Readonly<{
    selection:
      CharacterFaceInsightSelectionV1;
    beats:
      readonly CharacterFaceReadingBeatV1[];
  }>,
): void {
  const semanticUnitRefs =
    input.beats
      .filter(
        (
          beat,
        ): beat is Extract<
          CharacterFaceReadingBeatV1,
          {
            kind:
              'neutral_fact_realization';
          }
        > =>
          beat.kind ===
          'neutral_fact_realization',
      )
      .flatMap(
        (beat) =>
          [...beat.unitRefs],
      );

  if (
    semanticUnitRefs.length !==
      input.selection.orderedUnitIds
        .length ||
    semanticUnitRefs.some(
      (unitId, index) =>
        unitId !==
        input.selection.orderedUnitIds[
          index
        ],
    )
  ) {
    throw new CharacterFaceReadingPlanErrorV1(
      'Character Face Reading Plan semantic beats must cover selected units exactly in Character order.',
    );
  }

  const expectedNotices =
    input.selection.attentionResolutions
      .filter(
        (resolution) =>
          resolution.status ===
            'unavailable' ||
          resolution.status ===
            'not_present',
      )
      .map((resolution) => ({
        attentionKey:
          resolution.attentionKey,
        status:
          resolution.status,
      }));

  const actualNotices =
    input.beats
      .filter(
        (
          beat,
        ): beat is Extract<
          CharacterFaceReadingBeatV1,
          {
            kind:
              'unavailable_notice';
          }
        > =>
          beat.kind ===
          'unavailable_notice',
      )
      .map((beat) => ({
        attentionKey:
          beat.attentionKey,
        status: beat.status,
      }));

  if (
    JSON.stringify(
      actualNotices,
    ) !==
    JSON.stringify(
      expectedNotices,
    )
  ) {
    throw new CharacterFaceReadingPlanErrorV1(
      'Character Face Reading Plan unavailable notices must preserve selector attention resolution order.',
    );
  }
}

export function buildCharacterFaceReadingPlanDecisionV1(
  input: Readonly<{
    context:
      CharacterRuntimeContextWithFaceGroundingV1;
    grounding: unknown;
    characterContentVersion: string;
    capability:
      CharacterFaceCapabilityProfileV1;
    perspective:
      CharacterFacePerspectiveProfileV1;
  }>,
): CharacterFaceReadingPlanDecisionV1 {
  const selection =
    selectCharacterFaceInsightsV1(
      input,
    );

  if (
    input.context.face === null
  ) {
    throw new CharacterFaceReadingPlanErrorV1(
      'Character Face Reading Plan requires an admitted Face context.',
    );
  }

  const grounding =
    admitCharacterFaceGroundingBundleViewV1(
      {
        candidate:
          input.grounding,
        context:
          input.context.face,
      },
    );

  if (
    selection.characterId !==
      input.context.characterId ||
    selection.topicKey !==
      grounding.topicKey ||
    selection.bundleHash !==
      grounding.bundleHash ||
    selection.capabilityVersion !==
      input.capability
        .capabilityVersion ||
    selection.perspectiveVersion !==
      input.perspective
        .perspectiveVersion
  ) {
    throw new CharacterFaceReadingPlanErrorV1(
      'Character Face insight selection identity does not match the active Reading Plan inputs.',
    );
  }

  const selectedUnits =
    selectedUnitsInPlanOrder({
      selection,
      grounding,
    });

  const beats =
    planBeats({
      context:
        input.context,
      selection,
      selectedUnits,
    });

  assertPlanBeatCoverage({
    selection,
    beats,
  });

  const withoutPlanId = {
    schemaVersion:
      CHARACTER_FACE_READING_PLAN_SCHEMA_VERSION_V1,
    characterId:
      input.context.characterId,
    topicKey:
      grounding.topicKey,
    bundleHash:
      grounding.bundleHash,
    capabilityProfileRef:
      capabilityRef(
        input.capability,
      ),
    perspectiveProfileRef:
      perspectiveRef(
        input.perspective,
      ),
    relationshipProjectionRef:
      relationshipRef(
        input.context,
      ),
    insightSelectionSchemaVersion:
      CHARACTER_FACE_INSIGHT_SELECTION_SCHEMA_VERSION_V1,
    beats,
  } as const;

  const plan =
    Object.freeze({
      ...withoutPlanId,
      planId:
        `character_face_reading_plan_${sha256Json(
          withoutPlanId,
        ).slice(0, 24)}`,
    }) satisfies CharacterFaceReadingPlanV1;

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_READING_PLAN_DECISION_SCHEMA_VERSION_V1,
    mode:
      'character_plan' as const,
    selection,
    plan,
  });
}
