import {
  CHARACTER_DISCLOSURE_TOPIC_KEYS_V1,
  type CharacterDisclosureCharacterIdV1,
  type CharacterDisclosureTopicKeyV1,
} from '../../../packages/character-content/src/character-disclosure-policy-v1.js';
import type { CharacterFactAuthorityEntryV1 } from '../../../packages/character-content/src/character-fact-authority-v1.js';
import {
  evaluateCharacterDisclosurePreflightV2,
  guardCharacterDisclosureRetrievalV2,
  type CharacterDisclosureDecisionV2,
  type CharacterDisclosureQuestionContextV2,
  type CharacterDisclosureRelationshipEvidenceV2,
  type CharacterDisclosureRetrievedSourceV2,
  type CharacterDisclosureSourceDescriptorV2,
} from '../../../packages/domain/src/character-disclosure-gate-v2.js';

export const CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2 =
  'character-disclosure-preflight-v2' as const;

export interface CharacterDisclosureTopicClassificationV2 {
  readonly topicKey: CharacterDisclosureTopicKeyV1 | null;
  readonly questionContext: CharacterDisclosureQuestionContextV2;
}
export interface CharacterDisclosureTopicClassifierPortV2 {
  classify(input: {
    readonly characterId: CharacterDisclosureCharacterIdV1;
    readonly userQuestion: string;
  }): unknown | Promise<unknown>;
}
export interface CharacterDisclosureSourceDescriptorPortV2 {
  readDescriptor(input: {
    readonly characterId: CharacterDisclosureCharacterIdV1;
    readonly topicKey: CharacterDisclosureTopicKeyV1;
  }): CharacterDisclosureSourceDescriptorV2 | Promise<CharacterDisclosureSourceDescriptorV2>;
}
export interface CharacterDisclosureFactAuthorityResolverPortV2 {
  resolve(input: {
    readonly characterId: CharacterDisclosureCharacterIdV1;
    readonly factKey: string;
  }): CharacterFactAuthorityEntryV1 | null | Promise<CharacterFactAuthorityEntryV1 | null>;
}
export interface CharacterPrivateSourceRetrieverPortV2 {
  retrieve(input: {
    readonly characterId: CharacterDisclosureCharacterIdV1;
    readonly topicKey: CharacterDisclosureTopicKeyV1;
    readonly factKey: string;
    readonly sourceRef: string;
    readonly depth: Exclude<CharacterDisclosureDecisionV2['retrievalScope']['depth'], 'none'>;
  }): readonly CharacterDisclosureRetrievedSourceV2[] |
    Promise<readonly CharacterDisclosureRetrievedSourceV2[]>;
}

export type CharacterDisclosurePreflightResultV2 =
  | Readonly<{
      readonly schemaVersion: typeof CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2;
      readonly status: 'not_sensitive';
      readonly classification: CharacterDisclosureTopicClassificationV2;
      readonly source: null;
      readonly factAuthority: null;
      readonly decision: null;
    }>
  | Readonly<{
      readonly schemaVersion: typeof CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2;
      readonly status: 'sensitive';
      readonly classification: CharacterDisclosureTopicClassificationV2 & {
        readonly topicKey: CharacterDisclosureTopicKeyV1;
      };
      readonly source: CharacterDisclosureSourceDescriptorV2;
      readonly factAuthority: CharacterFactAuthorityEntryV1;
      readonly decision: CharacterDisclosureDecisionV2;
    }>;

const QUESTION_CONTEXTS = Object.freeze([
  'casual_curiosity',
  'reciprocal_disclosure',
  'continuation',
  'relationship_relevant',
  'pressuring',
] as const satisfies readonly CharacterDisclosureQuestionContextV2[]);

function question(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 8000) {
    throw new TypeError('userQuestion must be non-empty text within 8000 characters.');
  }
  return normalized;
}
function factKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new TypeError('Disclosure factKey must be non-empty text within 512 characters.');
  }
  return normalized;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function guardCharacterDisclosureTopicClassificationV2(
  raw: unknown,
): CharacterDisclosureTopicClassificationV2 {
  if (!isRecord(raw)) throw new TypeError('Disclosure topic classification must be an object.');
  const unexpected = Object.keys(raw).find(
    (key) => key !== 'topicKey' && key !== 'questionContext',
  );
  if (unexpected !== undefined) {
    throw new TypeError('Disclosure topic classification contains unexpected field: ' + unexpected);
  }
  const topicKey = raw.topicKey;
  if (
    topicKey !== null &&
    (typeof topicKey !== 'string' ||
      !CHARACTER_DISCLOSURE_TOPIC_KEYS_V1.includes(topicKey as CharacterDisclosureTopicKeyV1))
  ) {
    throw new TypeError('Disclosure topic classification topicKey is invalid.');
  }
  if (
    typeof raw.questionContext !== 'string' ||
    !QUESTION_CONTEXTS.includes(raw.questionContext as CharacterDisclosureQuestionContextV2)
  ) {
    throw new TypeError('Disclosure topic classification questionContext is invalid.');
  }
  return Object.freeze({
    topicKey: topicKey as CharacterDisclosureTopicKeyV1 | null,
    questionContext: raw.questionContext as CharacterDisclosureQuestionContextV2,
  });
}

export async function runCharacterDisclosurePreflightV2(input: {
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly userQuestion: string;
  readonly relationship: CharacterDisclosureRelationshipEvidenceV2;
  readonly classifier: CharacterDisclosureTopicClassifierPortV2;
  readonly sourceDescriptor: CharacterDisclosureSourceDescriptorPortV2;
  readonly factAuthorityResolver: CharacterDisclosureFactAuthorityResolverPortV2;
}): Promise<CharacterDisclosurePreflightResultV2> {
  const userQuestion = question(input.userQuestion);
  const classification = guardCharacterDisclosureTopicClassificationV2(
    await input.classifier.classify({
      characterId: input.characterId,
      userQuestion,
    }),
  );

  if (classification.topicKey === null) {
    return Object.freeze({
      schemaVersion: CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2,
      status: 'not_sensitive' as const,
      classification,
      source: null,
      factAuthority: null,
      decision: null,
    });
  }

  const source = await input.sourceDescriptor.readDescriptor({
    characterId: input.characterId,
    topicKey: classification.topicKey,
  });
  if (source.topicKey !== classification.topicKey) {
    throw new TypeError('Disclosure source descriptor returned a different topic.');
  }
  const requestedFactKey = factKey(source.factKey);
  const factAuthority = await input.factAuthorityResolver.resolve({
    characterId: input.characterId,
    factKey: requestedFactKey,
  });
  if (factAuthority === null) {
    throw new TypeError('Missing Character Fact Authority for disclosure factKey: ' + requestedFactKey);
  }
  if (factAuthority.factKey !== requestedFactKey) {
    throw new TypeError('Fact Authority resolver returned a different factKey.');
  }

  const decision = evaluateCharacterDisclosurePreflightV2({
    characterId: input.characterId,
    topicKey: classification.topicKey,
    source,
    factAuthority,
    relationship: input.relationship,
    questionContext: classification.questionContext,
  });

  return Object.freeze({
    schemaVersion: CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2,
    status: 'sensitive' as const,
    classification: Object.freeze({
      topicKey: classification.topicKey,
      questionContext: classification.questionContext,
    }),
    source,
    factAuthority,
    decision,
  });
}

export async function retrieveAllowedCharacterDisclosureSourcesV2(input: {
  readonly preflight: CharacterDisclosurePreflightResultV2;
  readonly retriever: CharacterPrivateSourceRetrieverPortV2;
}): Promise<readonly CharacterDisclosureRetrievedSourceV2[]> {
  if (input.preflight.status === 'not_sensitive') return Object.freeze([]);

  const decision = input.preflight.decision;
  const scope = decision.retrievalScope;
  if (scope.depth === 'none' || scope.sourceRef === null) return Object.freeze([]);

  const raw = await input.retriever.retrieve({
    characterId: decision.characterId,
    topicKey: decision.topicKey,
    factKey: decision.factKey,
    sourceRef: scope.sourceRef,
    depth: scope.depth,
  });
  return guardCharacterDisclosureRetrievalV2({
    decision,
    retrievedSources: raw,
  });
}
