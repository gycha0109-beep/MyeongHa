import {
  RELATIONSHIP_EVENT_CANDIDATES,
  type RelationshipEventCandidate,
} from '../../contracts/src/index.js';
import {
  hashProtectedSajuTextV1,
  type CharacterRuntimeContextV1,
  type ProtectedSajuDisclosureV1,
  type ProtectedSajuSegmentV1,
  type ProtectedSajuTextRefV1,
} from './character-runtime-context.js';

export type CharacterMemoryProposalKindV1 = 'life_fact' | 'memory';

export interface CharacterMemoryProposalDraftV1 {
  readonly proposalKind: CharacterMemoryProposalKindV1;
  readonly recordType: string;
  readonly schemaVersion: string;
  readonly proposedValue: unknown;
  readonly proposalDedupeKey: string;
}

export interface CharacterSuggestedActionV1 {
  readonly actionKey: string;
}

/**
 * Provider-owned draft. Protected Saju blocks/disclosures/ambiguity are intentionally absent:
 * the model cannot author, reorder, summarize, or replace them.
 */
export interface CharacterRendererDraftV1 {
  readonly schemaVersion: 'v1';
  readonly framingBefore?: string;
  readonly framingAfter?: string;
  readonly emotion: string;
  readonly animationCue?: string;
  readonly memoryProposals: readonly CharacterMemoryProposalDraftV1[];
  readonly relationshipEventProposals: readonly RelationshipEventCandidate[];
  readonly suggestedActions: readonly CharacterSuggestedActionV1[];
}

/** Final validated message material. Protected Saju material is server-injected from context. */
export interface CharacterDialogueEnvelopeV1 {
  readonly schemaVersion: 'v1';
  readonly framingBefore: string | null;
  readonly protectedSajuSegments: readonly ProtectedSajuSegmentV1[];
  readonly protectedSajuDisclosures: readonly ProtectedSajuDisclosureV1[];
  readonly calculationAmbiguity: readonly string[];
  readonly framingAfter: string | null;
  readonly emotion: string;
  readonly animationCue: string | null;
  readonly memoryProposals: readonly CharacterMemoryProposalDraftV1[];
  readonly relationshipEventProposals: readonly RelationshipEventCandidate[];
  readonly suggestedActions: readonly CharacterSuggestedActionV1[];
}

export class CharacterOutputGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterOutputGuardError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected !== undefined) {
    throw new CharacterOutputGuardError(`${path} contains unexpected field: ${unexpected}`);
  }
}

function boundedText(
  value: unknown,
  path: string,
  maxLength = 4000,
): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new CharacterOutputGuardError(`${path} must be non-empty text within ${maxLength} characters.`);
  }
  return value;
}

function optionalBoundedText(value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null;
  return boundedText(value, path);
}

function stableKey(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{0,127}$/u.test(value)
  ) {
    throw new CharacterOutputGuardError(`${path} must be a stable lower-case key.`);
  }
  return value;
}

function boundedIdentifier(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new CharacterOutputGuardError(`${path} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new CharacterOutputGuardError(`${path} is outside the supported bounds.`);
  }
  return normalized;
}

function assertJsonCompatible(value: unknown, path: string, depth = 0): void {
  if (depth > 20) {
    throw new CharacterOutputGuardError(`${path} exceeds JSON nesting bounds.`);
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) {
      throw new CharacterOutputGuardError(`${path} exceeds array bounds.`);
    }
    value.forEach((entry, index) => assertJsonCompatible(entry, `${path}[${index}]`, depth + 1));
    return;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > 100) {
      throw new CharacterOutputGuardError(`${path} exceeds object field bounds.`);
    }
    for (const [key, entry] of entries) {
      if (key.length === 0 || key.length > 128) {
        throw new CharacterOutputGuardError(`${path} contains an invalid field name.`);
      }
      assertJsonCompatible(entry, `${path}.${key}`, depth + 1);
    }
    return;
  }
  throw new CharacterOutputGuardError(`${path} must be JSON-compatible.`);
}

function parseMemoryProposal(value: unknown, index: number): CharacterMemoryProposalDraftV1 {
  const path = `memoryProposals[${index}]`;
  if (!isRecord(value)) throw new CharacterOutputGuardError(`${path} must be an object.`);
  assertOnlyKeys(
    value,
    ['proposalKind', 'recordType', 'schemaVersion', 'proposedValue', 'proposalDedupeKey'],
    path,
  );
  if (value.proposalKind !== 'life_fact' && value.proposalKind !== 'memory') {
    throw new CharacterOutputGuardError(`${path}.proposalKind is invalid.`);
  }
  const recordType = stableKey(value.recordType, `${path}.recordType`);
  const schemaVersion = boundedIdentifier(value.schemaVersion, `${path}.schemaVersion`);
  const proposalDedupeKey = boundedIdentifier(
    value.proposalDedupeKey,
    `${path}.proposalDedupeKey`,
  );
  assertJsonCompatible(value.proposedValue, `${path}.proposedValue`);
  return Object.freeze({
    proposalKind: value.proposalKind,
    recordType,
    schemaVersion,
    proposedValue: value.proposedValue,
    proposalDedupeKey,
  });
}

function parseArray(value: unknown, path: string, maxLength: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    throw new CharacterOutputGuardError(`${path} must be an array of at most ${maxLength} items.`);
  }
  return value;
}

function uniqueStrings(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new CharacterOutputGuardError(`${path} must not contain duplicates.`);
  }
}

function verifyProtectedTextRef(
  value: ProtectedSajuTextRefV1,
  readingRef: string,
  path: string,
): void {
  if (value.sourceReadingRef !== readingRef) {
    throw new CharacterOutputGuardError(`${path}.sourceReadingRef does not match readingRef.`);
  }
  if (value.sourceRef.trim().length === 0) {
    throw new CharacterOutputGuardError(`${path}.sourceRef is required.`);
  }
  if (value.contentHash !== hashProtectedSajuTextV1(value.text)) {
    throw new CharacterOutputGuardError(`${path}.contentHash does not match protected text.`);
  }
}

function assertNoProtectedEcho(
  framing: string | null,
  protectedValues: readonly ProtectedSajuTextRefV1[],
  path: string,
): void {
  if (framing === null) return;
  const echoed = protectedValues.find((value) => framing.includes(value.text));
  if (echoed !== undefined) {
    throw new CharacterOutputGuardError(
      `${path} must not duplicate protected Saju content; the server injects it separately.`,
    );
  }
}

export function guardCharacterRendererOutput(input: {
  readonly rawOutput: unknown;
  readonly context: CharacterRuntimeContextV1;
  readonly allowedSuggestedActionKeys: readonly string[];
}): CharacterDialogueEnvelopeV1 {
  if (!isRecord(input.rawOutput)) {
    throw new CharacterOutputGuardError('Character renderer output must be an object.');
  }

  assertOnlyKeys(
    input.rawOutput,
    [
      'schemaVersion',
      'framingBefore',
      'framingAfter',
      'emotion',
      'animationCue',
      'memoryProposals',
      'relationshipEventProposals',
      'suggestedActions',
    ],
    'rendererOutput',
  );

  if (input.rawOutput.schemaVersion !== 'v1') {
    throw new CharacterOutputGuardError('Character renderer schemaVersion must be v1.');
  }

  const framingBefore = optionalBoundedText(input.rawOutput.framingBefore, 'framingBefore');
  const framingAfter = optionalBoundedText(input.rawOutput.framingAfter, 'framingAfter');

  const emotion = boundedIdentifier(input.rawOutput.emotion, 'emotion');
  if (!input.context.rendererPolicy.allowedEmotionIds.includes(emotion)) {
    throw new CharacterOutputGuardError('emotion is not allowed by the pinned character content.');
  }

  let animationCue: string | null = null;
  if (input.rawOutput.animationCue !== undefined && input.rawOutput.animationCue !== null) {
    animationCue = boundedIdentifier(input.rawOutput.animationCue, 'animationCue');
    if (!input.context.rendererPolicy.allowedAnimationCueIds.includes(animationCue)) {
      throw new CharacterOutputGuardError(
        'animationCue is not allowed by the pinned character content.',
      );
    }
  }

  const memoryValues = parseArray(input.rawOutput.memoryProposals, 'memoryProposals', 8);
  const memoryProposals = Object.freeze(
    memoryValues.map((proposal, index) => parseMemoryProposal(proposal, index)),
  );
  uniqueStrings(memoryProposals.map((proposal) => proposal.proposalDedupeKey), 'memoryProposals');

  const relationshipValues = parseArray(
    input.rawOutput.relationshipEventProposals,
    'relationshipEventProposals',
    8,
  );
  const allowedRelationshipEvents = new Set<string>(RELATIONSHIP_EVENT_CANDIDATES);
  const relationshipEventProposals = relationshipValues.map((value) => {
    if (typeof value !== 'string' || !allowedRelationshipEvents.has(value)) {
      throw new CharacterOutputGuardError('relationshipEventProposals contains an unknown event.');
    }
    return value as RelationshipEventCandidate;
  });
  uniqueStrings(relationshipEventProposals, 'relationshipEventProposals');

  const actionValues = parseArray(input.rawOutput.suggestedActions, 'suggestedActions', 8);
  const allowedActions = new Set(input.allowedSuggestedActionKeys);
  const suggestedActions = actionValues.map((value, index) => {
    const path = `suggestedActions[${index}]`;
    if (!isRecord(value)) throw new CharacterOutputGuardError(`${path} must be an object.`);
    assertOnlyKeys(value, ['actionKey'], path);
    const actionKey = stableKey(value.actionKey, `${path}.actionKey`);
    if (!allowedActions.has(actionKey)) {
      throw new CharacterOutputGuardError(`${path}.actionKey is not allowed.`);
    }
    return Object.freeze({ actionKey });
  });
  uniqueStrings(suggestedActions.map((action) => action.actionKey), 'suggestedActions');

  const readingRef = input.context.saju?.readingRef ?? null;
  const protectedSajuSegments = Object.freeze(
    (input.context.saju?.protectedSegments ?? []).map((segment, index) => {
      if (readingRef === null) throw new CharacterOutputGuardError('Protected Saju segment without readingRef.');
      verifyProtectedTextRef(segment, readingRef, `protectedSajuSegments[${index}]`);
      return Object.freeze({ ...segment });
    }),
  );
  const protectedSajuDisclosures = Object.freeze(
    (input.context.saju?.disclosures ?? []).map((disclosure, index) => {
      if (readingRef === null) throw new CharacterOutputGuardError('Protected Saju disclosure without readingRef.');
      verifyProtectedTextRef(disclosure, readingRef, `protectedSajuDisclosures[${index}]`);
      return Object.freeze({ ...disclosure });
    }),
  );
  const calculationAmbiguity = Object.freeze([...(input.context.saju?.ambiguity ?? [])]);

  assertNoProtectedEcho(
    framingBefore,
    [...protectedSajuSegments, ...protectedSajuDisclosures],
    'framingBefore',
  );
  assertNoProtectedEcho(
    framingAfter,
    [...protectedSajuSegments, ...protectedSajuDisclosures],
    'framingAfter',
  );

  return Object.freeze({
    schemaVersion: 'v1',
    framingBefore,
    protectedSajuSegments,
    protectedSajuDisclosures,
    calculationAmbiguity,
    framingAfter,
    emotion,
    animationCue,
    memoryProposals,
    relationshipEventProposals: Object.freeze(relationshipEventProposals),
    suggestedActions: Object.freeze(suggestedActions),
  });
}
