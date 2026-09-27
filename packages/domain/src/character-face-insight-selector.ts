import {
  CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
  CHARACTER_FACE_SUPPORTED_REALIZATION_MODES_V1,
  CHARACTER_FACE_SUPPORTED_TOPIC_KEYS_V1,
  evaluateCharacterFaceCapabilityV1,
  type CharacterFaceCapabilityDecisionV1,
  type CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import {
  type CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';
import {
  admitCharacterFaceGroundingBundleViewV1,
  type CharacterFaceGroundingBundleViewV1,
  type CharacterFaceObservationUnitViewV1,
} from './character-face-grounding-bundle.js';
import {
  CHARACTER_FACE_ATTENTION_KEYS_V1,
  CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
  CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_UNCERTAINTY_HANDLING_V1,
  assertCharacterFacePerspectiveCapabilityCompatibilityV1,
  type CharacterFaceAttentionKeyV1,
  type CharacterFacePerspectiveProfileV1,
} from './character-face-perspective.js';
import {
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
} from './character-face-grounding-admission.js';

export const CHARACTER_FACE_INSIGHT_SELECTION_SCHEMA_VERSION_V1 =
  'character-face-insight-selection-v1' as const;

export type CharacterFaceSelectionReasonCodeV1 =
  | 'selected_attention_preferred'
  | 'not_selected_by_perspective'
  | 'max_units_exhausted'
  | 'duplicate_capability_omitted';

export interface CharacterFaceSelectionReasonV1 {
  readonly unitId: string;
  readonly capabilityKey: string;
  readonly disposition: 'selected' | 'omitted';
  readonly codes:
    readonly CharacterFaceSelectionReasonCodeV1[];
}

export type CharacterFaceAttentionResolutionStatusV1 =
  | 'selected'
  | 'omitted_max_units'
  | 'unavailable'
  | 'not_present';

export interface CharacterFaceAttentionResolutionV1 {
  readonly attentionKey:
    CharacterFaceAttentionKeyV1;
  readonly status:
    CharacterFaceAttentionResolutionStatusV1;
  readonly unitId?: string;
}

export interface CharacterFaceInsightSelectionV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_INSIGHT_SELECTION_SCHEMA_VERSION_V1;
  readonly characterId: string;
  readonly topicKey: string;
  readonly bundleHash: string;
  readonly capabilityVersion: string;
  readonly perspectiveVersion: string;
  readonly coverage: 'full' | 'partial';
  readonly selectedUnitIds:
    readonly string[];
  readonly orderedUnitIds:
    readonly string[];
  readonly omittedUnitIds:
    readonly string[];
  readonly selectionReasons:
    readonly CharacterFaceSelectionReasonV1[];
  readonly attentionResolutions:
    readonly CharacterFaceAttentionResolutionV1[];
}

export class CharacterFaceInsightSelectionErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name =
      'CharacterFaceInsightSelectionErrorV1';
  }
}

const CAPABILITY_KEYS = Object.freeze([
  'schemaVersion',
  'capabilityVersion',
  'characterId',
  'sourceContentVersion',
  'sourceFaceProfileVersion',
  'allowedTopicKeys',
  'allowedModes',
  'allowPartial',
  'canInitiate',
] as const);

const PERSPECTIVE_KEYS = Object.freeze([
  'schemaVersion',
  'perspectiveVersion',
  'characterId',
  'sourceContentVersion',
  'sourceFaceProfileVersion',
  'groundingProjectionVersion',
  'attentionRegistryVersion',
  'attentionOrder',
  'selection',
  'uncertaintyHandling',
  'deliveryAuthority',
] as const);

const PERSPECTIVE_SELECTION_KEYS =
  Object.freeze([
    'maxUnits',
    'avoidDuplicateCapability',
    'preserveSourceOrderForTies',
  ] as const);

const PERSPECTIVE_DELIVERY_KEYS =
  Object.freeze([
    'speech',
    'communication',
    'relationship',
  ] as const);

function fail(message: string): never {
  throw new CharacterFaceInsightSelectionErrorV1(
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

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected =
    Object.keys(value).find(
      (key) => !allowedSet.has(key),
    );
  if (unexpected !== undefined) {
    fail(
      `${path} contains unexpected field: ${unexpected}.`,
    );
  }
}

function requireNonEmptyString(
  value: unknown,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    fail(
      `${path} must be a non-empty string.`,
    );
  }
  return value;
}

function assertRuntimeCapability(
  capability:
    CharacterFaceCapabilityProfileV1,
): void {
  if (!isRecord(capability)) {
    fail(
      'Character Face capability must be an admitted profile object.',
    );
  }
  assertOnlyKeys(
    capability,
    CAPABILITY_KEYS,
    'CharacterFaceCapabilityProfileV1',
  );

  if (
    capability.schemaVersion !==
    CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1
  ) {
    fail(
      'Character Face capability schemaVersion is not supported.',
    );
  }

  requireNonEmptyString(
    capability.capabilityVersion,
    'capability.capabilityVersion',
  );
  requireNonEmptyString(
    capability.characterId,
    'capability.characterId',
  );
  requireNonEmptyString(
    capability.sourceContentVersion,
    'capability.sourceContentVersion',
  );
  requireNonEmptyString(
    capability.sourceFaceProfileVersion,
    'capability.sourceFaceProfileVersion',
  );

  if (
    !Array.isArray(
      capability.allowedTopicKeys,
    ) ||
    capability.allowedTopicKeys.length ===
      0 ||
    new Set(
      capability.allowedTopicKeys,
    ).size !==
      capability.allowedTopicKeys.length ||
    capability.allowedTopicKeys.some(
      (topicKey) =>
        !(
          CHARACTER_FACE_SUPPORTED_TOPIC_KEYS_V1 as readonly string[]
        ).includes(topicKey),
    )
  ) {
    fail(
      'Character Face capability contains unsupported or duplicate topic keys.',
    );
  }

  if (
    !Array.isArray(
      capability.allowedModes,
    ) ||
    capability.allowedModes.length === 0 ||
    new Set(
      capability.allowedModes,
    ).size !==
      capability.allowedModes.length ||
    capability.allowedModes.some(
      (mode) =>
        !(
          CHARACTER_FACE_SUPPORTED_REALIZATION_MODES_V1 as readonly string[]
        ).includes(mode),
    )
  ) {
    fail(
      'Character Face capability contains unsupported or duplicate realization modes.',
    );
  }

  if (
    typeof capability.allowPartial !==
      'boolean' ||
    typeof capability.canInitiate !==
      'boolean'
  ) {
    fail(
      'Character Face capability behavior flags must be boolean.',
    );
  }
}

function assertRuntimePerspective(
  perspective:
    CharacterFacePerspectiveProfileV1,
): void {
  if (!isRecord(perspective)) {
    fail(
      'Character Face Perspective must be an admitted profile object.',
    );
  }
  assertOnlyKeys(
    perspective,
    PERSPECTIVE_KEYS,
    'CharacterFacePerspectiveProfileV1',
  );

  if (
    perspective.schemaVersion !==
    CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1
  ) {
    fail(
      'Character Face Perspective schemaVersion is not supported.',
    );
  }

  if (
    perspective.groundingProjectionVersion !==
    FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1
  ) {
    fail(
      'Character Face Perspective grounding projection version is not supported.',
    );
  }

  if (
    perspective.attentionRegistryVersion !==
    CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1
  ) {
    fail(
      'Character Face Perspective attention registry version is not supported.',
    );
  }

  requireNonEmptyString(
    perspective.perspectiveVersion,
    'perspective.perspectiveVersion',
  );
  requireNonEmptyString(
    perspective.characterId,
    'perspective.characterId',
  );
  requireNonEmptyString(
    perspective.sourceContentVersion,
    'perspective.sourceContentVersion',
  );
  requireNonEmptyString(
    perspective.sourceFaceProfileVersion,
    'perspective.sourceFaceProfileVersion',
  );

  if (
    !Array.isArray(
      perspective.attentionOrder,
    ) ||
    perspective.attentionOrder.length ===
      0 ||
    new Set(
      perspective.attentionOrder,
    ).size !==
      perspective.attentionOrder.length ||
    perspective.attentionOrder.some(
      (attentionKey) =>
        !(
          CHARACTER_FACE_ATTENTION_KEYS_V1 as readonly string[]
        ).includes(attentionKey),
    )
  ) {
    fail(
      'Character Face Perspective contains unsupported or duplicate attention keys.',
    );
  }

  if (
    !isRecord(
      perspective.selection,
    )
  ) {
    fail(
      'Character Face Perspective selection must be an object.',
    );
  }
  assertOnlyKeys(
    perspective.selection,
    PERSPECTIVE_SELECTION_KEYS,
    'CharacterFacePerspectiveProfileV1.selection',
  );

  if (
    !Number.isInteger(
      perspective.selection.maxUnits,
    ) ||
    perspective.selection.maxUnits < 1 ||
    perspective.selection.maxUnits > 4
  ) {
    fail(
      'Character Face Perspective maxUnits must remain within 1..4.',
    );
  }

  if (
    perspective.selection
      .avoidDuplicateCapability !== true ||
    perspective.selection
      .preserveSourceOrderForTies !== true
  ) {
    fail(
      'Character Face Perspective deterministic selection safeguards must remain enabled.',
    );
  }

  if (
    !(
      CHARACTER_FACE_UNCERTAINTY_HANDLING_V1 as readonly string[]
    ).includes(
      perspective.uncertaintyHandling,
    )
  ) {
    fail(
      'Character Face Perspective uncertainty handling is not supported.',
    );
  }

  if (
    !isRecord(
      perspective.deliveryAuthority,
    )
  ) {
    fail(
      'Character Face Perspective deliveryAuthority must be an object.',
    );
  }
  assertOnlyKeys(
    perspective.deliveryAuthority,
    PERSPECTIVE_DELIVERY_KEYS,
    'CharacterFacePerspectiveProfileV1.deliveryAuthority',
  );

  if (
    perspective.deliveryAuthority.speech !==
      'published_character_speech' ||
    perspective.deliveryAuthority
      .communication !==
      'published_character_persona_communication' ||
    perspective.deliveryAuthority
      .relationship !==
      'active_relationship_projection'
  ) {
    fail(
      'Character Face Perspective delivery authority is not supported.',
    );
  }
}

function requireAllowedDecision(
  decision:
    CharacterFaceCapabilityDecisionV1,
): Extract<
  CharacterFaceCapabilityDecisionV1,
  { readonly allowed: true }
> {
  if (!decision.allowed) {
    fail(
      `Character Face capability denied: ${decision.reason}.`,
    );
  }
  return decision;
}

function unitMapByCapability(
  units:
    readonly CharacterFaceObservationUnitViewV1[],
): ReadonlyMap<
  string,
  readonly CharacterFaceObservationUnitViewV1[]
> {
  const mutable = new Map<
    string,
    CharacterFaceObservationUnitViewV1[]
  >();

  for (const unit of units) {
    const entries =
      mutable.get(unit.capabilityKey) ??
      [];
    entries.push(unit);
    mutable.set(
      unit.capabilityKey,
      entries,
    );
  }

  return new Map(
    [...mutable.entries()].map(
      ([key, entries]) => [
        key,
        Object.freeze([...entries]),
      ],
    ),
  );
}

function unavailableObservationKey(
  attentionKey:
    CharacterFaceAttentionKeyV1,
): string {
  return `observation:${attentionKey}`;
}

function assertSelectionInvariants(
  input: Readonly<{
    grounding:
      CharacterFaceGroundingBundleViewV1;
    selectedUnitIds:
      readonly string[];
    orderedUnitIds:
      readonly string[];
    omittedUnitIds:
      readonly string[];
    selectionReasons:
      readonly CharacterFaceSelectionReasonV1[];
    attentionResolutions:
      readonly CharacterFaceAttentionResolutionV1[];
    perspective:
      CharacterFacePerspectiveProfileV1;
  }>,
): void {
  const sourceIds =
    input.grounding.units.map(
      (unit) => unit.unitId,
    );
  const selected =
    new Set(input.selectedUnitIds);
  const omitted =
    new Set(input.omittedUnitIds);

  if (
    selected.size !==
      input.selectedUnitIds.length ||
    omitted.size !==
      input.omittedUnitIds.length ||
    input.orderedUnitIds.length !==
      input.selectedUnitIds.length ||
    new Set(
      input.orderedUnitIds,
    ).size !==
      input.orderedUnitIds.length
  ) {
    fail(
      'Character Face selection contains duplicate unit identities.',
    );
  }

  if (
    input.selectedUnitIds.some(
      (unitId) => omitted.has(unitId),
    )
  ) {
    fail(
      'Character Face selected and omitted unit partitions overlap.',
    );
  }

  const partition =
    new Set([
      ...input.selectedUnitIds,
      ...input.omittedUnitIds,
    ]);
  if (
    partition.size !== sourceIds.length ||
    sourceIds.some(
      (unitId) =>
        !partition.has(unitId),
    )
  ) {
    fail(
      'Character Face selection does not partition all source units.',
    );
  }

  if (
    input.orderedUnitIds.some(
      (unitId) =>
        !selected.has(unitId),
    ) ||
    input.selectedUnitIds.some(
      (unitId) =>
        !input.orderedUnitIds.includes(
          unitId,
        ),
    )
  ) {
    fail(
      'Character Face orderedUnitIds must contain exactly the selected unit set.',
    );
  }

  if (
    input.selectionReasons.length !==
      sourceIds.length ||
    new Set(
      input.selectionReasons.map(
        (reason) => reason.unitId,
      ),
    ).size !== sourceIds.length ||
    input.selectionReasons.some(
      (reason) =>
        !partition.has(reason.unitId),
    )
  ) {
    fail(
      'Character Face selection reasons must cover every source unit exactly once.',
    );
  }

  if (
    input.attentionResolutions.length !==
    input.perspective.attentionOrder.length
  ) {
    fail(
      'Character Face attention resolutions must cover every Perspective attention key.',
    );
  }
}

export function selectCharacterFaceInsightsV1(
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
): CharacterFaceInsightSelectionV1 {
  if (input.context.face === null) {
    fail(
      'Character Face insight selection requires an admitted Face context.',
    );
  }

  assertRuntimeCapability(
    input.capability,
  );
  assertRuntimePerspective(
    input.perspective,
  );

  try {
    assertCharacterFacePerspectiveCapabilityCompatibilityV1({
      capability: input.capability,
      perspective: input.perspective,
    });
  } catch (error) {
    fail(
      `Character Face Capability/Perspective identity mismatch: ${String(
        error instanceof Error
          ? error.message
          : error,
      )}`,
    );
  }

  const grounding =
    admitCharacterFaceGroundingBundleViewV1(
      {
        candidate: input.grounding,
        context: input.context.face,
      },
    );

  const capabilityDecision =
    requireAllowedDecision(
      evaluateCharacterFaceCapabilityV1({
        characterId:
          input.context.characterId,
        characterContentVersion:
          input.characterContentVersion,
        faceContext:
          input.context.face,
        grounding,
        capability:
          input.capability,
      }),
    );

  const byCapability =
    unitMapByCapability(
      grounding.units,
    );
  const selected = new Set<string>();
  const reasonCodes = new Map<
    string,
    readonly CharacterFaceSelectionReasonCodeV1[]
  >();
  const orderedUnitIds: string[] = [];
  const attentionResolutions:
    CharacterFaceAttentionResolutionV1[] =
      [];

  for (
    const attentionKey
    of input.perspective.attentionOrder
  ) {
    const candidates =
      byCapability.get(
        attentionKey,
      ) ?? [];

    if (candidates.length === 0) {
      const unavailable =
        grounding.unavailableSections.includes(
          unavailableObservationKey(
            attentionKey,
          ),
        );

      attentionResolutions.push(
        Object.freeze({
          attentionKey,
          status:
            unavailable
              ? 'unavailable'
              : 'not_present',
        }),
      );
      continue;
    }

    if (
      selected.size >=
      input.perspective.selection.maxUnits
    ) {
      const firstCandidate =
        candidates[0];
      if (firstCandidate === undefined) {
        fail(
          'Character Face selector encountered an empty capability candidate group.',
        );
      }

      for (const candidate of candidates) {
        if (
          !reasonCodes.has(
            candidate.unitId,
          )
        ) {
          reasonCodes.set(
            candidate.unitId,
            Object.freeze([
              'max_units_exhausted',
            ]),
          );
        }
      }

      attentionResolutions.push(
        Object.freeze({
          attentionKey,
          status:
            'omitted_max_units',
          unitId:
            firstCandidate.unitId,
        }),
      );
      continue;
    }

    const primary =
      candidates[0];
    if (primary === undefined) {
      fail(
        'Character Face selector encountered an empty capability candidate group.',
      );
    }

    selected.add(primary.unitId);
    orderedUnitIds.push(
      primary.unitId,
    );
    reasonCodes.set(
      primary.unitId,
      Object.freeze([
        'selected_attention_preferred',
      ]),
    );

    for (
      const duplicate
      of candidates.slice(1)
    ) {
      reasonCodes.set(
        duplicate.unitId,
        Object.freeze([
          'duplicate_capability_omitted',
        ]),
      );
    }

    attentionResolutions.push(
      Object.freeze({
        attentionKey,
        status: 'selected',
        unitId: primary.unitId,
      }),
    );
  }

  for (const unit of grounding.units) {
    if (
      selected.has(unit.unitId) ||
      reasonCodes.has(unit.unitId)
    ) {
      continue;
    }

    reasonCodes.set(
      unit.unitId,
      Object.freeze([
        'not_selected_by_perspective',
      ]),
    );
  }

  const selectedUnitIds =
    Object.freeze(
      grounding.units
        .filter((unit) =>
          selected.has(unit.unitId),
        )
        .map((unit) => unit.unitId),
    );
  const frozenOrderedUnitIds =
    Object.freeze([
      ...orderedUnitIds,
    ]);
  const omittedUnitIds =
    Object.freeze(
      grounding.units
        .filter(
          (unit) =>
            !selected.has(
              unit.unitId,
            ),
        )
        .map((unit) => unit.unitId),
    );

  const selectionReasons =
    Object.freeze(
      grounding.units.map(
        (unit) =>
          Object.freeze({
            unitId: unit.unitId,
            capabilityKey:
              unit.capabilityKey,
            disposition:
              selected.has(unit.unitId)
                ? ('selected' as const)
                : ('omitted' as const),
            codes:
              reasonCodes.get(
                unit.unitId,
              ) ??
              Object.freeze([
                'not_selected_by_perspective' as const,
              ]),
          }),
      ),
    );

  const frozenAttentionResolutions =
    Object.freeze([
      ...attentionResolutions,
    ]);

  assertSelectionInvariants({
    grounding,
    selectedUnitIds,
    orderedUnitIds:
      frozenOrderedUnitIds,
    omittedUnitIds,
    selectionReasons,
    attentionResolutions:
      frozenAttentionResolutions,
    perspective:
      input.perspective,
  });

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_INSIGHT_SELECTION_SCHEMA_VERSION_V1,
    characterId:
      input.context.characterId,
    topicKey:
      grounding.topicKey,
    bundleHash:
      grounding.bundleHash,
    capabilityVersion:
      input.capability
        .capabilityVersion,
    perspectiveVersion:
      input.perspective
        .perspectiveVersion,
    coverage:
      capabilityDecision.coverage,
    selectedUnitIds,
    orderedUnitIds:
      frozenOrderedUnitIds,
    omittedUnitIds,
    selectionReasons,
    attentionResolutions:
      frozenAttentionResolutions,
  });
}
