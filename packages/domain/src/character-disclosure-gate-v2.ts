import {
  resolveCharacterDisclosurePolicyV1,
  type CharacterDisclosureCharacterIdV1,
  type CharacterDisclosureDepthV1,
  type CharacterDisclosureGateV1,
  type CharacterDisclosureTopicKeyV1,
} from '../../character-content/src/character-disclosure-policy-v1.js';
import {
  isKnownToCharacterV1,
  isRuntimeAuthoritativeCharacterFactV1,
  type CharacterDisclosureDefaultV1,
  type CharacterFactAuthorityEntryV1,
  type CharacterKnowledgeStateV1,
  type CharacterSourceAuthorityStateV1,
} from '../../character-content/src/character-fact-authority-v1.js';

export const CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V2 =
  'character-disclosure-decision-v2' as const;

export const CHARACTER_DISCLOSURE_RESULTS_V2 = Object.freeze([
  'ALLOW',
  'PARTIAL',
  'DEFLECT',
  'BOUNDARY',
  'REDIRECT',
  'AUTHORITY_ABSTAIN',
  'KNOWLEDGE_ABSTAIN',
] as const);
export type CharacterDisclosureResultV2 =
  (typeof CHARACTER_DISCLOSURE_RESULTS_V2)[number];

export const CHARACTER_DISCLOSURE_REASON_CODES_V2 = Object.freeze([
  'AUTHOR_UNDEFINED',
  'INTENTIONALLY_OPEN',
  'WORLD_AUTHORITY_REQUIRED',
  'UNKNOWN_TO_CHARACTER',
  'DISCLOSURE_NEVER',
  'PRESSURING_CONTEXT',
  'RELATIONSHIP_NOT_ELIGIBLE',
  'PRIOR_DISCLOSURE_CONTINUITY',
  'ELIGIBLE_PARTIAL',
  'ELIGIBLE_FULL',
] as const);
export type CharacterDisclosureReasonCodeV2 =
  (typeof CHARACTER_DISCLOSURE_REASON_CODES_V2)[number];

export type CharacterDisclosureTrustBandV2 = 'low' | 'medium' | 'high';
export type CharacterDisclosureQuestionContextV2 =
  | 'casual_curiosity'
  | 'reciprocal_disclosure'
  | 'continuation'
  | 'relationship_relevant'
  | 'pressuring';

export interface CharacterDisclosureSourceDescriptorV2 {
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly factKey: string;
  readonly sourceRef: string;
  readonly allowedDepth: Exclude<CharacterDisclosureDepthV1, 'none'>;
  readonly previouslyDisclosedDepth: CharacterDisclosureDepthV1;
}

export interface CharacterDisclosureRelationshipEvidenceV2 {
  readonly gate: CharacterDisclosureGateV1;
  readonly trustBand: CharacterDisclosureTrustBandV2;
  readonly relevantSharedHistoryRefs: readonly string[];
}

export interface CharacterDisclosurePreflightInputV2 {
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly source: CharacterDisclosureSourceDescriptorV2;
  readonly factAuthority: CharacterFactAuthorityEntryV1;
  readonly relationship: CharacterDisclosureRelationshipEvidenceV2;
  readonly questionContext: CharacterDisclosureQuestionContextV2;
}

export interface CharacterDisclosureDecisionV2 {
  readonly schemaVersion: typeof CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V2;
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly factKey: string;
  readonly authority: Readonly<{
    readonly sourceAuthority: CharacterSourceAuthorityStateV1;
    readonly characterKnowledge: CharacterKnowledgeStateV1;
    readonly disclosureDefault: CharacterDisclosureDefaultV1;
  }>;
  readonly result: CharacterDisclosureResultV2;
  readonly reasonCode: CharacterDisclosureReasonCodeV2;
  readonly retrievalScope: Readonly<{
    readonly depth: CharacterDisclosureDepthV1;
    readonly sourceRef: string | null;
  }>;
  readonly behaviorAction: string;
  readonly evidence: Readonly<{
    readonly relationshipGate: CharacterDisclosureGateV1;
    readonly trustBand: CharacterDisclosureTrustBandV2;
    readonly relevantSharedHistoryRefs: readonly string[];
    readonly questionContext: CharacterDisclosureQuestionContextV2;
    readonly previouslyDisclosedDepth: CharacterDisclosureDepthV1;
  }>;
  readonly authorityGap: boolean;
  readonly knowledgeGap: boolean;
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

function text(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new TypeError(path + ' must be non-empty text within 512 characters.');
  }
  return normalized;
}

function refs(values: readonly string[]): readonly string[] {
  if (values.length > 16) throw new TypeError('Shared history exceeds 16 refs.');
  const normalized = values.map((value, index) => text(value, 'sharedHistory[' + index + ']'));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError('Shared history refs must be unique.');
  }
  return Object.freeze(normalized);
}

function minDepth(a: CharacterDisclosureDepthV1, b: CharacterDisclosureDepthV1) {
  return DEPTH_RANK[a] <= DEPTH_RANK[b] ? a : b;
}
function maxGate(a: CharacterDisclosureGateV1, b: CharacterDisclosureGateV1) {
  return GATE_RANK[a] >= GATE_RANK[b] ? a : b;
}
function staticGate(value: CharacterDisclosureDefaultV1): CharacterDisclosureGateV1 | null {
  return value === 'PUBLIC' || value === 'FAMILIAR' ||
    value === 'ATTACHED' || value === 'DEEP_TRUST' ? value : null;
}
function effectiveGates(input: CharacterDisclosurePreflightInputV2) {
  const rule = resolveCharacterDisclosurePolicyV1(input.characterId).topicRules[input.topicKey];
  const sourceGate = staticGate(input.factAuthority.disclosureDefault);
  return Object.freeze({
    partial: sourceGate === null ? rule.partialFromGate : maxGate(rule.partialFromGate, sourceGate),
    full: sourceGate === null ? rule.fullFromGate : maxGate(rule.fullFromGate, sourceGate),
  });
}
function policyDepth(input: CharacterDisclosurePreflightInputV2): CharacterDisclosureDepthV1 {
  const rule = resolveCharacterDisclosurePolicyV1(input.characterId).topicRules[input.topicKey];
  const gates = effectiveGates(input);
  const rank = GATE_RANK[input.relationship.gate];
  if (rank >= GATE_RANK[gates.full]) return rule.sensitivity === 'medium' ? 'surface' : 'deep';
  if (rank >= GATE_RANK[gates.partial]) {
    return rank >= GATE_RANK.ATTACHED ? 'meaning' : 'surface';
  }
  return 'none';
}
function hasContext(input: CharacterDisclosurePreflightInputV2): boolean {
  return input.relationship.relevantSharedHistoryRefs.length > 0 ||
    input.source.previouslyDisclosedDepth !== 'none' ||
    input.questionContext === 'reciprocal_disclosure' ||
    input.questionContext === 'continuation' ||
    input.questionContext === 'relationship_relevant';
}
function contextualEligible(input: CharacterDisclosurePreflightInputV2): boolean {
  if (input.questionContext === 'pressuring' || !hasContext(input)) return false;
  if (input.relationship.gate === 'PUBLIC') {
    return input.relationship.trustBand !== 'low' &&
      (input.questionContext === 'reciprocal_disclosure' ||
        input.source.previouslyDisclosedDepth !== 'none');
  }
  if (input.relationship.gate === 'FAMILIAR') return input.relationship.trustBand !== 'low';
  if (input.relationship.gate === 'ATTACHED') {
    return input.relationship.trustBand !== 'low' &&
      (input.relationship.relevantSharedHistoryRefs.length > 0 ||
        input.source.previouslyDisclosedDepth !== 'none');
  }
  return input.relationship.trustBand === 'high' &&
    (input.relationship.relevantSharedHistoryRefs.length > 0 ||
      input.source.previouslyDisclosedDepth !== 'none');
}
function relationshipEligible(
  input: CharacterDisclosurePreflightInputV2,
  requestedDepth: CharacterDisclosureDepthV1,
): boolean {
  if (requestedDepth === 'none' || input.questionContext === 'pressuring') return false;
  if (input.factAuthority.disclosureDefault === 'CONTEXTUAL') return contextualEligible(input);
  const gate = input.relationship.gate;
  if (gate === 'PUBLIC') return input.factAuthority.disclosureDefault === 'PUBLIC';
  if (gate === 'FAMILIAR') return input.relationship.trustBand !== 'low' && hasContext(input);
  if (gate === 'ATTACHED') {
    return input.relationship.trustBand !== 'low' &&
      input.relationship.relevantSharedHistoryRefs.length > 0;
  }
  return input.relationship.trustBand === 'high' &&
    input.relationship.relevantSharedHistoryRefs.length > 0;
}

function validate(input: CharacterDisclosurePreflightInputV2): void {
  if (input.source.topicKey !== input.topicKey) {
    throw new TypeError('Disclosure source descriptor topicKey mismatch.');
  }
  if (text(input.source.factKey, 'source.factKey') !== input.factAuthority.factKey) {
    throw new TypeError('Disclosure source descriptor factKey must match Fact Authority.');
  }
  text(input.source.sourceRef, 'source.sourceRef');
  const authoritative = isRuntimeAuthoritativeCharacterFactV1(input.factAuthority);
  if (authoritative && input.factAuthority.characterKnowledge === 'NOT_APPLICABLE') {
    throw new TypeError('Authoritative sensitive Character fact cannot use NOT_APPLICABLE knowledge.');
  }
  if (authoritative && input.factAuthority.disclosureDefault === 'NOT_APPLICABLE') {
    throw new TypeError('Authoritative sensitive Character fact cannot use NOT_APPLICABLE disclosure.');
  }
  if (!authoritative && input.source.previouslyDisclosedDepth !== 'none') {
    throw new TypeError('Non-authoritative Character biography cannot have prior disclosure.');
  }
  if (!isKnownToCharacterV1(input.factAuthority) &&
      input.source.previouslyDisclosedDepth !== 'none') {
    throw new TypeError('Character-unknown biography cannot have prior disclosure.');
  }
  if (input.factAuthority.disclosureDefault === 'NEVER' &&
      input.source.previouslyDisclosedDepth !== 'none') {
    throw new TypeError('NEVER-disclosed biography cannot have prior disclosure.');
  }
}

function makeDecision(input: {
  request: CharacterDisclosurePreflightInputV2;
  result: CharacterDisclosureResultV2;
  reasonCode: CharacterDisclosureReasonCodeV2;
  behaviorAction: string;
  sharedHistoryRefs: readonly string[];
  depth?: CharacterDisclosureDepthV1;
  sourceRef?: string | null;
  authorityGap?: boolean;
  knowledgeGap?: boolean;
}): CharacterDisclosureDecisionV2 {
  return Object.freeze({
    schemaVersion: CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V2,
    characterId: input.request.characterId,
    topicKey: input.request.topicKey,
    factKey: input.request.source.factKey,
    authority: Object.freeze({
      sourceAuthority: input.request.factAuthority.sourceAuthority,
      characterKnowledge: input.request.factAuthority.characterKnowledge,
      disclosureDefault: input.request.factAuthority.disclosureDefault,
    }),
    result: input.result,
    reasonCode: input.reasonCode,
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
      previouslyDisclosedDepth: input.request.source.previouslyDisclosedDepth,
    }),
    authorityGap: input.authorityGap ?? false,
    knowledgeGap: input.knowledgeGap ?? false,
  });
}

function closed(
  request: CharacterDisclosurePreflightInputV2,
  sharedHistoryRefs: readonly string[],
  reasonCode: 'DISCLOSURE_NEVER' | 'PRESSURING_CONTEXT' | 'RELATIONSHIP_NOT_ELIGIBLE',
): CharacterDisclosureDecisionV2 {
  const policy = resolveCharacterDisclosurePolicyV1(request.characterId);
  const result = reasonCode === 'RELATIONSHIP_NOT_ELIGIBLE'
    ? policy.behavior.closedResult
    : ('BOUNDARY' as const);
  return makeDecision({
    request,
    result,
    reasonCode,
    behaviorAction: result === 'DEFLECT'
      ? policy.behavior.deflectAction
      : policy.behavior.boundaryAction,
    sharedHistoryRefs,
  });
}

export function evaluateCharacterDisclosurePreflightV2(
  input: CharacterDisclosurePreflightInputV2,
): CharacterDisclosureDecisionV2 {
  validate(input);
  const sharedHistoryRefs = refs(input.relationship.relevantSharedHistoryRefs);
  const policy = resolveCharacterDisclosurePolicyV1(input.characterId);

  if (input.factAuthority.disclosureDefault === 'NEVER') {
    return closed(input, sharedHistoryRefs, 'DISCLOSURE_NEVER');
  }
  if (input.questionContext === 'pressuring') {
    return closed(input, sharedHistoryRefs, 'PRESSURING_CONTEXT');
  }

  const currentPolicyDepth = policyDepth(input);
  const prior = input.source.previouslyDisclosedDepth;
  const eligible = prior !== 'none' || relationshipEligible(input, currentPolicyDepth);
  if (!eligible) return closed(input, sharedHistoryRefs, 'RELATIONSHIP_NOT_ELIGIBLE');

  if (input.factAuthority.sourceAuthority === 'AUTHOR_UNDEFINED') {
    return makeDecision({
      request: input,
      result: 'AUTHORITY_ABSTAIN',
      reasonCode: 'AUTHOR_UNDEFINED',
      behaviorAction: policy.behavior.authorityAbstainAction,
      sharedHistoryRefs,
      authorityGap: true,
    });
  }
  if (input.factAuthority.sourceAuthority === 'INTENTIONALLY_OPEN') {
    return makeDecision({
      request: input,
      result: 'AUTHORITY_ABSTAIN',
      reasonCode: 'INTENTIONALLY_OPEN',
      behaviorAction: policy.behavior.authorityAbstainAction,
      sharedHistoryRefs,
    });
  }
  if (input.factAuthority.sourceAuthority === 'WORLD_DEPENDENT') {
    return makeDecision({
      request: input,
      result: 'AUTHORITY_ABSTAIN',
      reasonCode: 'WORLD_AUTHORITY_REQUIRED',
      behaviorAction: policy.behavior.authorityAbstainAction,
      sharedHistoryRefs,
      authorityGap: true,
    });
  }
  if (input.factAuthority.characterKnowledge === 'UNKNOWN_TO_CHARACTER') {
    return makeDecision({
      request: input,
      result: 'KNOWLEDGE_ABSTAIN',
      reasonCode: 'UNKNOWN_TO_CHARACTER',
      behaviorAction: policy.behavior.authorityAbstainAction,
      sharedHistoryRefs,
      knowledgeGap: true,
    });
  }

  const requested = DEPTH_RANK[prior] > DEPTH_RANK[currentPolicyDepth]
    ? prior
    : currentPolicyDepth;
  let allowed = minDepth(requested, input.source.allowedDepth);
  if (input.factAuthority.characterKnowledge === 'PARTIAL' &&
      DEPTH_RANK[allowed] > DEPTH_RANK.surface) {
    allowed = 'surface';
  }

  const gates = effectiveGates(input);
  const fullProbe: CharacterDisclosurePreflightInputV2 = {
    ...input,
    relationship: { ...input.relationship, gate: gates.full },
  };
  const fullDepth = minDepth(policyDepth(fullProbe), input.source.allowedDepth);
  const result = input.factAuthority.characterKnowledge === 'PARTIAL' ||
    DEPTH_RANK[allowed] < DEPTH_RANK[fullDepth]
      ? ('PARTIAL' as const)
      : ('ALLOW' as const);
  const reasonCode = prior !== 'none' && DEPTH_RANK[allowed] <= DEPTH_RANK[prior]
    ? ('PRIOR_DISCLOSURE_CONTINUITY' as const)
    : result === 'ALLOW'
      ? ('ELIGIBLE_FULL' as const)
      : ('ELIGIBLE_PARTIAL' as const);

  return makeDecision({
    request: input,
    result,
    reasonCode,
    depth: allowed,
    sourceRef: input.source.sourceRef,
    behaviorAction: result === 'ALLOW'
      ? policy.behavior.allowAction
      : policy.behavior.partialAction,
    sharedHistoryRefs,
  });
}

export interface CharacterDisclosureRetrievedSourceV2 {
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly factKey: string;
  readonly depth: Exclude<CharacterDisclosureDepthV1, 'none'>;
  readonly sourceRef: string;
  readonly content: string;
}

export function guardCharacterDisclosureRetrievalV2(input: {
  readonly decision: CharacterDisclosureDecisionV2;
  readonly retrievedSources: readonly CharacterDisclosureRetrievedSourceV2[];
}): readonly CharacterDisclosureRetrievedSourceV2[] {
  const scope = input.decision.retrievalScope;
  if (scope.depth === 'none') {
    if (input.retrievedSources.length > 0) {
      throw new TypeError('Disclosure-blocked private content must not enter runtime context.');
    }
    return Object.freeze([]);
  }
  if (input.decision.result !== 'ALLOW' && input.decision.result !== 'PARTIAL') {
    throw new TypeError('Private retrieval requires ALLOW or PARTIAL.');
  }
  if (input.retrievedSources.length > 8) {
    throw new TypeError('Disclosure retrieval exceeds 8 source slices.');
  }
  const seen = new Set<string>();
  return Object.freeze(input.retrievedSources.map((source, index) => {
    if (source.topicKey !== input.decision.topicKey) {
      throw new TypeError('Retrieved topic is outside disclosure decision.');
    }
    if (source.factKey !== input.decision.factKey) {
      throw new TypeError('Retrieved factKey is outside disclosure decision.');
    }
    if (DEPTH_RANK[source.depth] > DEPTH_RANK[scope.depth]) {
      throw new TypeError('Retrieved depth exceeds disclosure decision.');
    }
    const sourceRef = text(source.sourceRef, 'retrievedSources[' + index + '].sourceRef');
    if (scope.sourceRef !== null && sourceRef !== scope.sourceRef) {
      throw new TypeError('Retrieved sourceRef is outside disclosure decision.');
    }
    if (seen.has(sourceRef)) throw new TypeError('Retrieved source refs must be unique.');
    seen.add(sourceRef);
    const body = source.content.trim();
    if (body.length === 0 || body.length > 6000) {
      throw new TypeError('Retrieved content is outside supported bounds.');
    }
    return Object.freeze({
      topicKey: source.topicKey,
      factKey: source.factKey,
      depth: source.depth,
      sourceRef,
      content: body,
    });
  }));
}
