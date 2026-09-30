export const CHARACTER_RUNTIME_CLAIM_CLASSES_V1 = [
  'USER_SELF_REPORT',
  'CHARACTER_FACT_CLAIM',
  'SHARED_EVENT_CLAIM',
  'RELATIONSHIP_STATUS_CLAIM',
  'THIRD_PARTY_CLAIM',
  'AUTHORITY_OVERRIDE',
  'META_INSTRUCTION',
] as const;

export type CharacterRuntimeClaimClassV1 =
  (typeof CHARACTER_RUNTIME_CLAIM_CLASSES_V1)[number];

export const CHARACTER_RUNTIME_CLAIM_EVIDENCE_STATES_V1 = [
  'authoritative_match',
  'authoritative_conflict',
  'no_authoritative_support',
  'non_authoritative_context',
] as const;

export type CharacterRuntimeClaimEvidenceStateV1 =
  (typeof CHARACTER_RUNTIME_CLAIM_EVIDENCE_STATES_V1)[number];

export const CHARACTER_RUNTIME_INTEGRITY_RESULTS_V1 = [
  'VERIFIED',
  'USER_ASSERTED',
  'UNVERIFIED',
  'CONTRADICTED',
  'NON_AUTHORITATIVE',
  'AUTHORITY_REJECT',
] as const;

export type CharacterRuntimeIntegrityResultV1 =
  (typeof CHARACTER_RUNTIME_INTEGRITY_RESULTS_V1)[number];

export interface CharacterRuntimeClaimIntegrityInputV1 {
  readonly claimClass: CharacterRuntimeClaimClassV1;
  /**
   * Evidence is already resolved by the owning server authority.
   * This layer never treats user prose or previous assistant output as evidence.
   */
  readonly evidenceState: CharacterRuntimeClaimEvidenceStateV1;
}

export interface CharacterRuntimeClaimIntegrityDecisionV1 {
  readonly schemaVersion: 'v1';
  readonly claimClass: CharacterRuntimeClaimClassV1;
  readonly evidenceState: CharacterRuntimeClaimEvidenceStateV1;
  readonly result: CharacterRuntimeIntegrityResultV1;
  readonly mayTreatPremiseAsAuthoritativeFact: boolean;
}

export function resolveCharacterRuntimeClaimIntegrityV1(
  input: CharacterRuntimeClaimIntegrityInputV1,
): CharacterRuntimeClaimIntegrityDecisionV1 {
  let result: CharacterRuntimeIntegrityResultV1;

  if (input.claimClass === 'AUTHORITY_OVERRIDE') {
    result = 'AUTHORITY_REJECT';
  } else if (input.claimClass === 'META_INSTRUCTION') {
    result = 'NON_AUTHORITATIVE';
  } else if (input.claimClass === 'USER_SELF_REPORT') {
    result = 'USER_ASSERTED';
  } else {
    switch (input.evidenceState) {
      case 'authoritative_match':
        result = 'VERIFIED';
        break;
      case 'authoritative_conflict':
        result = 'CONTRADICTED';
        break;
      case 'non_authoritative_context':
        result = 'NON_AUTHORITATIVE';
        break;
      case 'no_authoritative_support':
        result = 'UNVERIFIED';
        break;
    }
  }

  return Object.freeze({
    schemaVersion: 'v1',
    claimClass: input.claimClass,
    evidenceState: input.evidenceState,
    result,
    mayTreatPremiseAsAuthoritativeFact: result === 'VERIFIED',
  });
}

export const CHARACTER_RUNTIME_SOURCE_AUTHORITY_STATES_V1 = [
  'CANON',
  'SOFT_CANON',
  'AUTHOR_UNDEFINED',
  'INTENTIONALLY_OPEN',
  'WORLD_DEPENDENT',
] as const;

export type CharacterRuntimeSourceAuthorityStateV1 =
  (typeof CHARACTER_RUNTIME_SOURCE_AUTHORITY_STATES_V1)[number];

export const CHARACTER_RUNTIME_DISCLOSURE_GATES_V1 = [
  'PUBLIC',
  'FAMILIAR',
  'ATTACHED',
  'DEEP_TRUST',
  'CONTEXTUAL',
  'NEVER',
  'NOT_APPLICABLE',
] as const;

export type CharacterRuntimeDisclosureGateV1 =
  (typeof CHARACTER_RUNTIME_DISCLOSURE_GATES_V1)[number];

export const CHARACTER_RUNTIME_DISCLOSURE_RESULTS_V1 = [
  'ALLOW',
  'PARTIAL',
  'DEFLECT',
  'BOUNDARY',
  'REDIRECT',
  'AUTHORITY_ABSTAIN',
] as const;

export type CharacterRuntimeDisclosureResultV1 =
  (typeof CHARACTER_RUNTIME_DISCLOSURE_RESULTS_V1)[number];

export const CHARACTER_RUNTIME_DISCLOSURE_DEPTHS_V1 = [
  'surface',
  'detail',
  'deep',
] as const;

export type CharacterRuntimeDisclosureDepthV1 =
  (typeof CHARACTER_RUNTIME_DISCLOSURE_DEPTHS_V1)[number];

export type CharacterRuntimeDisclosureRelationshipStageV1 =
  | 'public'
  | 'familiar'
  | 'attached'
  | 'deep_trust';

export type CharacterRuntimeDisclosureTrustBandV1 = 'low' | 'medium' | 'high';

export type CharacterRuntimeDisclosureIneligibleResultV1 =
  | 'DEFLECT'
  | 'BOUNDARY'
  | 'REDIRECT';

export interface CharacterRuntimeDisclosurePreflightInputV1 {
  readonly topicKey: string;
  readonly sourceAuthorityState: CharacterRuntimeSourceAuthorityStateV1;
  readonly minimumDisclosureGate: CharacterRuntimeDisclosureGateV1;
  readonly relationshipStage: CharacterRuntimeDisclosureRelationshipStageV1;
  readonly trustBand: CharacterRuntimeDisclosureTrustBandV1;
  readonly minimumTrustBand?: CharacterRuntimeDisclosureTrustBandV1;
  /**
   * Caller-resolved result of relevant shared history + current question context.
   * No sensitive biography content belongs in this field.
   */
  readonly contextualEligibility: boolean;
  readonly characterSpecificBoundaryAllows: boolean;
  readonly requestedDepth: CharacterRuntimeDisclosureDepthV1;
  readonly allowedDepth: CharacterRuntimeDisclosureDepthV1;
  readonly previouslyDisclosedDepth?: CharacterRuntimeDisclosureDepthV1;
  readonly ineligibleResult: CharacterRuntimeDisclosureIneligibleResultV1;
}

export type CharacterRuntimeDisclosureRetrievalPlanV1 =
  | {
      readonly scope: 'none';
    }
  | {
      readonly scope: 'bounded';
      readonly depth: CharacterRuntimeDisclosureDepthV1;
    };

export type CharacterRuntimeDisclosureReasonV1 =
  | 'eligible'
  | 'requested_depth_exceeds_allowed'
  | 'source_authority_unresolved'
  | 'relationship_gate'
  | 'trust_gate'
  | 'context_gate'
  | 'character_boundary'
  | 'never_disclose';

export interface CharacterRuntimeDisclosureDecisionV1 {
  readonly schemaVersion: 'v1';
  readonly topicKey: string;
  readonly result: CharacterRuntimeDisclosureResultV1;
  readonly reason: CharacterRuntimeDisclosureReasonV1;
  readonly retrieval: CharacterRuntimeDisclosureRetrievalPlanV1;
}

const RELATIONSHIP_STAGE_RANK: Readonly<
  Record<CharacterRuntimeDisclosureRelationshipStageV1, number>
> = {
  public: 0,
  familiar: 1,
  attached: 2,
  deep_trust: 3,
};

const TRUST_BAND_RANK: Readonly<Record<CharacterRuntimeDisclosureTrustBandV1, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

const DISCLOSURE_DEPTH_RANK: Readonly<Record<CharacterRuntimeDisclosureDepthV1, number>> = {
  surface: 0,
  detail: 1,
  deep: 2,
};

function requiredTopicKey(value: string): string {
  const topicKey = value.trim();
  if (topicKey.length === 0 || topicKey.length > 128) {
    throw new TypeError('topicKey is outside the supported bounds.');
  }
  return topicKey;
}

function relationshipGateSatisfied(
  gate: CharacterRuntimeDisclosureGateV1,
  relationshipStage: CharacterRuntimeDisclosureRelationshipStageV1,
  contextualEligibility: boolean,
): boolean {
  switch (gate) {
    case 'PUBLIC':
    case 'NOT_APPLICABLE':
      return true;
    case 'FAMILIAR':
      return RELATIONSHIP_STAGE_RANK[relationshipStage] >= RELATIONSHIP_STAGE_RANK.familiar;
    case 'ATTACHED':
      return RELATIONSHIP_STAGE_RANK[relationshipStage] >= RELATIONSHIP_STAGE_RANK.attached;
    case 'DEEP_TRUST':
      return RELATIONSHIP_STAGE_RANK[relationshipStage] >= RELATIONSHIP_STAGE_RANK.deep_trust;
    case 'CONTEXTUAL':
      return contextualEligibility;
    case 'NEVER':
      return false;
  }
}

function sourceAuthorityResolved(
  state: CharacterRuntimeSourceAuthorityStateV1,
): boolean {
  return state === 'CANON' || state === 'SOFT_CANON';
}

function previouslyDisclosedAtLeast(
  previous: CharacterRuntimeDisclosureDepthV1 | undefined,
  requested: CharacterRuntimeDisclosureDepthV1,
): boolean {
  return (
    previous !== undefined &&
    DISCLOSURE_DEPTH_RANK[previous] >= DISCLOSURE_DEPTH_RANK[requested]
  );
}

function noRetrievalDecision(
  topicKey: string,
  result: CharacterRuntimeDisclosureResultV1,
  reason: CharacterRuntimeDisclosureReasonV1,
): CharacterRuntimeDisclosureDecisionV1 {
  return Object.freeze({
    schemaVersion: 'v1',
    topicKey,
    result,
    reason,
    retrieval: Object.freeze({ scope: 'none' as const }),
  });
}

/**
 * Deterministic metadata-only disclosure preflight.
 *
 * The caller must supply compact authority/eligibility metadata, not private
 * biography text. Retrieval is planned only after this decision.
 */
export function resolveCharacterRuntimeDisclosurePreflightV1(
  input: CharacterRuntimeDisclosurePreflightInputV1,
): CharacterRuntimeDisclosureDecisionV1 {
  const topicKey = requiredTopicKey(input.topicKey);

  if (input.minimumDisclosureGate === 'NEVER') {
    return noRetrievalDecision(topicKey, input.ineligibleResult, 'never_disclose');
  }

  if (!input.characterSpecificBoundaryAllows) {
    return noRetrievalDecision(topicKey, input.ineligibleResult, 'character_boundary');
  }

  const previousDisclosureCoversRequest = previouslyDisclosedAtLeast(
    input.previouslyDisclosedDepth,
    input.requestedDepth,
  );

  if (
    !previousDisclosureCoversRequest &&
    !relationshipGateSatisfied(
      input.minimumDisclosureGate,
      input.relationshipStage,
      input.contextualEligibility,
    )
  ) {
    const reason =
      input.minimumDisclosureGate === 'CONTEXTUAL'
        ? 'context_gate'
        : 'relationship_gate';
    return noRetrievalDecision(topicKey, input.ineligibleResult, reason);
  }

  if (
    input.minimumTrustBand !== undefined &&
    !previousDisclosureCoversRequest &&
    TRUST_BAND_RANK[input.trustBand] < TRUST_BAND_RANK[input.minimumTrustBand]
  ) {
    return noRetrievalDecision(topicKey, input.ineligibleResult, 'trust_gate');
  }

  if (!sourceAuthorityResolved(input.sourceAuthorityState)) {
    return noRetrievalDecision(
      topicKey,
      'AUTHORITY_ABSTAIN',
      'source_authority_unresolved',
    );
  }

  if (
    DISCLOSURE_DEPTH_RANK[input.requestedDepth] >
    DISCLOSURE_DEPTH_RANK[input.allowedDepth]
  ) {
    return Object.freeze({
      schemaVersion: 'v1',
      topicKey,
      result: 'PARTIAL',
      reason: 'requested_depth_exceeds_allowed',
      retrieval: Object.freeze({
        scope: 'bounded' as const,
        depth: input.allowedDepth,
      }),
    });
  }

  return Object.freeze({
    schemaVersion: 'v1',
    topicKey,
    result: 'ALLOW',
    reason: 'eligible',
    retrieval: Object.freeze({
      scope: 'bounded' as const,
      depth: input.requestedDepth,
    }),
  });
}

export interface CharacterRuntimeSensitiveTopicPreflightInputV1 {
  readonly claim?: CharacterRuntimeClaimIntegrityInputV1;
  readonly disclosure: CharacterRuntimeDisclosurePreflightInputV1;
}

export interface CharacterRuntimeSensitiveTopicPreflightV1 {
  readonly schemaVersion: 'v1';
  readonly claimIntegrity: CharacterRuntimeClaimIntegrityDecisionV1 | null;
  readonly disclosure: CharacterRuntimeDisclosureDecisionV1;
}

/**
 * Preserves the Runtime Standard order:
 * claim integrity/source check -> disclosure eligibility -> retrieval plan.
 */
export function resolveCharacterRuntimeSensitiveTopicPreflightV1(
  input: CharacterRuntimeSensitiveTopicPreflightInputV1,
): CharacterRuntimeSensitiveTopicPreflightV1 {
  const claimIntegrity =
    input.claim === undefined
      ? null
      : resolveCharacterRuntimeClaimIntegrityV1(input.claim);
  const disclosure = resolveCharacterRuntimeDisclosurePreflightV1(
    input.disclosure,
  );

  return Object.freeze({
    schemaVersion: 'v1',
    claimIntegrity,
    disclosure,
  });
}
