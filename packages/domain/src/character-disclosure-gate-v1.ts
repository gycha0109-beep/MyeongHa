import {
  resolveCharacterDisclosurePolicyV1,
  type CharacterDisclosureCharacterIdV1,
  type CharacterDisclosureDepthV1,
  type CharacterDisclosureGateV1,
  type CharacterDisclosurePolicyV1,
  type CharacterDisclosureTopicKeyV1,
} from '../../character-content/src/character-disclosure-policy-v1.js';

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
  | 'CANON'
  | 'UNDEFINED'
  | 'HYPOTHESIS';

export type CharacterDisclosureTrustBandV1 = 'low' | 'medium' | 'high';

export type CharacterDisclosureQuestionContextV1 =
  | 'casual_curiosity'
  | 'reciprocal_disclosure'
  | 'continuation'
  | 'relationship_relevant'
  | 'pressuring';

export interface CharacterDisclosureSourceMetadataV1 {
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly sourceAuthorityState: CharacterDisclosureSourceAuthorityStateV1;
  readonly minimumDisclosureGate: CharacterDisclosureGateV1;
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
  readonly sourceAuthorityState: CharacterDisclosureSourceAuthorityStateV1;
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

function isEligibleByRelationship(
  input: CharacterDisclosurePreflightInputV1,
  requestedDepth: CharacterDisclosureDepthV1,
): boolean {
  if (requestedDepth === 'none') return false;
  if (input.questionContext === 'pressuring') return false;

  const gate = input.relationship.gate;
  if (gate === 'PUBLIC') return false;

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

function closedDecision(
  input: CharacterDisclosurePreflightInputV1,
  policy: CharacterDisclosurePolicyV1,
  sharedHistoryRefs: readonly string[],
): CharacterDisclosureDecisionV1 {
  const result =
    input.questionContext === 'pressuring'
      ? ('BOUNDARY' as const)
      : policy.behavior.closedResult;
  const behaviorAction =
    result === 'DEFLECT'
      ? policy.behavior.deflectAction
      : policy.behavior.boundaryAction;

  return Object.freeze({
    schemaVersion: CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V1,
    characterId: input.characterId,
    topicKey: input.topicKey,
    sourceAuthorityState: input.source.sourceAuthorityState,
    result,
    retrievalScope: Object.freeze({
      depth: 'none' as const,
      sourceRef: null,
    }),
    behaviorAction,
    evidence: Object.freeze({
      relationshipGate: input.relationship.gate,
      trustBand: input.relationship.trustBand,
      relevantSharedHistoryRefs: sharedHistoryRefs,
      questionContext: input.questionContext,
      previouslyDisclosedDepth: input.source.previouslyDisclosedDepth,
    }),
    authorityGap: false,
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
  const policy = resolveCharacterDisclosurePolicyV1(input.characterId);
  const policyDepth = depthForEligibleGate({
    policy,
    topicKey: input.topicKey,
    relationshipGate: input.relationship.gate,
  });
  const minimumSourceGateSatisfied =
    GATE_RANK[input.relationship.gate] >=
    GATE_RANK[input.source.minimumDisclosureGate];
  const relationshipEligible =
    minimumSourceGateSatisfied &&
    isEligibleByRelationship(input, policyDepth);

  if (!relationshipEligible) {
    return closedDecision(input, policy, sharedHistoryRefs);
  }

  const priorDepth = input.source.previouslyDisclosedDepth;
  const requestedDepth =
    DEPTH_RANK[priorDepth] > DEPTH_RANK[policyDepth]
      ? priorDepth
      : policyDepth;
  const allowedDepth = minDepth(requestedDepth, input.source.allowedDepth);

  if (
    input.source.sourceAuthorityState === 'UNDEFINED' ||
    input.source.sourceAuthorityState === 'HYPOTHESIS'
  ) {
    return Object.freeze({
      schemaVersion: CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V1,
      characterId: input.characterId,
      topicKey: input.topicKey,
      sourceAuthorityState: input.source.sourceAuthorityState,
      result: 'AUTHORITY_ABSTAIN' as const,
      retrievalScope: Object.freeze({
        depth: 'none' as const,
        sourceRef: null,
      }),
      behaviorAction: policy.behavior.authorityAbstainAction,
      evidence: Object.freeze({
        relationshipGate: input.relationship.gate,
        trustBand: input.relationship.trustBand,
        relevantSharedHistoryRefs: sharedHistoryRefs,
        questionContext: input.questionContext,
        previouslyDisclosedDepth: priorDepth,
      }),
      authorityGap: true,
    });
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
    DEPTH_RANK[allowedDepth] >= DEPTH_RANK[fullDepth]
      ? ('ALLOW' as const)
      : ('PARTIAL' as const);

  return Object.freeze({
    schemaVersion: CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V1,
    characterId: input.characterId,
    topicKey: input.topicKey,
    sourceAuthorityState: input.source.sourceAuthorityState,
    result,
    retrievalScope: Object.freeze({
      depth: allowedDepth,
      sourceRef,
    }),
    behaviorAction:
      result === 'ALLOW'
        ? policy.behavior.allowAction
        : policy.behavior.partialAction,
    evidence: Object.freeze({
      relationshipGate: input.relationship.gate,
      trustBand: input.relationship.trustBand,
      relevantSharedHistoryRefs: sharedHistoryRefs,
      questionContext: input.questionContext,
      previouslyDisclosedDepth: priorDepth,
    }),
    authorityGap: false,
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
