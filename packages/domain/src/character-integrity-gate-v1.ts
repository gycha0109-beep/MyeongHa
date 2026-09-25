import type {
  CharacterFactAuthorityRecordV1,
  CharacterKnowledgeStateV1,
  CharacterSourceAuthorityV1,
} from '../../character-content/src/character-fact-authority-v1.js';

export const CHARACTER_INTEGRITY_CLAIM_KINDS_V1 = Object.freeze([
  'USER_SELF_REPORT',
  'CHARACTER_FACT_CLAIM',
  'SHARED_EVENT_CLAIM',
  'RELATIONSHIP_STATUS_CLAIM',
  'THIRD_PARTY_CLAIM',
  'AUTHORITY_OVERRIDE',
  'META_INSTRUCTION',
] as const);

export type CharacterIntegrityClaimKindV1 =
  (typeof CHARACTER_INTEGRITY_CLAIM_KINDS_V1)[number];

export const CHARACTER_INTEGRITY_RESULTS_V1 = Object.freeze([
  'VERIFIED',
  'USER_ASSERTED',
  'UNVERIFIED',
  'CONTRADICTED',
  'NON_AUTHORITATIVE',
  'AUTHORITY_REJECT',
] as const);

export type CharacterIntegrityResultV1 =
  (typeof CHARACTER_INTEGRITY_RESULTS_V1)[number];

export const CHARACTER_INTEGRITY_AUTHORITY_SOURCE_KINDS_V1 = Object.freeze([
  'CHARACTER_BIBLE',
  'WORLD_AUTHORITY',
  'EVENT_LEDGER',
  'RELATIONSHIP_PROJECTION',
  'THIRD_PARTY_AUTHORITY',
  'ASSISTANT_OUTPUT',
  'NONE',
] as const);

export type CharacterIntegrityAuthoritySourceKindV1 =
  (typeof CHARACTER_INTEGRITY_AUTHORITY_SOURCE_KINDS_V1)[number];

export const CHARACTER_INTEGRITY_AUTHORITY_MATCHES_V1 = Object.freeze([
  'MATCH',
  'CONTRADICTS',
  'NO_EVIDENCE',
  'NON_AUTHORITATIVE',
] as const);

export type CharacterIntegrityAuthorityMatchV1 =
  (typeof CHARACTER_INTEGRITY_AUTHORITY_MATCHES_V1)[number];

export interface CharacterIntegrityClaimV1 {
  readonly claimId: string;
  readonly kind: CharacterIntegrityClaimKindV1;
  readonly normalizedClaim: string;
  readonly factKey: string | null;
}

export interface CharacterIntegrityAuthorityEvidenceV1 {
  readonly sourceKind: CharacterIntegrityAuthoritySourceKindV1;
  readonly match: CharacterIntegrityAuthorityMatchV1;
  readonly sourceRefs: readonly string[];
  readonly factAuthority: CharacterFactAuthorityRecordV1 | null;
}

export interface CharacterIntegrityDecisionV1 {
  readonly schemaVersion: 'character-integrity-decision-v1';
  readonly claim: CharacterIntegrityClaimV1;
  readonly result: CharacterIntegrityResultV1;
  readonly evidence: CharacterIntegrityAuthorityEvidenceV1 | null;
  readonly characterKnowledge: CharacterKnowledgeStateV1 | null;
  readonly sourceAuthority: CharacterSourceAuthorityV1 | null;
  readonly responsePosture:
    | 'accept_authoritative_fact'
    | 'treat_as_user_report'
    | 'do_not_affirm_premise'
    | 'correct_or_question'
    | 'treat_as_non_authoritative'
    | 'reject_authority_override';
  readonly commitPolicy: Readonly<{
    readonly mayUseAsCharacterKnowledge: boolean;
    readonly mayTreatAsSharedHistory: boolean;
    readonly mayProposeUserMemory: boolean;
    readonly mayCreateRelationshipEventFromClaim: false;
    readonly mayMutateRelationshipFromClaim: false;
    readonly mayPromoteAssistantOutputToAuthority: false;
  }>;
}

function requireText(value: string, path: string, maxLength = 2000): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TypeError(`${path} must be non-empty text within ${maxLength} characters.`);
  }
  return normalized;
}

function normalizeClaim(claim: CharacterIntegrityClaimV1): CharacterIntegrityClaimV1 {
  return Object.freeze({
    claimId: requireText(claim.claimId, 'claim.claimId', 256),
    kind: claim.kind,
    normalizedClaim: requireText(claim.normalizedClaim, 'claim.normalizedClaim'),
    factKey:
      claim.factKey === null
        ? null
        : requireText(claim.factKey, 'claim.factKey', 256),
  });
}

function normalizeEvidence(
  evidence: CharacterIntegrityAuthorityEvidenceV1,
): CharacterIntegrityAuthorityEvidenceV1 {
  if (evidence.sourceRefs.length > 16) {
    throw new TypeError('authority evidence may contain at most 16 source refs.');
  }
  const sourceRefs = evidence.sourceRefs.map((ref, index) =>
    requireText(ref, `evidence.sourceRefs[${index}]`, 512),
  );
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    throw new TypeError('authority evidence source refs must be unique.');
  }
  return Object.freeze({
    ...evidence,
    sourceRefs: Object.freeze(sourceRefs),
  });
}

function expectedSources(
  kind: CharacterIntegrityClaimKindV1,
): readonly CharacterIntegrityAuthoritySourceKindV1[] {
  switch (kind) {
    case 'CHARACTER_FACT_CLAIM':
      return ['CHARACTER_BIBLE', 'WORLD_AUTHORITY', 'ASSISTANT_OUTPUT', 'NONE'];
    case 'SHARED_EVENT_CLAIM':
      return ['EVENT_LEDGER', 'ASSISTANT_OUTPUT', 'NONE'];
    case 'RELATIONSHIP_STATUS_CLAIM':
      return ['RELATIONSHIP_PROJECTION', 'ASSISTANT_OUTPUT', 'NONE'];
    case 'THIRD_PARTY_CLAIM':
      return ['THIRD_PARTY_AUTHORITY', 'ASSISTANT_OUTPUT', 'NONE'];
    default:
      return ['NONE'];
  }
}

function assertEvidenceFitsClaim(
  claim: CharacterIntegrityClaimV1,
  evidence: CharacterIntegrityAuthorityEvidenceV1,
): void {
  if (!expectedSources(claim.kind).includes(evidence.sourceKind)) {
    throw new TypeError(
      `Authority source ${evidence.sourceKind} cannot resolve claim kind ${claim.kind}.`,
    );
  }

  if (claim.kind === 'CHARACTER_FACT_CLAIM') {
    if (claim.factKey === null) {
      throw new TypeError('CHARACTER_FACT_CLAIM requires factKey.');
    }
    if (
      evidence.factAuthority !== null &&
      evidence.factAuthority.factKey !== claim.factKey
    ) {
      throw new TypeError('factAuthority.factKey must match the classified claim factKey.');
    }

    if (
      evidence.sourceKind === 'CHARACTER_BIBLE' &&
      evidence.match === 'MATCH' &&
      evidence.factAuthority === null
    ) {
      throw new TypeError('Verified Bible fact evidence requires factAuthority metadata.');
    }

    const sourceAuthority = evidence.factAuthority?.sourceAuthority ?? null;
    if (
      evidence.match === 'MATCH' &&
      (sourceAuthority === 'AUTHOR_UNDEFINED' ||
        sourceAuthority === 'INTENTIONALLY_OPEN')
    ) {
      throw new TypeError(
        `${sourceAuthority} cannot be verified as an authored Character fact.`,
      );
    }
    if (
      evidence.match === 'MATCH' &&
      sourceAuthority === 'WORLD_DEPENDENT' &&
      evidence.sourceKind !== 'WORLD_AUTHORITY'
    ) {
      throw new TypeError(
        'WORLD_DEPENDENT fact requires the owning World authority for verification.',
      );
    }
  } else if (evidence.factAuthority !== null) {
    throw new TypeError('factAuthority metadata is only valid for CHARACTER_FACT_CLAIM.');
  }

  if (
    evidence.sourceKind === 'ASSISTANT_OUTPUT' &&
    evidence.match !== 'NON_AUTHORITATIVE'
  ) {
    throw new TypeError(
      'Assistant output is never authority evidence for Character fact, shared event, or relationship state.',
    );
  }
  if (evidence.sourceKind === 'NONE' && evidence.match !== 'NO_EVIDENCE') {
    throw new TypeError('NONE authority source must use NO_EVIDENCE.');
  }
}

function resultFromEvidence(
  evidence: CharacterIntegrityAuthorityEvidenceV1,
): CharacterIntegrityResultV1 {
  switch (evidence.match) {
    case 'MATCH':
      return 'VERIFIED';
    case 'CONTRADICTS':
      return 'CONTRADICTED';
    case 'NO_EVIDENCE':
      return 'UNVERIFIED';
    case 'NON_AUTHORITATIVE':
      return 'NON_AUTHORITATIVE';
  }
}

function postureForResult(
  result: CharacterIntegrityResultV1,
): CharacterIntegrityDecisionV1['responsePosture'] {
  switch (result) {
    case 'VERIFIED':
      return 'accept_authoritative_fact';
    case 'USER_ASSERTED':
      return 'treat_as_user_report';
    case 'CONTRADICTED':
      return 'correct_or_question';
    case 'AUTHORITY_REJECT':
      return 'reject_authority_override';
    case 'NON_AUTHORITATIVE':
      return 'treat_as_non_authoritative';
    case 'UNVERIFIED':
      return 'do_not_affirm_premise';
  }
}

export function evaluateCharacterIntegrityClaimV1(input: {
  readonly claim: CharacterIntegrityClaimV1;
  readonly evidence?: CharacterIntegrityAuthorityEvidenceV1 | null;
}): CharacterIntegrityDecisionV1 {
  const claim = normalizeClaim(input.claim);

  let evidence: CharacterIntegrityAuthorityEvidenceV1 | null = null;
  let result: CharacterIntegrityResultV1;

  if (claim.kind === 'USER_SELF_REPORT') {
    if (input.evidence !== undefined && input.evidence !== null) {
      throw new TypeError('USER_SELF_REPORT must retain user-asserted provenance rather than external verification here.');
    }
    result = 'USER_ASSERTED';
  } else if (claim.kind === 'AUTHORITY_OVERRIDE') {
    if (input.evidence !== undefined && input.evidence !== null) {
      throw new TypeError('AUTHORITY_OVERRIDE does not accept authority evidence.');
    }
    result = 'AUTHORITY_REJECT';
  } else if (claim.kind === 'META_INSTRUCTION') {
    if (input.evidence !== undefined && input.evidence !== null) {
      throw new TypeError('META_INSTRUCTION does not accept authority evidence.');
    }
    result = 'NON_AUTHORITATIVE';
  } else {
    if (input.evidence === undefined || input.evidence === null) {
      throw new TypeError(`${claim.kind} requires authority evidence.`);
    }
    evidence = normalizeEvidence(input.evidence);
    assertEvidenceFitsClaim(claim, evidence);
    result = resultFromEvidence(evidence);
  }

  const factAuthority = evidence?.factAuthority ?? null;
  const characterKnowledge = factAuthority?.characterKnowledge ?? null;
  const sourceAuthority = factAuthority?.sourceAuthority ?? null;
  const mayUseAsCharacterKnowledge =
    result === 'VERIFIED' &&
    claim.kind === 'CHARACTER_FACT_CLAIM' &&
    (characterKnowledge === 'KNOWN' || characterKnowledge === 'PARTIAL');

  return Object.freeze({
    schemaVersion: 'character-integrity-decision-v1' as const,
    claim,
    result,
    evidence,
    characterKnowledge,
    sourceAuthority,
    responsePosture: postureForResult(result),
    commitPolicy: Object.freeze({
      mayUseAsCharacterKnowledge,
      mayTreatAsSharedHistory:
        result === 'VERIFIED' && claim.kind === 'SHARED_EVENT_CLAIM',
      mayProposeUserMemory:
        result === 'USER_ASSERTED' && claim.kind === 'USER_SELF_REPORT',
      mayCreateRelationshipEventFromClaim: false as const,
      mayMutateRelationshipFromClaim: false as const,
      mayPromoteAssistantOutputToAuthority: false as const,
    }),
  });
}