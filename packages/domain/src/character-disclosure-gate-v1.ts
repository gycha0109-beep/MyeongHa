import {
  resolveCharacterDisclosurePolicyV1,
  type CharacterDisclosureCharacterIdV1,
  type CharacterDisclosureDepthV1,
  type CharacterDisclosureGateV1,
  type CharacterDisclosurePolicyV1,
  type CharacterDisclosureTopicKeyV1,
} from '../../character-content/src/character-disclosure-policy-v1.js';
import type {
  CharacterDisclosureDefaultV1,
  CharacterKnowledgeStateV1,
  CharacterSourceAuthorityV1,
} from '../../character-content/src/character-fact-authority-v1.js';

export const CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V1 =
  'character-disclosure-decision-v1' as const;

export const CHARACTER_DISCLOSURE_RESULTS_V1 = Object.freeze([
  'ALLOW',
  'PARTIAL',
  'DEFLECT',
  'BOUNDARY',
  'REDIRECT',
  'AUTHORITY_ABSTAIN',
] as const);

export type CharacterDisclosureResultV1 =
  (typeof CHARACTER_DISCLOSURE_RESULTS_V1)[number];

export type CharacterDisclosureSourceAuthorityStateV1 =
  CharacterSourceAuthorityV1;

export type CharacterDisclosureTrustBandV1 = 'low' | 'medium' | 'high';

export type CharacterDisclosureQuestionContextV1 =
  | 'casual_curiosity'
  | 'reciprocal_disclosure'
  | 'continuation'
  | 'relationship_relevant'
  | 'pressuring';

export type CharacterDisclosureAuthorityDispositionV1 =
  | 'AVAILABLE'
  | 'AUTHORING_GAP'
  | 'INTENTIONALLY_OPEN'
  | 'EXTERNAL_AUTHORITY_REQUIRED'
  | 'CHARACTER_KNOWLEDGE_UNAVAILABLE';

export interface CharacterDisclosureSourceMetadataV1 {
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly sourceAuthorityState: CharacterSourceAuthorityV1;
  readonly characterKnowledge: CharacterKnowledgeStateV1;
  readonly disclosureDefault: CharacterDisclosureDefaultV1;
  readonly allowedDepth: Exclude<CharacterDisclosureDepthV1, 'none'>;
  readonly previouslyDisclosedDepth: CharacterDisclosureDepthV1;
  readonly sourceRef: string;
}

export interface CharacterDisclosureRelationshipEvidenceV1 {
  readonly gate: CharacterDisclosureGateV1;
  readonly trustBand: CharacterDisclosureTrustBandV1;
  readonly relevantSharedHistoryRefs: readonly string[];
}

export interface CharacterDisclosurePreflightInputV1 {
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly source: CharacterDisclosureSourceMetadataV1;
  readonly relationship: CharacterDisclosureRelationshipEvidenceV1;
  readonly questionContext: CharacterDisclosureQuestionContextV1;
}

export interface CharacterDisclosureDecisionV1 {
  readonly schemaVersion: typeof CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V1;
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly sourceAuthorityState: CharacterSourceAuthorityV1;
  readonly characterKnowledge: CharacterKnowledgeStateV1;
  readonly disclosureDefault: CharacterDisclosureDefaultV1;
  readonly result: CharacterDisclosureResultV1;
  readonly retrievalScope: Readonly<{
    readonly depth: CharacterDisclosureDepthV1;
    readonly sourceRef: string | null;
  }>;
  readonly behaviorAction: string;
  readonly evidence: Readonly<{
    readonly relationshipGate: CharacterDisclosureGateV1;
    readonly trustBand: CharacterDisclosureTrustBandV1;
    readonly relevantSharedHistoryRefs: readonly string[];
    readonly questionContext: CharacterDisclosureQuestionContextV1;
    readonly previouslyDisclosedDepth: CharacterDisclosureDepthV1;
  }>;
  readonly authorityGap: boolean;
  readonly authorityDisposition: CharacterDisclosureAuthorityDispositionV1;
}

const GATE_RANK: Readonly<Record<CharacterDisclosureGateV1, number>> = Object.freeze({
  PUBLIC: 0,
  FAMILIAR: 1,
  ATTACHED: 2,
  DEEP_TRUST: 3,
});

const DEPTH_RANK: Readonly<Record<CharacterDisclosureDepthV1, number>> = Object.freeze({
  none: 0,
  surface: 1,
  meaning: 2,
  deep: 3,
});

function requireText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new TypeError(`${path} must be non-empty text within 512 characters.`);
  }
  return normalized;
}

function assertUniqueRefs(refs: readonly string[]): readonly string[] {
  if (refs.length > 16) {
    throw new TypeError('relevantSharedHistoryRefs must contain at most 16 refs.');
  }
  const normalized = refs.map((ref, index) =>
    requireText(ref, `relevantSharedHistoryRefs[${index}]`),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError('relevantSharedHistoryRefs must not contain duplicates.');
  }
  return Object.freeze(normalized);
}

function minDepth(
  left: CharacterDisclosureDepthV1,
  right: CharacterDisclosureDepthV1,
): CharacterDisclosureDepthV1 {
  return DEPTH_RANK[left] <= DEPTH_RANK[right] ? left : right;
}

function depthForEligibleGate(input: {
  readonly policy: CharacterDisclosurePolicyV1;
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly relationshipGate: CharacterDisclosureGateV1;
}): CharacterDisclosureDepthV1 {
  const rule = input.policy.topicRules[input.topicKey];
  const gateRank = GATE_RANK[input.relationshipGate];
  if (gateRank >= GATE_RANK[rule.fullFromGate]) {
    return rule.sensitivity === 'medium' ? 'surface' : 'deep';
  }
  if (gateRank >= GATE_RANK[rule.partialFromGate]) {
    return gateRank >= GATE_RANK.ATTACHED ? 'meaning' : 'surface';
  }
  return 'none';
}

function hasContextSupport(input: CharacterDisclosurePreflightInputV1): boolean {
  return (
    input.relationship.relevantSharedHistoryRefs.length > 0 ||
    input.source.previouslyDisclosedDepth !== 'none' ||
    input.questionContext === 'reciprocal_disclosure' ||
    input.questionContext === 'continuation' ||
    input.questionContext === 'relationship_relevant'
  );
}

function sourceDisclosureDefaultAllows(
  input: CharacterDisclosurePreflightInputV1,
): boolean {
  const disclosureDefault = input.source.disclosureDefault;
  if (disclosureDefault === 'NEVER') return false;
  if (disclosureDefault === 'NOT_APPLICABLE') return true;
  if (disclosureDefault === 'CONTEXTUAL') {
    return input.questionContext !== 'pressuring' && hasContextSupport(input);
  }
  return (
    GATE_RANK[input.relationship.gate] >=
    GATE_RANK[disclosureDefault]
  );
}

function isEligibleByRelationship(
  input: CharacterDisclosurePreflightInputV1,
  requestedDepth: CharacterDisclosureDepthV1,
): boolean {
  if (requestedDepth === 'none') return false;
  if (input.questionContext === 'pressuring') return false;

  const gate = input.relationship.gate;
  if (gate === 'PUBLIC') {
    return (
      input.source.disclosureDefault === 'PUBLIC' ||
      (input.source.disclosureDefault === 'CONTEXTUAL' &&
        hasContextSupport(input))
    );
  }

  if (gate === 'FAMILIAR') {
    return input.relationship.trustBand !== 'low' && hasContextSupport(input);
  }

  if (gate === 'ATTACHED') {
    return (
      input.relationship.trustBand !== 'low' &&
      input.relationship.relevantSharedHistoryRefs.length > 0
    );
  }

  return (
    input.relationship.trustBand === 'high' &&
    input.relationship.relevantSharedHistoryRefs.length > 0
  );
}

function authorityDisposition(
  input: CharacterDisclosurePreflightInputV1,
): CharacterDisclosureAuthorityDispositionV1 {
  if (
    input.source.characterKnowledge === 'UNKNOWN_TO_CHARACTER' ||
    (input.source.characterKnowledge === 'NOT_APPLICABLE' &&
      (input.source.sourceAuthorityState === 'CANON' ||
        input.source.sourceAuthorityState === 'SOFT_CANON'))
  ) {
    return 'CHARACTER_KNOWLEDGE_UNAVAILABLE';
  }
  switch (input.source.sourceAuthorityState) {
    case 'CANON':
    case 'SOFT_CANON':
      return 'AVAILABLE';
    case 'AUTHOR_UNDEFINED':
      return 'AUTHORING_GAP';
    case 'INTENTIONALLY_OPEN':
      return 'INTENTIONALLY_OPEN';
    case 'WORLD_DEPENDENT':
      return 'EXTERNAL_AUTHORITY_REQUIRED';
  }
}

function baseDecision(input: {
  readonly request: CharacterDisclosurePreflightInputV1;
  readonly result: CharacterDisclosureResultV1;
  readonly behaviorAction: string;
  readonly sharedHistoryRefs: readonly string[];
  readonly depth?: CharacterDisclosureDepthV1;
  readonly sourceRef?: string | null;
  readonly authorityGap: boolean;
  readonly disposition: CharacterDisclosureAuthorityDispositionV1;
}): CharacterDisclosureDecisionV1 {
  return Object.freeze({
    schemaVersion: CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V1,
    characterId: input.request.characterId,
    topicKey: input.request.topicKey,
    sourceAuthorityState: input.request.source.sourceAuthorityState,
    characterKnowledge: input.request.source.characterKnowledge,
    disclosureDefault: input.request.source.disclosureDefault,
    result: input.result,
    retrievalScope: Object.freeze({
      depth: input.depth ?? ('none' as const),
      sourceRef: input.sourceRef ?? null,
    }),
    behaviorAction: input.behaviorAction,
    evidence: Object.freeze({
      relationshipGate: input.request.relationship.gate,
      trustBand: input.request.relationship.trustBand,
      relevantSharedHistoryRefs: input.sharedHistoryRefs,
      questionContext: input.request.questionContext,
      previouslyDisclosedDepth:
        input.request.source.previouslyDisclosedDepth,
    }),
    authorityGap: input.authorityGap,
    authorityDisposition: input.disposition,
  });
}

function closedDecision(
  input: CharacterDisclosurePreflightInputV1,
  policy: CharacterDisclosurePolicyV1,
  sharedHistoryRefs: readonly string[],
): CharacterDisclosureDecisionV1 {
  const result =
    input.questionContext === 'pressuring' ||
    input.source.disclosureDefault === 'NEVER'
      ? ('BOUNDARY' as const)
      : policy.behavior.closedResult;
  return baseDecision({
    request: input,
    result,
    behaviorAction:
      result === 'DEFLECT'
        ? policy.behavior.deflectAction
        : policy.behavior.boundaryAction,
    sharedHistoryRefs,
    authorityGap: false,
    disposition: authorityDisposition(input),
  });
}

export function evaluateCharacterDisclosurePreflightV1(
  input: CharacterDisclosurePreflightInputV1,
): CharacterDisclosureDecisionV1 {
  if (input.source.topicKey !== input.topicKey) {
    throw new TypeError('Disclosure source metadata topicKey must match classified topicKey.');
  }

  const sourceRef = requireText(input.source.sourceRef, 'source.sourceRef');
  const sharedHistoryRefs = assertUniqueRefs(
    input.relationship.relevantSharedHistoryRefs,
  );
  const sourceAvailable =
    input.source.sourceAuthorityState === 'CANON' ||
    input.source.sourceAuthorityState === 'SOFT_CANON';
  const characterCanKnow =
    input.source.characterKnowledge === 'KNOWN' ||
    input.source.characterKnowledge === 'PARTIAL';

  if (
    (!sourceAvailable || !characterCanKnow) &&
    input.source.previouslyDisclosedDepth !== 'none'
  ) {
    throw new TypeError(
      'Unavailable or unknown Character biography cannot have a prior disclosed depth.',
    );
  }

  const policy = resolveCharacterDisclosurePolicyV1(input.characterId);
  const policyDepth = depthForEligibleGate({
    policy,
    topicKey: input.topicKey,
    relationshipGate: input.relationship.gate,
  });
  const previouslyDisclosed =
    input.source.previouslyDisclosedDepth !== 'none';
  const relationshipEligible =
    input.questionContext !== 'pressuring' &&
    (previouslyDisclosed ||
      (sourceDisclosureDefaultAllows(input) &&
        isEligibleByRelationship(input, policyDepth)));

  if (!relationshipEligible) {
    return closedDecision(input, policy, sharedHistoryRefs);
  }

  const disposition = authorityDisposition(input);
  if (disposition !== 'AVAILABLE') {
    return baseDecision({
      request: input,
      result: 'AUTHORITY_ABSTAIN',
      behaviorAction: policy.behavior.authorityAbstainAction,
      sharedHistoryRefs,
      authorityGap:
        disposition === 'AUTHORING_GAP' ||
        disposition === 'EXTERNAL_AUTHORITY_REQUIRED',
      disposition,
    });
  }

  const priorDepth = input.source.previouslyDisclosedDepth;
  const requestedDepth =
    DEPTH_RANK[priorDepth] > DEPTH_RANK[policyDepth]
      ? priorDepth
      : policyDepth;
  let allowedDepth = minDepth(requestedDepth, input.source.allowedDepth);
  if (
    input.source.characterKnowledge === 'PARTIAL' &&
    DEPTH_RANK[allowedDepth] > DEPTH_RANK.surface
  ) {
    allowedDepth = 'surface';
  }

  const fullDepth = minDepth(
    depthForEligibleGate({
      policy,
      topicKey: input.topicKey,
      relationshipGate: policy.topicRules[input.topicKey].fullFromGate,
    }),
    input.source.allowedDepth,
  );
  const result =
    input.source.characterKnowledge === 'PARTIAL' ||
    DEPTH_RANK[allowedDepth] < DEPTH_RANK[fullDepth]
      ? ('PARTIAL' as const)
      : ('ALLOW' as const);

  return baseDecision({
    request: input,
    result,
    depth: allowedDepth,
    sourceRef,
    behaviorAction:
      result === 'ALLOW'
        ? policy.behavior.allowAction
        : policy.behavior.partialAction,
    sharedHistoryRefs,
    authorityGap: false,
    disposition,
  });
}

export interface CharacterDisclosureRetrievedSourceV1 {
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly depth: Exclude<CharacterDisclosureDepthV1, 'none'>;
  readonly sourceRef: string;
  readonly content: string;
}

export function guardCharacterDisclosureRetrievalV1(input: {
  readonly decision: CharacterDisclosureDecisionV1;
  readonly retrievedSources: readonly CharacterDisclosureRetrievedSourceV1[];
}): readonly CharacterDisclosureRetrievedSourceV1[] {
  const scope = input.decision.retrievalScope;
  if (scope.depth === 'none') {
    if (input.retrievedSources.length > 0) {
      throw new TypeError(
        'Disclosure-blocked private content must not enter runtime context.',
      );
    }
    return Object.freeze([]);
  }

  if (input.decision.authorityDisposition !== 'AVAILABLE') {
    throw new TypeError(
      'Private content retrieval requires available source authority and Character knowledge.',
    );
  }

  if (input.retrievedSources.length > 8) {
    throw new TypeError('Disclosure retrieval must contain at most 8 source slices.');
  }

  const seen = new Set<string>();
  return Object.freeze(
    input.retrievedSources.map((source, index) => {
      if (source.topicKey !== input.decision.topicKey) {
        throw new TypeError(
          `retrievedSources[${index}].topicKey is outside the disclosure decision.`,
        );
      }
      if (DEPTH_RANK[source.depth] > DEPTH_RANK[scope.depth]) {
        throw new TypeError(
          `retrievedSources[${index}].depth exceeds the allowed disclosure depth.`,
        );
      }
      const sourceRef = requireText(
        source.sourceRef,
        `retrievedSources[${index}].sourceRef`,
      );
      if (scope.sourceRef !== null && sourceRef !== scope.sourceRef) {
        throw new TypeError(
          `retrievedSources[${index}].sourceRef is outside the authorized source metadata.`,
        );
      }
      if (seen.has(sourceRef)) {
        throw new TypeError('Disclosure retrieval source refs must be unique.');
      }
      seen.add(sourceRef);
      const content = source.content.trim();
      if (content.length === 0 || content.length > 6000) {
        throw new TypeError(
          `retrievedSources[${index}].content is outside supported bounds.`,
        );
      }
      return Object.freeze({
        topicKey: source.topicKey,
        depth: source.depth,
        sourceRef,
        content,
      });
    }),
  );
}