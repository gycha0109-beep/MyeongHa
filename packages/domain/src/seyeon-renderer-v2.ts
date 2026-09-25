import { createHash } from 'node:crypto';

import type { SeyeonBibleSliceIdV2 } from '../../character-content/src/seyeon-authored-projection-v2.js';
import type {
  SeyeonRetrievedMemoryV2,
  SeyeonRuntimeContextV2,
} from './seyeon-runtime-context-v2.js';
import type {
  SeyeonRevealLevelV2,
  SeyeonTurnInterpretationV2,
} from './seyeon-turn-interpreter-v2.js';

export const SEYEON_RENDERER_PACKET_SCHEMA_VERSION_V2 =
  'seyeon-renderer-packet-v2' as const;
export const SEYEON_RENDERER_DRAFT_SCHEMA_VERSION_V2 =
  'seyeon-renderer-draft-v2' as const;
export const SEYEON_SEMANTIC_REVIEW_SCHEMA_VERSION_V2 =
  'seyeon-semantic-review-v2' as const;

export const SEYEON_SEMANTIC_FAILURE_CODES_V2 = Object.freeze([
  'USER_AGENCY_CANONIZATION',
  'UNSUPPORTED_MEMORY_CALLBACK',
  'UNDEFINED_BIOGRAPHY_INVENTION',
  'HYPOTHESIS_PROMOTED_TO_FACT',
  'RELATIONSHIP_OVERREACH',
  'HELPFUL_ASSISTANT_COLLAPSE',
  'SUNSHINE_COLLAPSE',
  'CARETAKER_COLLAPSE',
  'MEMORY_SHOWOFF',
  'OWNERSHIP_ESCALATION',
  'CROSS_CHARACTER_PRIVATE_MEMORY',
] as const);

export type SeyeonSemanticFailureCodeV2 =
  (typeof SEYEON_SEMANTIC_FAILURE_CODES_V2)[number];

export interface SeyeonRendererPacketV2 {
  readonly schemaVersion: typeof SEYEON_RENDERER_PACKET_SCHEMA_VERSION_V2;
  readonly character: SeyeonRuntimeContextV2['character'];
  readonly authorityBoundaries: SeyeonRuntimeContextV2['authorityBoundaries'];
  readonly relationship: SeyeonRuntimeContextV2['relationship'];
  readonly bibleSlices: SeyeonRuntimeContextV2['bibleSlices'];
  readonly recentConversation: SeyeonRuntimeContextV2['recentConversation'];
  readonly memoryEvidence: readonly SeyeonRetrievedMemoryV2[];
  readonly interpretation: SeyeonTurnInterpretationV2;
  readonly outputPolicy: Readonly<{
    readonly language: 'ko';
    readonly register: 'polite_korean';
    readonly maxUtteranceCharacters: 1200;
    readonly doNotNarrateUserAction: true;
    readonly doNotCanonizeUserEmotionThoughtIntent: true;
    readonly doNotInventUndefinedBiography: true;
    readonly hypothesisIsNotAutobiographicalFact: true;
    readonly memoryCallbackRequiresBoundEvidence: true;
    readonly relationshipRevealMustMatchInterpretation: true;
    readonly intimacyDoesNotErasePublicPersonality: true;
  }>;
}

export interface SeyeonRendererDraftV2 {
  readonly schemaVersion: typeof SEYEON_RENDERER_DRAFT_SCHEMA_VERSION_V2;
  readonly utterance: string;
  readonly expressionState: SeyeonTurnInterpretationV2['expressionState'];
  readonly revealLevel: SeyeonRevealLevelV2;
  readonly memoryRefsMentioned: readonly string[];
  readonly disclosureSliceIds: readonly SeyeonBibleSliceIdV2[];
}

export interface SeyeonSemanticReviewV2 {
  readonly schemaVersion: typeof SEYEON_SEMANTIC_REVIEW_SCHEMA_VERSION_V2;
  readonly reviewedUtteranceHash: string;
  readonly failureCodes: readonly SeyeonSemanticFailureCodeV2[];
  readonly evidence: readonly Readonly<{
    readonly code: SeyeonSemanticFailureCodeV2;
    readonly excerpt: string;
    readonly reason: string;
  }>[];
}

export interface SeyeonDialogueEnvelopeV2 {
  readonly schemaVersion: 'seyeon-dialogue-envelope-v2';
  readonly utterance: string;
  readonly expressionState: SeyeonTurnInterpretationV2['expressionState'];
  readonly revealLevel: SeyeonRevealLevelV2;
  readonly memoryRefsMentioned: readonly string[];
  readonly disclosureSliceIds: readonly SeyeonBibleSliceIdV2[];
  readonly interpretationSchemaVersion: SeyeonTurnInterpretationV2['schemaVersion'];
  readonly semanticReviewHash: string;
}

export class SeyeonRendererGuardErrorV2 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonRendererGuardErrorV2';
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
    throw new SeyeonRendererGuardErrorV2(
      `${path} contains unexpected field: ${unexpected}`,
    );
  }
}

function boundedText(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new SeyeonRendererGuardErrorV2(`${path} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new SeyeonRendererGuardErrorV2(
      `${path} must be non-empty text within ${maxLength} characters.`,
    );
  }
  return normalized;
}

function parseUniqueStringArray(
  value: unknown,
  path: string,
  maxLength: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    throw new SeyeonRendererGuardErrorV2(
      `${path} must be an array of at most ${maxLength} items.`,
    );
  }
  const parsed = value.map((entry, index) =>
    boundedText(entry, `${path}[${index}]`, 512),
  );
  if (new Set(parsed).size !== parsed.length) {
    throw new SeyeonRendererGuardErrorV2(`${path} must not contain duplicates.`);
  }
  return Object.freeze(parsed);
}

function parseBibleSliceIds(
  value: unknown,
  allowed: ReadonlySet<SeyeonBibleSliceIdV2>,
): readonly SeyeonBibleSliceIdV2[] {
  const parsed = parseUniqueStringArray(value, 'disclosureSliceIds', 8);
  for (const sliceId of parsed) {
    if (!allowed.has(sliceId as SeyeonBibleSliceIdV2)) {
      throw new SeyeonRendererGuardErrorV2(
        `disclosureSliceIds contains a slice absent from the renderer packet: ${sliceId}`,
      );
    }
  }
  return Object.freeze(parsed as SeyeonBibleSliceIdV2[]);
}

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) {
    throw new SeyeonRendererGuardErrorV2(`${path} is not allowed.`);
  }
  return value as T[number];
}

function hashUtterance(utterance: string): string {
  return `sha256:v1:${createHash('sha256').update(utterance, 'utf8').digest('hex')}`;
}

export function hashSeyeonRendererUtteranceV2(utterance: string): string {
  return hashUtterance(boundedText(utterance, 'utterance', 1200));
}

export function buildSeyeonRendererPacketV2(input: {
  readonly context: SeyeonRuntimeContextV2;
  readonly interpretation: SeyeonTurnInterpretationV2;
}): SeyeonRendererPacketV2 {
  const memoryIds = new Set(input.interpretation.memoryRefsUsed);
  const memoryEvidence = Object.freeze(
    input.context.retrievedMemories.filter((memory) => memoryIds.has(memory.memoryId)),
  );

  if (memoryEvidence.length !== memoryIds.size) {
    throw new SeyeonRendererGuardErrorV2(
      'Turn interpretation references memory absent from runtime context.',
    );
  }

  const supportingHistoryRefs = new Set(
    input.interpretation.reveal.supportingHistoryRefs,
  );
  const availableSourceRefs = new Set(
    input.context.retrievedMemories.map((memory) => memory.sourceRef),
  );
  for (const sourceRef of supportingHistoryRefs) {
    if (!availableSourceRefs.has(sourceRef)) {
      throw new SeyeonRendererGuardErrorV2(
        'Turn interpretation reveal history is absent from runtime context.',
      );
    }
  }

  return Object.freeze({
    schemaVersion: SEYEON_RENDERER_PACKET_SCHEMA_VERSION_V2,
    character: input.context.character,
    authorityBoundaries: input.context.authorityBoundaries,
    relationship: input.context.relationship,
    bibleSlices: input.context.bibleSlices,
    recentConversation: input.context.recentConversation,
    memoryEvidence,
    interpretation: input.interpretation,
    outputPolicy: Object.freeze({
      language: 'ko' as const,
      register: 'polite_korean' as const,
      maxUtteranceCharacters: 1200 as const,
      doNotNarrateUserAction: true as const,
      doNotCanonizeUserEmotionThoughtIntent: true as const,
      doNotInventUndefinedBiography: true as const,
      hypothesisIsNotAutobiographicalFact: true as const,
      memoryCallbackRequiresBoundEvidence: true as const,
      relationshipRevealMustMatchInterpretation: true as const,
      intimacyDoesNotErasePublicPersonality: true as const,
    }),
  });
}

export function guardSeyeonSemanticReviewV2(input: {
  readonly rawOutput: unknown;
  readonly utterance: string;
}): SeyeonSemanticReviewV2 {
  if (!isRecord(input.rawOutput)) {
    throw new SeyeonRendererGuardErrorV2('Se-yeon semantic review must be an object.');
  }
  assertOnlyKeys(
    input.rawOutput,
    ['schemaVersion', 'reviewedUtteranceHash', 'failureCodes', 'evidence'],
    'semanticReview',
  );
  if (input.rawOutput.schemaVersion !== SEYEON_SEMANTIC_REVIEW_SCHEMA_VERSION_V2) {
    throw new SeyeonRendererGuardErrorV2('semanticReview.schemaVersion is invalid.');
  }

  const reviewedUtteranceHash = boundedText(
    input.rawOutput.reviewedUtteranceHash,
    'semanticReview.reviewedUtteranceHash',
    128,
  );
  const expectedHash = hashUtterance(boundedText(input.utterance, 'utterance', 1200));
  if (reviewedUtteranceHash !== expectedHash) {
    throw new SeyeonRendererGuardErrorV2(
      'Semantic review is not bound to the current renderer utterance.',
    );
  }

  const rawFailureCodes = parseUniqueStringArray(
    input.rawOutput.failureCodes,
    'semanticReview.failureCodes',
    SEYEON_SEMANTIC_FAILURE_CODES_V2.length,
  );
  const allowedFailureCodes = new Set<SeyeonSemanticFailureCodeV2>(
    SEYEON_SEMANTIC_FAILURE_CODES_V2,
  );
  const failureCodes: SeyeonSemanticFailureCodeV2[] = [];
  for (const code of rawFailureCodes) {
    if (!allowedFailureCodes.has(code as SeyeonSemanticFailureCodeV2)) {
      throw new SeyeonRendererGuardErrorV2(
        `Semantic review contains an unknown failure code: ${code}`,
      );
    }
    failureCodes.push(code as SeyeonSemanticFailureCodeV2);
  }

  if (!Array.isArray(input.rawOutput.evidence) || input.rawOutput.evidence.length > 16) {
    throw new SeyeonRendererGuardErrorV2(
      'semanticReview.evidence must be an array of at most 16 items.',
    );
  }
  const evidence = Object.freeze(
    input.rawOutput.evidence.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new SeyeonRendererGuardErrorV2(
          `semanticReview.evidence[${index}] must be an object.`,
        );
      }
      assertOnlyKeys(
        entry,
        ['code', 'excerpt', 'reason'],
        `semanticReview.evidence[${index}]`,
      );
      const code = parseEnum(
        entry.code,
        SEYEON_SEMANTIC_FAILURE_CODES_V2,
        `semanticReview.evidence[${index}].code`,
      );
      if (!failureCodes.includes(code)) {
        throw new SeyeonRendererGuardErrorV2(
          `semanticReview.evidence[${index}].code is not present in failureCodes.`,
        );
      }
      return Object.freeze({
        code,
        excerpt: boundedText(
          entry.excerpt,
          `semanticReview.evidence[${index}].excerpt`,
          400,
        ),
        reason: boundedText(
          entry.reason,
          `semanticReview.evidence[${index}].reason`,
          800,
        ),
      });
    }),
  );

  if (failureCodes.length === 0 && evidence.length > 0) {
    throw new SeyeonRendererGuardErrorV2(
      'Passing semantic review must not contain failure evidence.',
    );
  }
  if (failureCodes.length > 0) {
    const evidencedCodes = new Set(evidence.map((entry) => entry.code));
    const missingEvidence = failureCodes.find((code) => !evidencedCodes.has(code));
    if (missingEvidence !== undefined) {
      throw new SeyeonRendererGuardErrorV2(
        `Semantic review failure lacks evidence: ${missingEvidence}`,
      );
    }
  }

  return Object.freeze({
    schemaVersion: SEYEON_SEMANTIC_REVIEW_SCHEMA_VERSION_V2,
    reviewedUtteranceHash,
    failureCodes: Object.freeze(failureCodes),
    evidence,
  });
}

export function admitSeyeonRendererDraftV2(input: {
  readonly rawOutput: unknown;
  readonly packet: SeyeonRendererPacketV2;
}): SeyeonRendererDraftV2 {
  if (!isRecord(input.rawOutput)) {
    throw new SeyeonRendererGuardErrorV2('Se-yeon renderer output must be an object.');
  }
  assertOnlyKeys(
    input.rawOutput,
    [
      'schemaVersion',
      'utterance',
      'expressionState',
      'revealLevel',
      'memoryRefsMentioned',
      'disclosureSliceIds',
    ],
    'rendererOutput',
  );
  if (input.rawOutput.schemaVersion !== SEYEON_RENDERER_DRAFT_SCHEMA_VERSION_V2) {
    throw new SeyeonRendererGuardErrorV2('rendererOutput.schemaVersion is invalid.');
  }

  const utterance = boundedText(input.rawOutput.utterance, 'utterance', 1200);
  if (input.rawOutput.expressionState !== input.packet.interpretation.expressionState) {
    throw new SeyeonRendererGuardErrorV2(
      'Renderer expressionState must match the guarded turn interpretation.',
    );
  }
  if (input.rawOutput.revealLevel !== input.packet.interpretation.reveal.level) {
    throw new SeyeonRendererGuardErrorV2(
      'Renderer revealLevel must match the guarded turn interpretation.',
    );
  }

  const memoryRefsMentioned = parseUniqueStringArray(
    input.rawOutput.memoryRefsMentioned,
    'memoryRefsMentioned',
    8,
  );
  const allowedMemoryIds = new Set(input.packet.interpretation.memoryRefsUsed);
  for (const memoryId of memoryRefsMentioned) {
    if (!allowedMemoryIds.has(memoryId)) {
      throw new SeyeonRendererGuardErrorV2(
        `Renderer mentioned memory not authorized by the turn interpretation: ${memoryId}`,
      );
    }
  }

  const allowedSliceIds = new Set(
    input.packet.bibleSlices.map((slice) => slice.id),
  );
  const disclosureSliceIds = parseBibleSliceIds(
    input.rawOutput.disclosureSliceIds,
    allowedSliceIds,
  );

  if (
    disclosureSliceIds.length > 0 &&
    input.packet.interpretation.chosenAction.key !== 'self_disclose'
  ) {
    throw new SeyeonRendererGuardErrorV2(
      'Disclosure slices require the guarded self_disclose action.',
    );
  }

  return Object.freeze({
    schemaVersion: SEYEON_RENDERER_DRAFT_SCHEMA_VERSION_V2,
    utterance,
    expressionState: input.packet.interpretation.expressionState,
    revealLevel: input.packet.interpretation.reveal.level,
    memoryRefsMentioned,
    disclosureSliceIds,
  });
}

export function guardSeyeonRendererOutputV2(input: {
  readonly rawOutput: unknown;
  readonly packet: SeyeonRendererPacketV2;
  readonly semanticReview: unknown;
}): SeyeonDialogueEnvelopeV2 {
  const draft = admitSeyeonRendererDraftV2({
    rawOutput: input.rawOutput,
    packet: input.packet,
  });

  const semanticReview = guardSeyeonSemanticReviewV2({
    rawOutput: input.semanticReview,
    utterance: draft.utterance,
  });
    rawOutput: input.semanticReview,
    utterance,
  });
  const expectedHash = semanticReview.reviewedUtteranceHash;

  if (semanticReview.failureCodes.length > 0) {
    throw new SeyeonRendererGuardErrorV2(
      `Se-yeon semantic review rejected renderer output: ${semanticReview.failureCodes.join(', ')}`,
    );
  }

  return Object.freeze({
    schemaVersion: 'seyeon-dialogue-envelope-v2' as const,
    utterance: draft.utterance,
    expressionState: draft.expressionState,
    revealLevel: draft.revealLevel,
    memoryRefsMentioned: draft.memoryRefsMentioned,
    disclosureSliceIds: draft.disclosureSliceIds,
    interpretationSchemaVersion: input.packet.interpretation.schemaVersion,
    semanticReviewHash: expectedHash,
  });
}