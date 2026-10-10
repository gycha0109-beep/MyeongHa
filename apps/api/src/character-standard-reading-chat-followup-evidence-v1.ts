import { createHash } from 'node:crypto';
import {
  canonicalJson,
} from '../../../packages/domain/src/index.js';
import {
  assertServerPreparedStandardChatPreflightV2,
  type CharacterStandardReadingChatTurnPreflightV2,
} from './character-standard-reading-chat-turn-preflight-v2.js';
import {
  assertServerPreparedStandardChatGroundingV2,
  type CharacterStandardChatGroundingV2,
} from './character-standard-reading-chat-grounding-v2.js';
import { closeCharacterStandardReaderSourceFocusV1 } from './character-standard-reading-chat-source-closure-v1.js';

export const STANDARD_FOLLOWUP_EVIDENCE_VERSION_V1 =
  'myeongha-standard-followup-evidence-v1' as const;

/**
 * DB-owned, latest committed, semantic-guard-passed assistant turn.
 *
 * A user message, model proposal, raw transcript or browser-selected unitId
 * must never instantiate this authority. The production persistence owner
 * must bind its look-up to the exact authenticated Subject and Reader thread.
 */
export interface ValidatedStandardFollowupAnchorV1 {
  readonly status: 'committed_semantic_guard_pass';
  readonly subjectId: string;
  readonly threadId: string;
  readonly readerCharacterId: string;
  readonly readingRef: string;
  readonly officialArtifactResponseHash: string;
  readonly groundingHash: string;
  readonly assistantMessageId: string;
  readonly sourceUnitRefs: readonly string[];
  /** A server-validated exact focus into sourceUnitRefs, never user-chosen text. */
  readonly focusedUnitRef?: string;
}

export interface ValidatedStandardFollowupAnchorAuthorityPortV1 {
  readLatestValidatedAnchor(input: Readonly<{
    subjectId: string;
    threadId: string;
    readerCharacterId: string;
    readingRef: string;
  }>): Promise<ValidatedStandardFollowupAnchorV1 | null>;
}

export type CharacterStandardFollowupEvidenceDecisionV1 =
  | Readonly<{
      schemaVersion: typeof STANDARD_FOLLOWUP_EVIDENCE_VERSION_V1;
      mode: 'grounded_selection' | 'protected_only';
      subjectId: string;
      threadId: string;
      readerCharacterId: string;
      readingRef: string;
      requestedDomain: CharacterStandardChatGroundingV2['scope']['sajuDomain'];
      officialArtifactResponseHash: string;
      groundingHash: string;
      assistantMessageId: string;
      focusedUnitRef: string;
      selectedUnitIds: readonly string[];
      requiredDisclosureRefs: readonly string[];
      requiredAmbiguityRefs: readonly string[];
      selectionHash: string;
    }>
  | Readonly<{
      schemaVersion: typeof STANDARD_FOLLOWUP_EVIDENCE_VERSION_V1;
      mode: 'hold';
      reason: 'clarification_required' | 'insufficient_evidence';
    }>;

export class CharacterStandardFollowupEvidenceErrorV1 extends Error {
  constructor(readonly code: 'ACCESS_DENIED' | 'SOURCE_MISMATCH') {
    super('Official standard follow-up evidence selection is unavailable.');
    this.name = 'CharacterStandardFollowupEvidenceErrorV1';
  }
}
function deny(code: CharacterStandardFollowupEvidenceErrorV1['code']): never {
  throw new CharacterStandardFollowupEvidenceErrorV1(code);
}

function sameScope(
  p: CharacterStandardReadingChatTurnPreflightV2['scope'],
  g: CharacterStandardChatGroundingV2['scope'],
): boolean {
  const keys = Object.keys(p) as (keyof typeof p)[];
  return keys.length === Object.keys(g).length &&
    keys.every(key => p[key] === g[key]);
}
function validId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
}
function hold(
  reason: 'clarification_required' | 'insufficient_evidence',
): CharacterStandardFollowupEvidenceDecisionV1 {
  return Object.freeze({
    schemaVersion: STANDARD_FOLLOWUP_EVIDENCE_VERSION_V1,
    mode: 'hold' as const,
    reason,
  });
}

/**
 * PR 2-B/C: deterministic, server-anchored follow-up evidence selection.
 *
 * No direct free-text/LLM semantic matching is authorized yet. Only the latest
 * server-validated assistant evidence anchor may nominate a focus Unit. If
 * multiple referenced Units exist without an exact persisted focus, request
 * clarification rather than guessing from untrusted user words.
 *
 * Required companion closure, disclosure refs and ambiguity refs are preserved.
 * Returned evidence is not an LLM prompt, answer, Commit or public Reveal grant.
 */
export async function selectCharacterStandardFollowupEvidenceV1(input: Readonly<{
  preflight: CharacterStandardReadingChatTurnPreflightV2;
  grounded: CharacterStandardChatGroundingV2;
  anchorAuthorityPort: ValidatedStandardFollowupAnchorAuthorityPortV1;
}>): Promise<CharacterStandardFollowupEvidenceDecisionV1> {
  assertServerPreparedStandardChatPreflightV2(input.preflight);
  assertServerPreparedStandardChatGroundingV2(input.grounded);
  const scope = input.grounded.scope;
  if (!sameScope(input.preflight.scope, scope) ||
      input.grounded.context.schemaVersion !== 'v2' ||
      input.grounded.context.saju.eligibility.readingRef !== scope.readingId ||
      input.grounded.context.saju.eligibility.subjectId !== scope.subjectId ||
      input.grounded.context.saju.eligibility.readerCharacterId !== scope.readerCharacterId ||
      input.grounded.context.saju.eligibility.officialArtifactResponseHash !== scope.officialArtifactResponseHash ||
      input.grounded.context.saju.groundingRef.groundingHash !== input.grounded.grounding.groundingHash ||
      input.grounded.grounding.readingRef !== scope.readingId ||
      input.grounded.grounding.readingDomain !== scope.sajuDomain ||
      input.preflight.receivePlan.normalizedRequest.threadId !== scope.threadId) deny('SOURCE_MISMATCH');

  let anchor;
  try {
    anchor = await input.anchorAuthorityPort.readLatestValidatedAnchor({
      subjectId: scope.subjectId,
      threadId: scope.threadId,
      readerCharacterId: scope.readerCharacterId,
      readingRef: scope.readingId,
    });
  } catch {
    return deny('ACCESS_DENIED');
  }
  if (anchor === null) return hold('clarification_required');
  if (anchor.status !== 'committed_semantic_guard_pass' ||
      !validId(anchor.subjectId) || !validId(anchor.threadId) ||
      !validId(anchor.readerCharacterId) || !validId(anchor.readingRef) ||
      !validId(anchor.assistantMessageId) ||
      anchor.subjectId !== scope.subjectId ||
      anchor.threadId !== scope.threadId ||
      anchor.readerCharacterId !== scope.readerCharacterId ||
      anchor.readingRef !== scope.readingId ||
      anchor.officialArtifactResponseHash !== scope.officialArtifactResponseHash ||
      anchor.groundingHash !== input.grounded.grounding.groundingHash ||
      !Array.isArray(anchor.sourceUnitRefs) ||
      anchor.sourceUnitRefs.some(ref => !validId(ref)) ||
      anchor.sourceUnitRefs.length > 12 ||
      new Set(anchor.sourceUnitRefs).size !== anchor.sourceUnitRefs.length) deny('SOURCE_MISMATCH');

  if (anchor.sourceUnitRefs.length === 0) return hold('insufficient_evidence');
  const byId = new Map(input.grounded.grounding.units.map(unit => [unit.unitId, unit]));
  if (anchor.sourceUnitRefs.some(id => !byId.has(id))) deny('SOURCE_MISMATCH');

  const focus = anchor.focusedUnitRef ??
    (anchor.sourceUnitRefs.length === 1 ? anchor.sourceUnitRefs[0] : null);
  if (focus === null) return hold('clarification_required');
  if (!anchor.sourceUnitRefs.includes(focus)) deny('SOURCE_MISMATCH');

  // RR-02: preserve Saju-owned global disclosures/calculation ambiguity,
  // including those not linked to a specific assistant focus Unit.
  const source = closeCharacterStandardReaderSourceFocusV1({
    grounded: input.grounded,
    rootUnitId: focus,
  });
  if (source.mode === 'hold') return hold('insufficient_evidence');

  const withoutHash = {
    schemaVersion: STANDARD_FOLLOWUP_EVIDENCE_VERSION_V1,
    mode: source.protectedOnly ? 'protected_only' as const : 'grounded_selection' as const,
    subjectId: scope.subjectId,
    threadId: scope.threadId,
    readerCharacterId: scope.readerCharacterId,
    readingRef: scope.readingId,
    requestedDomain: scope.sajuDomain,
    officialArtifactResponseHash: scope.officialArtifactResponseHash,
    groundingHash: input.grounded.grounding.groundingHash,
    assistantMessageId: anchor.assistantMessageId,
    focusedUnitRef: focus,
    selectedUnitIds: source.selectedUnitIds,
    requiredDisclosureRefs: source.requiredDisclosureRefs,
    requiredAmbiguityRefs: source.requiredAmbiguityRefs,
  };
  return Object.freeze({
    ...withoutHash,
    selectionHash: `sha256:v1:${createHash('sha256').update(canonicalJson(withoutHash)).digest('hex')}`,
  });
}
