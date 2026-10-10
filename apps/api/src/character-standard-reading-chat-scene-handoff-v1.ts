import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  assertServerPreparedStandardChatPreflightV2,
  type CharacterStandardReadingChatTurnPreflightV2,
} from './character-standard-reading-chat-turn-preflight-v2.js';
import {
  assertServerPreparedStandardChatGroundingV2,
  type CharacterStandardChatGroundingV2,
} from './character-standard-reading-chat-grounding-v2.js';
import {
  selectCharacterStandardFollowupEvidenceV1,
  type ValidatedStandardFollowupAnchorAuthorityPortV1,
} from './character-standard-reading-chat-followup-evidence-v1.js';
import {
  assertServerGuardedReaderInterpretationSceneV2,
} from './reader-interpretation-preview-runtime-v2.js';
import type { ReaderInterpretationPreviewEnvelopeV1 } from './reader-interpretation-preview-runtime-v1.js';

export const STANDARD_READER_SCENE_SOURCE_HANDOFF_VERSION_V1 =
  'myeongha-standard-reader-scene-source-handoff-v1' as const;

export type CharacterStandardReaderSceneSourceHandoffDecisionV1 =
  | Readonly<{
      schemaVersion: typeof STANDARD_READER_SCENE_SOURCE_HANDOFF_VERSION_V1;
      mode: 'source_segment_candidate' | 'protected_only_candidate';
      source: 'semantic_guarded_official_reader_scene';
      subjectId: string;
      threadId: string;
      readerCharacterId: string;
      readingRef: string;
      requestedDomain: CharacterStandardChatGroundingV2['scope']['sajuDomain'];
      officialArtifactResponseHash: string;
      groundingHash: string;
      sceneInterpretationHash: string;
      sceneSegmentIndex: number;
      rootUnitId: string;
      selectedUnitIds: readonly string[];
      requiredDisclosureRefs: readonly string[];
      requiredAmbiguityRefs: readonly string[];
      selectionHash: string;
    }>
  | Readonly<{
      schemaVersion: typeof STANDARD_READER_SCENE_SOURCE_HANDOFF_VERSION_V1;
      mode: 'hold';
      reason: 'scene_stale' | 'segment_not_semantic' |
        'ambiguous_segment' | 'prior_answer_exists';
    }>;

const mintedHandoffs = new WeakSet<object>();

export class CharacterStandardReaderSceneHandoffErrorV1 extends Error {
  constructor(readonly code: 'ACCESS_DENIED' | 'SOURCE_MISMATCH') {
    super('Official Reader Scene to Chat source handoff is unavailable.');
    this.name = 'CharacterStandardReaderSceneHandoffErrorV1';
  }
}

function deny(code: CharacterStandardReaderSceneHandoffErrorV1['code']): never {
  throw new CharacterStandardReaderSceneHandoffErrorV1(code);
}

function hold(reason: Extract<
  CharacterStandardReaderSceneSourceHandoffDecisionV1, { mode: 'hold' }
>['reason']): CharacterStandardReaderSceneSourceHandoffDecisionV1 {
  return Object.freeze({
    schemaVersion: STANDARD_READER_SCENE_SOURCE_HANDOFF_VERSION_V1,
    mode: 'hold' as const,
    reason,
  });
}

function sameScope(
  a: CharacterStandardReadingChatTurnPreflightV2['scope'],
  b: CharacterStandardChatGroundingV2['scope'],
): boolean {
  const keys = Object.keys(a) as (keyof typeof a)[];
  return keys.length === Object.keys(b).length &&
    keys.every(k => a[k] === b[k]);
}

export function assertServerPreparedStandardReaderSceneSourceHandoffV1(
  candidate: unknown,
): asserts candidate is Exclude<
  CharacterStandardReaderSceneSourceHandoffDecisionV1, { mode: 'hold' }
> {
  if (candidate === null || typeof candidate !== 'object' ||
      !mintedHandoffs.has(candidate)) {
    deny('ACCESS_DENIED');
  }
}

/**
 * RR-01: source-only focus handoff after a guarded official Scene.
 *
 * Browser interpretationHash and segment index are ONLY a selector. The
 * Scene argument MUST be a newly server-minted V2 preview, never HTTP JSON.
 * The scoped official Reading/Grant/Product must have been reverified by A2/A3
 * in preflight and grounded. The later Chat commit must recheck again.
 *
 * First question ONLY: exact DB-owned null is required. A prior guarded answer
 * routes through follow-up selection instead. This helper never issues a
 * generation, Commit, Reveal or public Chat activation authority.
 */
export async function prepareCharacterStandardReaderSceneSourceHandoffV1(input: Readonly<{
  preflight: CharacterStandardReadingChatTurnPreflightV2;
  grounded: CharacterStandardChatGroundingV2;
  guardedScene: ReaderInterpretationPreviewEnvelopeV1;
  expectedSceneInterpretationHash: string;
  selectedSceneSegmentIndex: number;
  anchorAuthorityPort: ValidatedStandardFollowupAnchorAuthorityPortV1;
}>): Promise<CharacterStandardReaderSceneSourceHandoffDecisionV1> {
  assertServerPreparedStandardChatPreflightV2(input.preflight);
  assertServerPreparedStandardChatGroundingV2(input.grounded);
  assertServerGuardedReaderInterpretationSceneV2(input.guardedScene);

  const scope = input.grounded.scope;
  const scene = input.guardedScene;
  if (!sameScope(input.preflight.scope, scope) ||
      input.preflight.receivePlan.normalizedRequest.threadId !== scope.threadId ||
      input.grounded.context.saju.eligibility.subjectId !== scope.subjectId ||
      input.grounded.context.saju.eligibility.readerCharacterId !== scope.readerCharacterId ||
      input.grounded.context.saju.eligibility.readingRef !== scope.readingId ||
      input.grounded.context.saju.groundingRef.groundingHash !==
        input.grounded.grounding.groundingHash ||
      input.grounded.grounding.readingRef !== scope.readingId ||
      input.grounded.grounding.readingDomain !== scope.sajuDomain) deny('SOURCE_MISMATCH');

  if (typeof input.expectedSceneInterpretationHash !== 'string' ||
      !/^sha256:v1:[0-9a-f]{64}$/u.test(input.expectedSceneInterpretationHash) ||
      scene.interpretationHash !== input.expectedSceneInterpretationHash ||
      scene.officialReadingId !== scope.readingId ||
      scene.readerCharacterId !== scope.readerCharacterId ||
      scene.readerContentBundleId !== scope.readerContentBundleId ||
      scene.requestedDomain !== scope.sajuDomain ||
      scene.officialArtifactResponseHash !== scope.officialArtifactResponseHash ||
      scene.groundingHash !== input.grounded.grounding.groundingHash ||
      scene.sourceResponseHash !== input.grounded.grounding.sourceResponseHash ||
      scene.utterance.characterId !== scope.readerCharacterId ||
      scene.utterance.readingRef !== scope.readingId ||
      scene.utterance.requestedDomain !== scope.sajuDomain) {
    return hold('scene_stale');
  }
  if (!Number.isSafeInteger(input.selectedSceneSegmentIndex) ||
      input.selectedSceneSegmentIndex < 0 ||
      input.selectedSceneSegmentIndex >= scene.utterance.segments.length) {
    return hold('segment_not_semantic');
  }
  const segment = scene.utterance.segments[input.selectedSceneSegmentIndex]!;
  if (segment.kind !== 'semantic_realization') return hold('segment_not_semantic');
  // Only source-owned Semantic Guard approved segments can nominate a focus.
  if (segment.sourceUnitRefs.length !== 1) return hold('ambiguous_segment');
  const rootUnitId = segment.sourceUnitRefs[0]!;
  const units = input.grounded.grounding.units;
  const byId = new Map(units.map(unit => [unit.unitId, unit]));
  const root = byId.get(rootUnitId);
  if (!root || byId.size !== units.length) deny('SOURCE_MISMATCH');

  let observedNull = false;
  const prior = await selectCharacterStandardFollowupEvidenceV1({
    preflight: input.preflight,
    grounded: input.grounded,
    anchorAuthorityPort: {
      readLatestValidatedAnchor: async args => {
        const anchor = await input.anchorAuthorityPort.readLatestValidatedAnchor(args);
        observedNull = anchor === null;
        return anchor;
      },
    },
  });
  if (!observedNull) return hold('prior_answer_exists');
  if (prior.mode !== 'hold' || prior.reason !== 'clarification_required') {
    deny('SOURCE_MISMATCH');
  }

  const selected = new Set<string>();
  const visit = (id: string): void => {
    if (selected.has(id)) return;
    const unit = byId.get(id);
    if (!unit) deny('SOURCE_MISMATCH');
    selected.add(id);
    for (const companion of unit.requiredCompanionUnitRefs) visit(companion);
  };
  visit(rootUnitId);

  const chosen = units.filter(unit => selected.has(unit.unitId));
  if (chosen.length === 0 || chosen.length > 12) return hold('ambiguous_segment');
  const requiredDisclosureRefs = Object.freeze([...new Set(
    chosen.flatMap(unit => [...unit.requiredDisclosureRefs]),
  )]);
  const requiredAmbiguityRefs = Object.freeze([...new Set(
    chosen.flatMap(unit => unit.ambiguityRef === undefined ? [] : [unit.ambiguityRef]),
  )]);
  const disclosures = new Set(input.grounded.grounding.disclosures.map(d => d.disclosureRef));
  const ambiguities = new Set(input.grounded.grounding.ambiguities.map(a => a.ambiguityRef));
  if (requiredDisclosureRefs.some(ref => !disclosures.has(ref)) ||
      requiredAmbiguityRefs.some(ref => !ambiguities.has(ref))) deny('SOURCE_MISMATCH');

  const protectedOnly = chosen.some(unit =>
    unit.realizationPolicyRef === 'protected_only_v1' ||
    (unit.qualifiers?.length ?? 0) > 0 ||
    unit.ambiguityRef !== undefined,
  );
  const withoutHash = {
    schemaVersion: STANDARD_READER_SCENE_SOURCE_HANDOFF_VERSION_V1,
    mode: protectedOnly ? 'protected_only_candidate' as const
      : 'source_segment_candidate' as const,
    source: 'semantic_guarded_official_reader_scene' as const,
    subjectId: scope.subjectId,
    threadId: scope.threadId,
    readerCharacterId: scope.readerCharacterId,
    readingRef: scope.readingId,
    requestedDomain: scope.sajuDomain,
    officialArtifactResponseHash: scope.officialArtifactResponseHash,
    groundingHash: input.grounded.grounding.groundingHash,
    sceneInterpretationHash: scene.interpretationHash,
    sceneSegmentIndex: input.selectedSceneSegmentIndex,
    rootUnitId,
    selectedUnitIds: Object.freeze(chosen.map(unit => unit.unitId)),
    requiredDisclosureRefs,
    requiredAmbiguityRefs,
  };
  const result = Object.freeze({
    ...withoutHash,
    selectionHash: `sha256:v1:${createHash('sha256')
      .update(canonicalJson(withoutHash)).digest('hex')}`,
  });
  mintedHandoffs.add(result);
  return result;
}
