import {
  CHARACTER_DISCLOSURE_TOPIC_KEYS_V1,
  type CharacterDisclosureCharacterIdV1,
  type CharacterDisclosureTopicKeyV1,
} from '../../../packages/character-content/src/character-disclosure-policy-v1.js';
import {
  evaluateCharacterDisclosurePreflightV1,
  guardCharacterDisclosureRetrievalV1,
  type CharacterDisclosureDecisionV1,
  type CharacterDisclosureQuestionContextV1,
  type CharacterDisclosureRelationshipEvidenceV1,
  type CharacterDisclosureRetrievedSourceV1,
  type CharacterDisclosureSourceMetadataV1,
} from '../../../packages/domain/src/character-disclosure-gate-v1.js';

export const CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V1 =
  'character-disclosure-preflight-v1' as const;

export interface CharacterDisclosureTopicClassificationV1 {
  readonly topicKey: CharacterDisclosureTopicKeyV1 | null;
  readonly questionContext: CharacterDisclosureQuestionContextV1;
}

export interface CharacterDisclosureTopicClassifierPortV1 {
  classify(input: {
    readonly characterId: CharacterDisclosureCharacterIdV1;
    readonly userQuestion: string;
  }): unknown | Promise<unknown>;
}

export interface CharacterDisclosureSourceMetadataPortV1 {
  readMetadata(input: {
    readonly characterId: CharacterDisclosureCharacterIdV1;
    readonly topicKey: CharacterDisclosureTopicKeyV1;
  }): CharacterDisclosureSourceMetadataV1 | Promise<CharacterDisclosureSourceMetadataV1>;
}

export interface CharacterPrivateSourceRetrieverPortV1 {
  retrieve(input: {
    readonly characterId: CharacterDisclosureCharacterIdV1;
    readonly topicKey: CharacterDisclosureTopicKeyV1;
    readonly sourceRef: string;
    readonly depth: Exclude<CharacterDisclosureDecisionV1['retrievalScope']['depth'], 'none'>;
  }):
    | readonly CharacterDisclosureRetrievedSourceV1[]
    | Promise<readonly CharacterDisclosureRetrievedSourceV1[]>;
}

export type CharacterDisclosurePreflightResultV1 =
  | Readonly<{
      readonly schemaVersion: typeof CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V1;
      readonly status: 'not_sensitive';
      readonly classification: CharacterDisclosureTopicClassificationV1;
      readonly decision: null;
    }>
  | Readonly<{
      readonly schemaVersion: typeof CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V1;
      readonly status: 'sensitive';
      readonly classification: CharacterDisclosureTopicClassificationV1 & {
        readonly topicKey: CharacterDisclosureTopicKeyV1;
      };
      readonly decision: CharacterDisclosureDecisionV1;
    }>;

function requireQuestion(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 8000) {
    throw new TypeError('userQuestion must be non-empty text within 8000 characters.');
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const QUESTION_CONTEXTS = Object.freeze([
  'casual_curiosity',
  'reciprocal_disclosure',
  'continuation',
  'relationship_relevant',
  'pressuring',
] as const satisfies readonly CharacterDisclosureQuestionContextV1[]);

export function guardCharacterDisclosureTopicClassificationV1(
  raw: unknown,
): CharacterDisclosureTopicClassificationV1 {
  if (!isRecord(raw)) {
    throw new TypeError('Disclosure topic classification must be an object.');
  }
  const unexpected = Object.keys(raw).find(
    (key) => key !== 'topicKey' && key !== 'questionContext',
  );
  if (unexpected !== undefined) {
    throw new TypeError(
      `Disclosure topic classification contains unexpected field: ${unexpected}`,
    );
  }

  const topicKey = raw.topicKey;
  if (
    topicKey !== null &&
    (typeof topicKey !== 'string' ||
      !CHARACTER_DISCLOSURE_TOPIC_KEYS_V1.includes(
        topicKey as CharacterDisclosureTopicKeyV1,
      ))
  ) {
    throw new TypeError('Disclosure topic classification topicKey is invalid.');
  }
  if (
    typeof raw.questionContext !== 'string' ||
    !QUESTION_CONTEXTS.includes(
      raw.questionContext as CharacterDisclosureQuestionContextV1,
    )
  ) {
    throw new TypeError(
      'Disclosure topic classification questionContext is invalid.',
    );
  }

  return Object.freeze({
    topicKey: topicKey as CharacterDisclosureTopicKeyV1 | null,
    questionContext:
      raw.questionContext as CharacterDisclosureQuestionContextV1,
  });
}

export async function runCharacterDisclosurePreflightV1(input: {
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly userQuestion: string;
  readonly relationship: CharacterDisclosureRelationshipEvidenceV1;
  readonly classifier: CharacterDisclosureTopicClassifierPortV1;
  readonly sourceMetadata: CharacterDisclosureSourceMetadataPortV1;
}): Promise<CharacterDisclosurePreflightResultV1> {
  const userQuestion = requireQuestion(input.userQuestion);
  const classification = guardCharacterDisclosureTopicClassificationV1(
    await input.classifier.classify({
      characterId: input.characterId,
      userQuestion,
    }),
  );

  if (classification.topicKey === null) {
    return Object.freeze({
      schemaVersion: CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V1,
      status: 'not_sensitive' as const,
      classification,
      decision: null,
    });
  }

  const source = await input.sourceMetadata.readMetadata({
    characterId: input.characterId,
    topicKey: classification.topicKey,
  });
  if (source.topicKey !== classification.topicKey) {
    throw new TypeError(
      'Disclosure source metadata returned a different topic than classification.',
    );
  }

  const decision = evaluateCharacterDisclosurePreflightV1({
    characterId: input.characterId,
    topicKey: classification.topicKey,
    source,
    relationship: input.relationship,
    questionContext: classification.questionContext,
  });

  return Object.freeze({
    schemaVersion: CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V1,
    status: 'sensitive' as const,
    classification: Object.freeze({
      topicKey: classification.topicKey,
      questionContext: classification.questionContext,
    }),
    decision,
  });
}

export async function retrieveAllowedCharacterDisclosureSourcesV1(input: {
  readonly preflight: CharacterDisclosurePreflightResultV1;
  readonly retriever: CharacterPrivateSourceRetrieverPortV1;
}): Promise<readonly CharacterDisclosureRetrievedSourceV1[]> {
  if (
    input.preflight.status === 'not_sensitive' ||
    input.preflight.decision.retrievalScope.depth === 'none' ||
    input.preflight.decision.retrievalScope.sourceRef === null
  ) {
    return Object.freeze([]);
  }

  const decision = input.preflight.decision;
  const raw = await input.retriever.retrieve({
    characterId: decision.characterId,
    topicKey: decision.topicKey,
    sourceRef: decision.retrievalScope.sourceRef,
    depth: decision.retrievalScope.depth,
  });

  return guardCharacterDisclosureRetrievalV1({
    decision,
    retrievedSources: raw,
  });
}
