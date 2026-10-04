import {
  renderCharacterFaceBoundedNeutralV1,
  type CharacterFaceBoundedRenderDecisionV1,
  type CharacterFaceUtteranceSegmentV1,
  type CharacterFaceUtteranceV1,
} from './character-face-bounded-renderer.js';
import type {
  CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import type {
  CharacterFaceDeliveryProfileV1,
} from './character-face-delivery-profile.js';
import type {
  CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';
import type {
  CharacterFacePerspectiveProfileV1,
} from './character-face-perspective.js';
import { canonicalJson } from './registry.js';

export const CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1 =
  'myeongha-character-face-semantic-guard-v1' as const;

export const CHARACTER_FACE_SEMANTIC_GUARD_FAILURE_CODES_V1 =
  Object.freeze([
    'STRUCTURE_MISMATCH',
    'ADDED_CLAIM',
    'MISSING_SELECTED_UNIT',
    'UNSELECTED_SOURCE_UNIT',
    'SOURCE_IDENTITY_MISMATCH',
    'NEUTRAL_FACT_TEXT_MISMATCH',
    'DISPLAY_FACT_REF_MISMATCH',
    'CAPABILITY_MISMATCH',
    'DROPPED_QUALIFIER',
    'UNAVAILABLE_PROMOTED',
    'UNAUTHORED_CHARACTER_FRAMING',
    'REALIZATION_POLICY_MISMATCH',
    'VOICE_AUTHORITY_MISMATCH',
  ] as const);

export type CharacterFaceSemanticGuardFailureCodeV1 =
  (typeof CHARACTER_FACE_SEMANTIC_GUARD_FAILURE_CODES_V1)[number];

export interface CharacterFaceSemanticGuardFailureV1 {
  readonly code:
    CharacterFaceSemanticGuardFailureCodeV1;
  readonly detail: string;
  readonly segmentIndex?: number;
  readonly unitRef?: string;
  readonly attentionKey?: string;
}

export interface CharacterFaceSemanticGuardEvidenceV1 {
  readonly exactNeutralFacts: true;
  readonly characterId: string;
  readonly topicKey: string;
  readonly bundleHash: string;
  readonly readingPlanRef: string;
  readonly deliveryProfileHash: string;
  readonly validatedUnitIds:
    readonly string[];
  readonly validatedDisplayFactRefs:
    readonly string[];
  readonly validatedUnavailableAttentionKeys:
    readonly string[];
}

export type CharacterFaceSemanticGuardDecisionV1 =
  | Readonly<{
      mode: 'accepted';
      guardVersion:
        typeof CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1;
      validationState:
        'semantic_validated';
      utterance:
        CharacterFaceUtteranceV1;
      evidence:
        CharacterFaceSemanticGuardEvidenceV1;
    }>
  | Readonly<{
      mode:
        'protected_fallback';
      guardVersion:
        typeof CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1;
      validationState:
        'fallback_used';
      reason:
        | 'renderer_protected_fallback'
        | 'semantic_guard_failed';
      failures:
        readonly CharacterFaceSemanticGuardFailureV1[];
      rendererDecision:
        CharacterFaceBoundedRenderDecisionV1;
    }>;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function failure(
  code:
    CharacterFaceSemanticGuardFailureCodeV1,
  detail: string,
  extra: Pick<
    CharacterFaceSemanticGuardFailureV1,
    | 'segmentIndex'
    | 'unitRef'
    | 'attentionKey'
  > = {},
): CharacterFaceSemanticGuardFailureV1 {
  return Object.freeze({
    code,
    detail,
    ...extra,
  });
}

function stringArray(
  value: unknown,
): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== 'string',
    )
  ) {
    return null;
  }

  return value as readonly string[];
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (value, index) =>
        value === right[index],
    )
  );
}

function sameValue(
  left: unknown,
  right: unknown,
): boolean {
  return (
    canonicalJson(left) ===
    canonicalJson(right)
  );
}

function compareIdentity(
  candidate: unknown,
  expected:
    CharacterFaceUtteranceV1,
): readonly CharacterFaceSemanticGuardFailureV1[] {
  if (!isRecord(candidate)) {
    return Object.freeze([
      failure(
        'STRUCTURE_MISMATCH',
        'Character Face utterance must be an object.',
      ),
    ]);
  }

  const failures:
    CharacterFaceSemanticGuardFailureV1[] =
      [];

  const expectedKeys =
    new Set([
      'schemaVersion',
      'utteranceId',
      'rendererVersion',
      'characterId',
      'topicKey',
      'bundleHash',
      'readingPlanRef',
      'deliveryProfileRef',
      'renderedUnitIds',
      'segments',
    ]);
  const unexpected =
    Object.keys(candidate).find(
      (key) =>
        !expectedKeys.has(key),
    );
  if (unexpected !== undefined) {
    failures.push(
      failure(
        'ADDED_CLAIM',
        `Character Face utterance contains an unexpected top-level field: ${unexpected}.`,
      ),
    );
  }

  for (
    const [field, expectedValue]
    of [
      [
        'schemaVersion',
        expected.schemaVersion,
      ],
      [
        'utteranceId',
        expected.utteranceId,
      ],
      [
        'rendererVersion',
        expected.rendererVersion,
      ],
      [
        'characterId',
        expected.characterId,
      ],
      [
        'topicKey',
        expected.topicKey,
      ],
      [
        'bundleHash',
        expected.bundleHash,
      ],
      [
        'readingPlanRef',
        expected.readingPlanRef,
      ],
    ] as const
  ) {
    if (
      candidate[field] !==
      expectedValue
    ) {
      failures.push(
        failure(
          'SOURCE_IDENTITY_MISMATCH',
          `Character Face utterance ${field} does not match the deterministic renderer identity.`,
        ),
      );
    }
  }

  if (
    !sameValue(
      candidate.deliveryProfileRef,
      expected.deliveryProfileRef,
    )
  ) {
    failures.push(
      failure(
        'SOURCE_IDENTITY_MISMATCH',
        'Character Face utterance deliveryProfileRef does not match the admitted deterministic renderer profile.',
      ),
    );
  }

  const renderedUnitIds =
    stringArray(
      candidate.renderedUnitIds,
    );
  if (
    renderedUnitIds === null
  ) {
    failures.push(
      failure(
        'STRUCTURE_MISMATCH',
        'renderedUnitIds must be a string array.',
      ),
    );
  } else if (
    !sameStrings(
      renderedUnitIds,
      expected.renderedUnitIds,
    )
  ) {
    const expectedSet =
      new Set(
        expected.renderedUnitIds,
      );

    for (
      const unitId
      of renderedUnitIds
    ) {
      if (
        !expectedSet.has(
          unitId,
        )
      ) {
        failures.push(
          failure(
            'UNSELECTED_SOURCE_UNIT',
            'renderedUnitIds contains a Face unit outside the deterministic selected set.',
            {
              unitRef: unitId,
            },
          ),
        );
      }
    }

    for (
      const unitId
      of expected.renderedUnitIds
    ) {
      if (
        !renderedUnitIds.includes(
          unitId,
        )
      ) {
        failures.push(
          failure(
            'MISSING_SELECTED_UNIT',
            'renderedUnitIds omitted a selected Face source unit.',
            {
              unitRef: unitId,
            },
          ),
        );
      }
    }

    if (
      renderedUnitIds.length ===
        expected.renderedUnitIds
          .length &&
      renderedUnitIds.every(
        (unitId) =>
          expectedSet.has(
            unitId,
          ),
      )
    ) {
      failures.push(
        failure(
          'STRUCTURE_MISMATCH',
          'renderedUnitIds order does not match deterministic Character order.',
        ),
      );
    }
  }

  return Object.freeze(
    failures,
  );
}

function compareNeutralFactSegment(
  input: Readonly<{
    raw:
      Record<string, unknown>;
    expected:
      Extract<
        CharacterFaceUtteranceSegmentV1,
        {
          kind:
            'neutral_fact_realization';
        }
      >;
    selected:
      ReadonlySet<string>;
    index: number;
  }>,
): readonly CharacterFaceSemanticGuardFailureV1[] {
  const failures:
    CharacterFaceSemanticGuardFailureV1[] =
      [];

  const refs =
    stringArray(
      input.raw.sourceUnitRefs,
    );
  if (
    refs === null ||
    refs.length !== 1
  ) {
    failures.push(
      failure(
        'STRUCTURE_MISMATCH',
        'Face neutral fact segment requires exactly one sourceUnitRef.',
        {
          segmentIndex:
            input.index,
        },
      ),
    );
    return Object.freeze(
      failures,
    );
  }

  for (const ref of refs) {
    if (
      !input.selected.has(ref)
    ) {
      failures.push(
        failure(
          'UNSELECTED_SOURCE_UNIT',
          'Face neutral fact segment references a unit not selected by the Reading Plan.',
          {
            segmentIndex:
              input.index,
            unitRef: ref,
          },
        ),
      );
    }
  }

  if (
    !sameStrings(
      refs,
      input.expected
        .sourceUnitRefs,
    )
  ) {
    failures.push(
      failure(
        'STRUCTURE_MISMATCH',
        'Face neutral fact sourceUnitRefs do not match the deterministic renderer.',
        {
          segmentIndex:
            input.index,
          unitRef:
            input.expected
              .sourceUnitRefs[0],
        },
      ),
    );
  }

  if (
    input.raw.text !==
    input.expected.text
  ) {
    failures.push(
      failure(
        'NEUTRAL_FACT_TEXT_MISMATCH',
        'Face neutral fact text must equal the bounded deterministic realization exactly.',
        {
          segmentIndex:
            input.index,
          unitRef:
            input.expected
              .sourceUnitRefs[0],
        },
      ),
    );
  }

  if (
    input.raw.displayFactRef !==
    input.expected.displayFactRef
  ) {
    failures.push(
      failure(
        'DISPLAY_FACT_REF_MISMATCH',
        'Face neutral fact displayFactRef does not match the selected source fact.',
        {
          segmentIndex:
            input.index,
          unitRef:
            input.expected
              .sourceUnitRefs[0],
        },
      ),
    );
  }

  if (
    input.raw.capabilityKey !==
    input.expected.capabilityKey
  ) {
    failures.push(
      failure(
        'CAPABILITY_MISMATCH',
        'Face neutral fact capabilityKey does not match the selected source unit.',
        {
          segmentIndex:
            input.index,
          unitRef:
            input.expected
              .sourceUnitRefs[0],
        },
      ),
    );
  }

  if (
    input.raw.purpose !==
    input.expected.purpose
  ) {
    failures.push(
      failure(
        'STRUCTURE_MISMATCH',
        'Face neutral fact purpose does not match the deterministic Reading Plan.',
        {
          segmentIndex:
            input.index,
        },
      ),
    );
  }

  return Object.freeze(
    failures,
  );
}

function compareUnavailableSegment(
  input: Readonly<{
    raw:
      Record<string, unknown>;
    expected:
      Extract<
        CharacterFaceUtteranceSegmentV1,
        {
          kind:
            'unavailable_notice';
        }
      >;
    index: number;
  }>,
): readonly CharacterFaceSemanticGuardFailureV1[] {
  const failures:
    CharacterFaceSemanticGuardFailureV1[] =
      [];

  if (
    input.raw.attentionKey !==
      input.expected
        .attentionKey ||
    input.raw.status !==
      input.expected.status ||
    input.raw.text !==
      input.expected.text
  ) {
    failures.push(
      failure(
        'UNAVAILABLE_PROMOTED',
        'Face unavailable/not-present attention must remain the exact deterministic limitation notice.',
        {
          segmentIndex:
            input.index,
          attentionKey:
            input.expected
              .attentionKey,
        },
      ),
    );
  }

  return Object.freeze(
    failures,
  );
}

function compareFramingSegment(
  input: Readonly<{
    raw:
      Record<string, unknown>;
    expected:
      Extract<
        CharacterFaceUtteranceSegmentV1,
        {
          kind:
            | 'character_reaction'
            | 'follow_up_question';
        }
      >;
    selected:
      ReadonlySet<string>;
    index: number;
  }>,
): readonly CharacterFaceSemanticGuardFailureV1[] {
  const failures:
    CharacterFaceSemanticGuardFailureV1[] =
      [];
  const refs =
    stringArray(
      input.raw.sourceUnitRefs,
    );

  if (
    refs === null ||
    refs.length === 0
  ) {
    failures.push(
      failure(
        'STRUCTURE_MISMATCH',
        'Face Character framing segment requires sourceUnitRefs.',
        {
          segmentIndex:
            input.index,
        },
      ),
    );
    return Object.freeze(
      failures,
    );
  }

  for (const ref of refs) {
    if (
      !input.selected.has(ref)
    ) {
      failures.push(
        failure(
          'UNSELECTED_SOURCE_UNIT',
          'Face Character framing references a unit not selected by the Reading Plan.',
          {
            segmentIndex:
              input.index,
            unitRef: ref,
          },
        ),
      );
    }
  }

  if (
    !sameStrings(
      refs,
      input.expected
        .sourceUnitRefs,
    )
  ) {
    failures.push(
      failure(
        'STRUCTURE_MISMATCH',
        'Face Character framing sourceUnitRefs do not match the deterministic renderer.',
        {
          segmentIndex:
            input.index,
        },
      ),
    );
  }

  if (
    input.raw.text !==
      input.expected.text ||
    input.raw.framingKey !==
      input.expected.framingKey
  ) {
    failures.push(
      failure(
        'UNAUTHORED_CHARACTER_FRAMING',
        'Face Character framing must equal the admitted code-owned safe framing exactly.',
        {
          segmentIndex:
            input.index,
        },
      ),
    );
  }

  if (
    input.expected.kind ===
      'follow_up_question' &&
    input.raw.questionStrategy !==
      input.expected
        .questionStrategy
  ) {
    failures.push(
      failure(
        'UNAUTHORED_CHARACTER_FRAMING',
        'Face follow-up strategy must match the authored strategy selected by the Reading Plan.',
        {
          segmentIndex:
            input.index,
        },
      ),
    );
  }

  return Object.freeze(
    failures,
  );
}

function compareSegments(
  input: Readonly<{
    candidate: unknown;
    expected:
      CharacterFaceUtteranceV1;
    selectedUnitIds:
      readonly string[];
  }>,
): readonly CharacterFaceSemanticGuardFailureV1[] {
  if (
    !isRecord(
      input.candidate,
    ) ||
    !Array.isArray(
      input.candidate.segments,
    )
  ) {
    return Object.freeze([
      failure(
        'STRUCTURE_MISMATCH',
        'Character Face utterance must contain a segments array.',
      ),
    ]);
  }

  const failures:
    CharacterFaceSemanticGuardFailureV1[] =
      [];
  const rawSegments =
    input.candidate.segments;
  const expectedSegments =
    input.expected.segments;
  const selected =
    new Set(
      input.selectedUnitIds,
    );

  if (
    rawSegments.length >
    expectedSegments.length
  ) {
    failures.push(
      failure(
        'ADDED_CLAIM',
        'Character Face output contains additional segments not present in the deterministic Reading Plan.',
      ),
    );
  }

  if (
    rawSegments.length <
    expectedSegments.length
  ) {
    for (
      const segment
      of expectedSegments.slice(
        rawSegments.length,
      )
    ) {
      if (
        segment.kind ===
        'neutral_fact_realization'
      ) {
        failures.push(
          failure(
            'MISSING_SELECTED_UNIT',
            'Character Face output omitted a selected neutral fact unit.',
            {
              unitRef:
                segment
                  .sourceUnitRefs[0],
            },
          ),
        );
      } else {
        failures.push(
          failure(
            'STRUCTURE_MISMATCH',
            'Character Face output omitted a planned limitation or Character framing segment.',
          ),
        );
      }
    }
  }

  const length =
    Math.min(
      rawSegments.length,
      expectedSegments.length,
    );

  for (
    let index = 0;
    index < length;
    index += 1
  ) {
    const raw =
      rawSegments[index];
    const expected =
      expectedSegments[index]!;

    if (
      !isRecord(raw)
    ) {
      failures.push(
        failure(
          'STRUCTURE_MISMATCH',
          'Character Face segment must be an object.',
          {
            segmentIndex: index,
          },
        ),
      );
      continue;
    }

    if (
      raw.kind !==
      expected.kind
    ) {
      failures.push(
        failure(
          expected.kind ===
            'unavailable_notice'
            ? 'UNAVAILABLE_PROMOTED'
            : 'STRUCTURE_MISMATCH',
          expected.kind ===
            'unavailable_notice'
            ? 'An unavailable/not-present Face attention was promoted into another output segment kind.'
            : 'Character Face segment kind/order does not match the deterministic renderer.',
          {
            segmentIndex: index,
            ...(
              expected.kind ===
              'unavailable_notice'
                ? {
                    attentionKey:
                      expected.attentionKey,
                  }
                : {}
            ),
          },
        ),
      );
      continue;
    }

    switch (expected.kind) {
      case 'neutral_fact_realization':
        failures.push(
          ...compareNeutralFactSegment({
            raw,
            expected,
            selected,
            index,
          }),
        );
        break;

      case 'unavailable_notice':
        failures.push(
          ...compareUnavailableSegment({
            raw,
            expected,
            index,
          }),
        );
        break;

      case 'character_reaction':
      case 'follow_up_question':
        failures.push(
          ...compareFramingSegment({
            raw,
            expected,
            selected,
            index,
          }),
        );
        break;
    }
  }

  return Object.freeze(
    failures,
  );
}

export function guardCharacterFaceSemanticPreservationV1(
  input: Readonly<{
    candidate: unknown;
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
): CharacterFaceSemanticGuardDecisionV1 {
  const rendererDecision =
    renderCharacterFaceBoundedNeutralV1({
      context:
        input.context,
      grounding:
        input.grounding,
      characterContentVersion:
        input.characterContentVersion,
      capability:
        input.capability,
      perspective:
        input.perspective,
      deliveryProfile:
        input.deliveryProfile,
    });

  if (
    rendererDecision.mode ===
    'protected_fallback'
  ) {
    return Object.freeze({
      mode:
        'protected_fallback' as const,
      guardVersion:
        CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1,
      validationState:
        'fallback_used' as const,
      reason:
        'renderer_protected_fallback' as const,
      failures:
        Object.freeze([]),
      rendererDecision,
    });
  }

  const failures:
    CharacterFaceSemanticGuardFailureV1[] =
      [
        ...compareIdentity(
          input.candidate,
          rendererDecision
            .utterance,
        ),
        ...compareSegments({
          candidate:
            input.candidate,
          expected:
            rendererDecision
              .utterance,
          selectedUnitIds:
            rendererDecision
              .planDecision
              .selection
              .selectedUnitIds,
        }),
      ];

  if (
    failures.length > 0
  ) {
    return Object.freeze({
      mode:
        'protected_fallback' as const,
      guardVersion:
        CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1,
      validationState:
        'fallback_used' as const,
      reason:
        'semantic_guard_failed' as const,
      failures:
        Object.freeze(
          failures,
        ),
      rendererDecision,
    });
  }

  const neutralSegments =
    rendererDecision
      .utterance.segments
      .filter(
        (
          segment,
        ): segment is Extract<
          CharacterFaceUtteranceSegmentV1,
          {
            kind:
              'neutral_fact_realization';
          }
        > =>
          segment.kind ===
          'neutral_fact_realization',
      );

  const unavailableSegments =
    rendererDecision
      .utterance.segments
      .filter(
        (
          segment,
        ): segment is Extract<
          CharacterFaceUtteranceSegmentV1,
          {
            kind:
              'unavailable_notice';
          }
        > =>
          segment.kind ===
          'unavailable_notice',
      );

  return Object.freeze({
    mode:
      'accepted' as const,
    guardVersion:
      CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1,
    validationState:
      'semantic_validated' as const,
    utterance:
      rendererDecision
        .utterance,
    evidence:
      Object.freeze({
        exactNeutralFacts:
          true as const,
        characterId:
          rendererDecision
            .utterance
            .characterId,
        topicKey:
          rendererDecision
            .utterance
            .topicKey,
        bundleHash:
          rendererDecision
            .utterance
            .bundleHash,
        readingPlanRef:
          rendererDecision
            .utterance
            .readingPlanRef,
        deliveryProfileHash:
          rendererDecision
            .utterance
            .deliveryProfileRef
            .profileHash,
        validatedUnitIds:
          Object.freeze([
            ...rendererDecision
              .utterance
              .renderedUnitIds,
          ]),
        validatedDisplayFactRefs:
          Object.freeze(
            neutralSegments.map(
              (segment) =>
                segment
                  .displayFactRef,
            ),
          ),
        validatedUnavailableAttentionKeys:
          Object.freeze(
            unavailableSegments.map(
              (segment) =>
                segment
                  .attentionKey,
            ),
          ),
      }),
  });
}
