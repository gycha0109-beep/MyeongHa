import { createHash } from 'node:crypto';

import type { SajuDomain } from '../../contracts/src/index.js';
import { canonicalJson } from './registry.js';
import type { CharacterRuntimeContextWithGroundingV1 } from './character-saju-grounding-admission.js';
import {
  admitCharacterSajuGroundingBundleViewV1,
  type CharacterGroundingUnitViewV1,
  type CharacterSajuGroundingBundleViewV1,
} from './character-saju-insight-selector.js';
import type { CharacterPerspectiveProfileV1 } from './character-saju-perspective.js';
import {
  renderCharacterSajuBoundedExactCoreV1,
  type CharacterSajuUtteranceSegmentV1,
  type CharacterSajuUtteranceV1,
} from './character-saju-bounded-renderer.js';
import {
  CHARACTER_SAJU_SEMANTIC_GUARD_VERSION_V1,
  guardCharacterSajuSemanticPreservationV1,
} from './character-saju-semantic-guard.js';

export const CHARACTER_SAJU_COUNCIL_SCHEMA_VERSION_V1 =
  'myeongha-character-saju-council-v1' as const;
export const CHARACTER_SAJU_COUNCIL_DIRECTOR_VERSION_V1 =
  'myeongha-character-saju-council-director-v1' as const;

export const CHARACTER_SAJU_COUNCIL_MIN_PARTICIPANTS_V1 = 2 as const;
export const CHARACTER_SAJU_COUNCIL_MAX_PARTICIPANTS_V1 = 3 as const;
export const CHARACTER_SAJU_COUNCIL_MIN_TURNS_V1 = 3 as const;
export const CHARACTER_SAJU_COUNCIL_MAX_TURNS_V1 = 5 as const;

export interface CharacterSajuCouncilParticipantV1 {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly perspective: CharacterPerspectiveProfileV1;
}

export interface CharacterSajuCouncilTurnV1 {
  readonly turnIndex: number;
  readonly characterId: string;
  readonly readingRef: string;
  readonly groundingHash: string;
  readonly noveltyUnitIds: readonly string[];
  readonly repeatedUnitIds: readonly string[];
  readonly utterance: CharacterSajuUtteranceV1;
  readonly semanticGuardVersion: typeof CHARACTER_SAJU_SEMANTIC_GUARD_VERSION_V1;
  readonly validationState: 'semantic_validated';
}

export interface CharacterSajuCouncilTranscriptV1 {
  readonly schemaVersion: typeof CHARACTER_SAJU_COUNCIL_SCHEMA_VERSION_V1;
  readonly councilId: string;
  readonly directorVersion: typeof CHARACTER_SAJU_COUNCIL_DIRECTOR_VERSION_V1;
  readonly readingRef: string;
  readonly groundingHash: string;
  readonly sourceResponseHash: string;
  readonly requestedDomain: SajuDomain;
  readonly maxTurns: number;
  readonly participantCharacterIds: readonly string[];
  readonly turns: readonly CharacterSajuCouncilTurnV1[];
  readonly coveredUnitIds: readonly string[];
  readonly revealState: 'requires_existing_output_guard';
}

export const CHARACTER_SAJU_COUNCIL_FAILURE_CODES_V1 = Object.freeze([
  'GROUNDING_IDENTITY_MISMATCH',
  'TURN_LIMIT_EXCEEDED',
  'TURN_IDENTITY_MISMATCH',
  'UNTRACEABLE_SEMANTIC_LINE',
  'CROSS_TURN_SEMANTIC_CONTRADICTION',
  'REQUIRED_DISCLOSURE_MISSING',
] as const);

export type CharacterSajuCouncilFailureCodeV1 =
  (typeof CHARACTER_SAJU_COUNCIL_FAILURE_CODES_V1)[number];

export interface CharacterSajuCouncilFailureV1 {
  readonly code: CharacterSajuCouncilFailureCodeV1;
  readonly detail: string;
  readonly turnIndex?: number;
  readonly characterId?: string;
  readonly unitRef?: string;
  readonly disclosureRef?: string;
}

export interface CharacterSajuCouncilConsistencyEvidenceV1 {
  readonly sameReadingRef: true;
  readonly sameGroundingHash: true;
  readonly noPerCharacterRecalculation: true;
  readonly finiteTurns: true;
  readonly semanticTraceComplete: true;
  readonly requiredDisclosuresPreserved: true;
  readonly exactCoreCrossTurnConsistency: true;
  readonly requiresExistingOutputGuard: true;
}

export type CharacterSajuCouncilDecisionV1 =
  | {
      readonly mode: 'council';
      readonly validationState: 'council_validated';
      readonly transcript: CharacterSajuCouncilTranscriptV1;
      readonly consistencyEvidence: CharacterSajuCouncilConsistencyEvidenceV1;
    }
  | {
      readonly mode: 'protected_fallback';
      readonly validationState: 'fallback_used';
      readonly reason:
        | 'participant_protected_fallback'
        | 'council_consistency_guard_failed';
      readonly failures: readonly CharacterSajuCouncilFailureV1[];
      readonly failedCharacterId?: string;
    };

export class CharacterSajuCouncilErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterSajuCouncilErrorV1';
  }
}

function sha256Json(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function failure(
  code: CharacterSajuCouncilFailureCodeV1,
  detail: string,
  extra: Pick<
    CharacterSajuCouncilFailureV1,
    'turnIndex' | 'characterId' | 'unitRef' | 'disclosureRef'
  > = {},
): CharacterSajuCouncilFailureV1 {
  return Object.freeze({ code, detail, ...extra });
}

function assertCouncilInputs(input: {
  readonly participants: readonly CharacterSajuCouncilParticipantV1[];
  readonly requestedDomain: SajuDomain;
  readonly maxTurns: number;
}): void {
  if (
    input.participants.length < CHARACTER_SAJU_COUNCIL_MIN_PARTICIPANTS_V1 ||
    input.participants.length > CHARACTER_SAJU_COUNCIL_MAX_PARTICIPANTS_V1
  ) {
    throw new CharacterSajuCouncilErrorV1(
      'Finite Saju Council requires exactly 2 or 3 Character participants.',
    );
  }
  if (
    !Number.isInteger(input.maxTurns) ||
    input.maxTurns < CHARACTER_SAJU_COUNCIL_MIN_TURNS_V1 ||
    input.maxTurns > CHARACTER_SAJU_COUNCIL_MAX_TURNS_V1
  ) {
    throw new CharacterSajuCouncilErrorV1(
      'Finite Saju Council maxTurns must be an integer between 3 and 5.',
    );
  }

  const ids = input.participants.map((participant) => participant.context.characterId);
  if (new Set(ids).size !== ids.length) {
    throw new CharacterSajuCouncilErrorV1(
      'Finite Saju Council participants must have unique Character identities.',
    );
  }

  for (const participant of input.participants) {
    if (participant.perspective.characterId !== participant.context.characterId) {
      throw new CharacterSajuCouncilErrorV1(
        'Council Character perspective must match the active Character context.',
      );
    }
    if (participant.context.saju === null) {
      throw new CharacterSajuCouncilErrorV1(
        'Finite Saju Council requires a Saju-bearing context for every participant.',
      );
    }
    if (participant.context.saju.domain !== input.requestedDomain) {
      throw new CharacterSajuCouncilErrorV1(
        'Council participant Saju domain must match the requested domain.',
      );
    }
  }
}

function sameGroundingIdentity(input: {
  readonly participants: readonly CharacterSajuCouncilParticipantV1[];
  readonly grounding: CharacterSajuGroundingBundleViewV1;
}): void {
  for (const participant of input.participants) {
    const ref = participant.context.saju?.groundingRef ?? null;
    if (
      ref === null ||
      ref.readingRef !== input.grounding.readingRef ||
      ref.groundingHash !== input.grounding.groundingHash ||
      ref.sourceResponseHash !== input.grounding.sourceResponseHash ||
      ref.groundingProjectionVersion !== input.grounding.groundingProjectionVersion ||
      ref.axisRegistryVersion !== input.grounding.axisRegistryVersion ||
      ref.readingDomain !== input.grounding.readingDomain
    ) {
      throw new CharacterSajuCouncilErrorV1(
        'All Council participants must consume the same admitted Saju grounding identity.',
      );
    }

    admitCharacterSajuGroundingBundleViewV1({
      candidate: input.grounding,
      expectedRef: ref,
    });
  }
}

interface PreparedCouncilParticipantV1 {
  readonly participant: CharacterSajuCouncilParticipantV1;
  readonly inputIndex: number;
  readonly selectedUnitIds: readonly string[];
  readonly candidate: CharacterSajuUtteranceV1;
}

function noveltyCount(
  selectedUnitIds: readonly string[],
  covered: ReadonlySet<string>,
): number {
  return selectedUnitIds.filter((unitId) => !covered.has(unitId)).length;
}

function orderForCoverage(
  prepared: readonly PreparedCouncilParticipantV1[],
): readonly PreparedCouncilParticipantV1[] {
  const remaining = [...prepared];
  const ordered: PreparedCouncilParticipantV1[] = [];
  const covered = new Set<string>();

  const lead = remaining.shift();
  if (lead === undefined) return Object.freeze([]);
  ordered.push(lead);
  lead.selectedUnitIds.forEach((unitId) => covered.add(unitId));

  while (remaining.length > 0) {
    remaining.sort((left, right) => {
      const noveltyDelta =
        noveltyCount(right.selectedUnitIds, covered) -
        noveltyCount(left.selectedUnitIds, covered);
      if (noveltyDelta !== 0) return noveltyDelta;
      return left.inputIndex - right.inputIndex;
    });
    const next = remaining.shift()!;
    ordered.push(next);
    next.selectedUnitIds.forEach((unitId) => covered.add(unitId));
  }

  return Object.freeze(ordered);
}

function semanticSegments(
  utterance: CharacterSajuUtteranceV1,
): readonly Extract<CharacterSajuUtteranceSegmentV1, { kind: 'semantic_realization' }>[] {
  return utterance.segments.filter(
    (
      segment,
    ): segment is Extract<
      CharacterSajuUtteranceSegmentV1,
      { kind: 'semantic_realization' }
    > => segment.kind === 'semantic_realization',
  );
}

function disclosureSegments(
  utterance: CharacterSajuUtteranceV1,
): readonly Extract<CharacterSajuUtteranceSegmentV1, { kind: 'protected_disclosure' }>[] {
  return utterance.segments.filter(
    (
      segment,
    ): segment is Extract<
      CharacterSajuUtteranceSegmentV1,
      { kind: 'protected_disclosure' }
    > => segment.kind === 'protected_disclosure',
  );
}

export function guardCharacterSajuCouncilConsistencyV1(input: {
  readonly transcript: CharacterSajuCouncilTranscriptV1;
  readonly grounding: CharacterSajuGroundingBundleViewV1;
}): {
  readonly failures: readonly CharacterSajuCouncilFailureV1[];
  readonly evidence?: CharacterSajuCouncilConsistencyEvidenceV1;
} {
  const failures: CharacterSajuCouncilFailureV1[] = [];
  const byUnitId = new Map(input.grounding.units.map((unit) => [unit.unitId, unit]));
  const disclosureByRef = new Map(
    input.grounding.disclosures.map((disclosure) => [
      disclosure.disclosureRef,
      disclosure,
    ]),
  );

  if (
    input.transcript.readingRef !== input.grounding.readingRef ||
    input.transcript.groundingHash !== input.grounding.groundingHash ||
    input.transcript.sourceResponseHash !== input.grounding.sourceResponseHash
  ) {
    failures.push(
      failure(
        'GROUNDING_IDENTITY_MISMATCH',
        'Council transcript grounding identity does not match the admitted shared grounding.',
      ),
    );
  }

  if (
    input.transcript.turns.length > input.transcript.maxTurns ||
    input.transcript.maxTurns > CHARACTER_SAJU_COUNCIL_MAX_TURNS_V1
  ) {
    failures.push(
      failure('TURN_LIMIT_EXCEEDED', 'Council transcript exceeds its finite turn bound.'),
    );
  }

  const canonicalMeaningByUnit = new Map<string, string>();
  input.grounding.units.forEach((unit) =>
    canonicalMeaningByUnit.set(unit.unitId, unit.canonicalMeaning),
  );

  input.transcript.turns.forEach((turn, turnIndex) => {
    if (
      turn.turnIndex !== turnIndex ||
      turn.readingRef !== input.grounding.readingRef ||
      turn.groundingHash !== input.grounding.groundingHash ||
      turn.utterance.readingRef !== input.grounding.readingRef ||
      turn.utterance.characterId !== turn.characterId
    ) {
      failures.push(
        failure(
          'TURN_IDENTITY_MISMATCH',
          'Council turn identity does not match the shared reading and active Character.',
          { turnIndex, characterId: turn.characterId },
        ),
      );
    }

    for (const segment of semanticSegments(turn.utterance)) {
      if (segment.sourceUnitRefs.length !== 1) {
        failures.push(
          failure(
            'UNTRACEABLE_SEMANTIC_LINE',
            'Exact-core Council semantic lines must trace to exactly one source unit.',
            { turnIndex, characterId: turn.characterId },
          ),
        );
        continue;
      }
      const unitRef = segment.sourceUnitRefs[0]!;
      const unit = byUnitId.get(unitRef);
      if (unit === undefined) {
        failures.push(
          failure(
            'UNTRACEABLE_SEMANTIC_LINE',
            'Council semantic line references a unit outside the shared grounding.',
            { turnIndex, characterId: turn.characterId, unitRef },
          ),
        );
        continue;
      }
      if (segment.text !== unit.canonicalMeaning) {
        failures.push(
          failure(
            'CROSS_TURN_SEMANTIC_CONTRADICTION',
            'Council semantic line diverges from the shared exact-core canonical meaning.',
            { turnIndex, characterId: turn.characterId, unitRef },
          ),
        );
      }
      const prior = canonicalMeaningByUnit.get(unitRef);
      if (prior !== undefined && prior !== segment.text) {
        failures.push(
          failure(
            'CROSS_TURN_SEMANTIC_CONTRADICTION',
            'Council turns disagree on the same shared semantic unit.',
            { turnIndex, characterId: turn.characterId, unitRef },
          ),
        );
      }
    }

    const renderedUnits = turn.utterance.renderedUnitIds
      .map((unitRef) => byUnitId.get(unitRef))
      .filter((unit): unit is CharacterGroundingUnitViewV1 => unit !== undefined);
    const requiredDisclosures = new Set(
      renderedUnits.flatMap((unit) => unit.requiredDisclosureRefs),
    );
    const renderedDisclosures = new Map(
      disclosureSegments(turn.utterance).map((segment) => [
        segment.disclosureRef,
        segment,
      ]),
    );

    for (const disclosureRef of requiredDisclosures) {
      const source = disclosureByRef.get(disclosureRef);
      const rendered = renderedDisclosures.get(disclosureRef);
      if (
        source === undefined ||
        rendered === undefined ||
        rendered.text !== source.text
      ) {
        failures.push(
          failure(
            'REQUIRED_DISCLOSURE_MISSING',
            'Council turn omitted or changed a disclosure required by a rendered source unit.',
            {
              turnIndex,
              characterId: turn.characterId,
              disclosureRef,
            },
          ),
        );
      }
    }
  });

  if (failures.length > 0) {
    return Object.freeze({ failures: Object.freeze(failures) });
  }

  return Object.freeze({
    failures: Object.freeze([]),
    evidence: Object.freeze({
      sameReadingRef: true as const,
      sameGroundingHash: true as const,
      noPerCharacterRecalculation: true as const,
      finiteTurns: true as const,
      semanticTraceComplete: true as const,
      requiredDisclosuresPreserved: true as const,
      exactCoreCrossTurnConsistency: true as const,
      requiresExistingOutputGuard: true as const,
    }),
  });
}

export function directCharacterSajuCouncilV1(input: {
  readonly participants: readonly CharacterSajuCouncilParticipantV1[];
  readonly grounding: unknown;
  readonly requestedDomain: SajuDomain;
  readonly maxTurns: number;
}): CharacterSajuCouncilDecisionV1 {
  assertCouncilInputs(input);

  const leadRef = input.participants[0]!.context.saju?.groundingRef ?? null;
  if (leadRef === null) {
    throw new CharacterSajuCouncilErrorV1(
      'Finite Saju Council requires admitted grounding identity.',
    );
  }
  const grounding = admitCharacterSajuGroundingBundleViewV1({
    candidate: input.grounding,
    expectedRef: leadRef,
  });
  if (grounding.readingDomain !== input.requestedDomain) {
    throw new CharacterSajuCouncilErrorV1(
      'Shared Council grounding domain does not match the requested domain.',
    );
  }
  sameGroundingIdentity({ participants: input.participants, grounding });

  const prepared: PreparedCouncilParticipantV1[] = [];
  for (let inputIndex = 0; inputIndex < input.participants.length; inputIndex += 1) {
    const participant = input.participants[inputIndex]!;
    const rendered = renderCharacterSajuBoundedExactCoreV1({
      context: participant.context,
      grounding,
      perspective: participant.perspective,
      requestedDomain: input.requestedDomain,
    });
    if (rendered.mode === 'protected_fallback') {
      return Object.freeze({
        mode: 'protected_fallback' as const,
        validationState: 'fallback_used' as const,
        reason: 'participant_protected_fallback' as const,
        failures: Object.freeze([]),
        failedCharacterId: participant.context.characterId,
      });
    }
    prepared.push(
      Object.freeze({
        participant,
        inputIndex,
        selectedUnitIds: Object.freeze([
          ...rendered.planDecision.selection.selectedUnitIds,
        ]),
        candidate: rendered.utterance,
      }),
    );
  }

  const ordered = orderForCoverage(prepared).slice(0, input.maxTurns);
  const covered = new Set<string>();
  const turns: CharacterSajuCouncilTurnV1[] = [];

  for (let turnIndex = 0; turnIndex < ordered.length; turnIndex += 1) {
    const preparedTurn = ordered[turnIndex]!;
    const participant = preparedTurn.participant;
    const guarded = guardCharacterSajuSemanticPreservationV1({
      candidate: preparedTurn.candidate,
      context: participant.context,
      grounding,
      perspective: participant.perspective,
      requestedDomain: input.requestedDomain,
    });
    if (guarded.mode !== 'accepted') {
      return Object.freeze({
        mode: 'protected_fallback' as const,
        validationState: 'fallback_used' as const,
        reason: 'participant_protected_fallback' as const,
        failures: Object.freeze([]),
        failedCharacterId: participant.context.characterId,
      });
    }

    const noveltyUnitIds = guarded.evidence.validatedUnitIds.filter(
      (unitId) => !covered.has(unitId),
    );
    const repeatedUnitIds = guarded.evidence.validatedUnitIds.filter((unitId) =>
      covered.has(unitId),
    );
    guarded.evidence.validatedUnitIds.forEach((unitId) => covered.add(unitId));

    turns.push(
      Object.freeze({
        turnIndex,
        characterId: participant.context.characterId,
        readingRef: grounding.readingRef,
        groundingHash: grounding.groundingHash,
        noveltyUnitIds: Object.freeze(noveltyUnitIds),
        repeatedUnitIds: Object.freeze(repeatedUnitIds),
        utterance: guarded.utterance,
        semanticGuardVersion: CHARACTER_SAJU_SEMANTIC_GUARD_VERSION_V1,
        validationState: 'semantic_validated' as const,
      }),
    );
  }

  const participantCharacterIds = Object.freeze(
    ordered.map((entry) => entry.participant.context.characterId),
  );
  const transcriptWithoutId = {
    schemaVersion: CHARACTER_SAJU_COUNCIL_SCHEMA_VERSION_V1,
    directorVersion: CHARACTER_SAJU_COUNCIL_DIRECTOR_VERSION_V1,
    readingRef: grounding.readingRef,
    groundingHash: grounding.groundingHash,
    sourceResponseHash: grounding.sourceResponseHash,
    requestedDomain: input.requestedDomain,
    maxTurns: input.maxTurns,
    participantCharacterIds,
    turns: Object.freeze(turns),
    coveredUnitIds: Object.freeze([...covered]),
    revealState: 'requires_existing_output_guard' as const,
  };
  const transcript = Object.freeze({
    ...transcriptWithoutId,
    councilId: `character_saju_council_${sha256Json(transcriptWithoutId).slice(0, 24)}`,
  }) satisfies CharacterSajuCouncilTranscriptV1;

  const consistency = guardCharacterSajuCouncilConsistencyV1({
    transcript,
    grounding,
  });
  if (consistency.evidence === undefined) {
    return Object.freeze({
      mode: 'protected_fallback' as const,
      validationState: 'fallback_used' as const,
      reason: 'council_consistency_guard_failed' as const,
      failures: consistency.failures,
    });
  }

  return Object.freeze({
    mode: 'council' as const,
    validationState: 'council_validated' as const,
    transcript,
    consistencyEvidence: consistency.evidence,
  });
}
