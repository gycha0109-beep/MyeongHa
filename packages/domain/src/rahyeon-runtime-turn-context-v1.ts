import {
  RAHYEON_FACT_AUTHORITY_REGISTRY_V1,
  RAHYEON_CONTEXTUAL_SURFACE_FACTS_V1,
  RAHYEON_PUBLIC_FACT_VALUES_V1,
  resolveCharacterFactAuthorityEntryV1,
  resolveCharacterRuntimeAuthorityLaneV1,
} from '../../character-content/src/index.js';
import type { CharacterDisclosureDecisionV2, CharacterDisclosureRetrievedSourceV2 } from './character-disclosure-gate-v2.js';
import { guardCharacterDisclosureRetrievalV2 } from './character-disclosure-gate-v2.js';
import type { CharacterRuntimeContextV1 } from './character-runtime-context.js';

export const RAHYEON_TURN_CONTEXT_VERSION_V1 = 'rahyeon-turn-context-v1' as const;

export const RAHYEON_TURN_KIND_KEYS_V1 = Object.freeze([
  'ordinary', 'biography', 'work', 'family', 'romance',
  'boundary', 'conflict', 'reconciliation', 'saju',
] as const);
export type RahyeonTurnKindV1 = (typeof RAHYEON_TURN_KIND_KEYS_V1)[number];

const SLICE_BY_KIND: Readonly<Record<RahyeonTurnKindV1, readonly string[]>> = Object.freeze({
  ordinary: ['B2', 'D', 'E1'],
  biography: ['B1', 'B3'],
  work: ['B1', 'C2', 'C3', 'I1', 'I4'],
  family: ['J2', 'F1'],
  romance: ['G', 'H', 'J4'],
  boundary: ['C1', 'F6', 'G7', 'L6'],
  conflict: ['C6', 'C7', 'F7', 'R9'],
  reconciliation: ['F7', 'G9', 'R5.4', 'R9.4'],
  saju: ['B2', 'E1', 'L5.1', 'L6'],
});

export interface RahyeonTurnSelectionV1 {
  /** Trusted server classification, not a raw user field. */
  readonly kind: RahyeonTurnKindV1;
  readonly requestedFactKeys: readonly string[];
  /** Preflight decision generated through the authoritative disclosure gate. */
  readonly disclosureDecision?: CharacterDisclosureDecisionV2;
  /** Only content retrieved AFTER disclosure preflight. Never raw hidden Bible. */
  readonly retrievedPrivateSources?: readonly CharacterDisclosureRetrievedSourceV2[];
}

export interface RahyeonTurnContextV1 {
  readonly version: typeof RAHYEON_TURN_CONTEXT_VERSION_V1;
  readonly characterId: 'rahyeon';
  readonly runtimeAuthorityVersion: string;
  readonly bibleSliceIds: readonly string[];
  readonly relationship: CharacterRuntimeContextV1['relationship'];
  readonly speech: CharacterRuntimeContextV1['speech'];
  readonly authorizedPublicFacts: readonly Readonly<{ factKey: string; value: string }>[];
  readonly privateDisclosure: Readonly<{
    readonly result: CharacterDisclosureDecisionV2['result'] | 'NOT_REQUESTED';
    readonly retrievedSources: readonly CharacterDisclosureRetrievedSourceV2[];
  }>;
  readonly actionHint: 'ordinary_reply' | 'direct_boundary' | 'repair_before_flirt' | 'source_grounded_reading';
}

/**
 * The renderer-facing Rahyeon slice is assembled from the already authorized
 * CharacterRuntimeContext. Caller must not pass uncontrolled user text as facts
 * or pass private biography before the disclosure preflight.
 *
 * This is a typed context bridge, not a production chat publication switch.
 */
export function composeRahyeonTurnContextV1(
  context: CharacterRuntimeContextV1,
  selection: RahyeonTurnSelectionV1,
): RahyeonTurnContextV1 {
  if (context.characterId !== 'rahyeon') {
    throw new TypeError('Rahyeon turn context cannot be used for a different Character.');
  }
  const lane = resolveCharacterRuntimeAuthorityLaneV1('rahyeon');
  if (lane === null) throw new TypeError('Reviewed Rahyeon runtime authority lane is unavailable.');
  if (!RAHYEON_TURN_KIND_KEYS_V1.includes(selection.kind)) {
    throw new TypeError('Unrecognized Rahyeon turn kind.');
  }
  if (selection.kind === 'saju' && context.saju === null) {
    throw new TypeError('Saju turn must contain independently admitted Saju context.');
  }
  if (context.saju !== null && selection.kind !== 'saju') {
    throw new TypeError('Saju context cannot be rendered as unconstrained ordinary dialogue.');
  }
  if (selection.requestedFactKeys.length > 12 ||
      new Set(selection.requestedFactKeys).size !== selection.requestedFactKeys.length) {
    throw new TypeError('Rahyeon fact request must be bounded and unique.');
  }

  const publicFacts: { factKey: string; value: string }[] = [];
  for (const key of selection.requestedFactKeys) {
    const authority = resolveCharacterFactAuthorityEntryV1(
      RAHYEON_FACT_AUTHORITY_REGISTRY_V1, key,
    );
    if (authority === null) {
      throw new TypeError('Unknown Rahyeon fact key must be resolved before context assembly.');
    }
    if (authority.sourceAuthority !== 'CANON' || authority.characterKnowledge !== 'KNOWN') {
      continue;
    }
    if (authority.disclosureDefault === 'PUBLIC' &&
        Object.prototype.hasOwnProperty.call(RAHYEON_PUBLIC_FACT_VALUES_V1, key)) {
      const value = RAHYEON_PUBLIC_FACT_VALUES_V1[
        key as keyof typeof RAHYEON_PUBLIC_FACT_VALUES_V1
      ];
      publicFacts.push(Object.freeze({ factKey: key, value }));
    } else if (authority.disclosureDefault === 'CONTEXTUAL' &&
        Object.prototype.hasOwnProperty.call(RAHYEON_CONTEXTUAL_SURFACE_FACTS_V1, key)) {
      // A bounded direct-answer exception for low-impact known facts only.
      // Neither past romance nor private emotional history is in this map.
      const surface = RAHYEON_CONTEXTUAL_SURFACE_FACTS_V1[
        key as keyof typeof RAHYEON_CONTEXTUAL_SURFACE_FACTS_V1
      ];
      if (surface.kind === selection.kind) {
        publicFacts.push(Object.freeze({ factKey: key, value: surface.value }));
      }
    }
  }

  const decision = selection.disclosureDecision;
  const privateSources = selection.retrievedPrivateSources ?? [];
  if (!decision) {
    if (privateSources.length !== 0) {
      throw new TypeError('Private biography requires an authorized disclosure decision.');
    }
  } else if (decision.characterId !== 'rahyeon' ||
             !selection.requestedFactKeys.includes(decision.factKey)) {
    throw new TypeError('Disclosure decision must match the requested Rahyeon fact.');
  } else {
    const sourceAuthority = resolveCharacterFactAuthorityEntryV1(
      RAHYEON_FACT_AUTHORITY_REGISTRY_V1, decision.factKey,
    );
    if (sourceAuthority === null ||
        sourceAuthority.sourceAuthority !== decision.authority.sourceAuthority ||
        sourceAuthority.characterKnowledge !== decision.authority.characterKnowledge ||
        sourceAuthority.disclosureDefault !== decision.authority.disclosureDefault) {
      throw new TypeError('Disclosure decision fact authority is not pinned to Rahyeon Canon.');
    }
  }
  const guardedPrivateSources = decision === undefined
    ? Object.freeze([] as CharacterDisclosureRetrievedSourceV2[])
    : guardCharacterDisclosureRetrievalV2({ decision, retrievedSources: privateSources });

  const events = context.relationship.recentEventKeys;
  const actionHint = selection.kind === 'conflict' ||
    (events.includes('CONFLICT_EVENT') && !events.includes('RECONCILIATION_EVENT'))
    ? 'direct_boundary'
    : selection.kind === 'reconciliation' || events.includes('RECONCILIATION_EVENT')
      ? 'repair_before_flirt'
      : selection.kind === 'saju' ? 'source_grounded_reading' : 'ordinary_reply';

  return Object.freeze({
    version: RAHYEON_TURN_CONTEXT_VERSION_V1,
    characterId: 'rahyeon',
    runtimeAuthorityVersion: lane.authorityVersion,
    bibleSliceIds: Object.freeze([...SLICE_BY_KIND[selection.kind]]),
    relationship: context.relationship,
    speech: context.speech,
    authorizedPublicFacts: Object.freeze(publicFacts),
    privateDisclosure: Object.freeze({
      result: decision?.result ?? 'NOT_REQUESTED',
      retrievedSources: guardedPrivateSources,
    }),
    actionHint,
  });
}
