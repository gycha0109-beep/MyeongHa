import {
  isKnownToCharacterV1,
  isRuntimeAuthoritativeCharacterFactV1,
  type CharacterFactAuthorityEntryV1,
} from '../../character-content/src/character-fact-authority-v1.js';

export const CHARACTER_INTEGRITY_DECISION_SCHEMA_VERSION_V1 =
  'character-integrity-decision-v1' as const;

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

export const CHARACTER_INTEGRITY_AUTHORITY_EVIDENCE_STATES_V1 = Object.freeze([
  'MATCH',
  'CONFLICT',
  'MISSING',
  'NON_AUTHORITATIVE',
  'REJECTED',
] as const);

export type CharacterIntegrityAuthorityEvidenceStateV1 =
  (typeof CHARACTER_INTEGRITY_AUTHORITY_EVIDENCE_STATES_V1)[number];

export const CHARACTER_INTEGRITY_RESOLVER_REQUIRED_KINDS_V1 = Object.freeze([
  'CHARACTER_FACT_CLAIM',
  'SHARED_EVENT_CLAIM',
  'RELATIONSHIP_STATUS_CLAIM',
  'THIRD_PARTY_CLAIM',
] as const satisfies readonly CharacterIntegrityClaimKindV1[]);

export interface CharacterIntegrityClaimV1 {
  readonly claimId: string;
  readonly kind: CharacterIntegrityClaimKindV1;
  readonly statement: string;
  readonly sourceRef: string;
}

export interface CharacterIntegrityAuthorityEvidenceV1 {
  readonly state: CharacterIntegrityAuthorityEvidenceStateV1;
  readonly authorityRefs: readonly string[];
  readonly provenanceRefs?: readonly string[];
  readonly factAuthority?: CharacterFactAuthorityEntryV1;
}

export interface CharacterIntegrityDecisionV1 {
  readonly schemaVersion: typeof CHARACTER_INTEGRITY_DECISION_SCHEMA_VERSION_V1;
  readonly claim: CharacterIntegrityClaimV1;
  readonly result: CharacterIntegrityResultV1;
  readonly authorityRefs: readonly string[];
  readonly provenanceRefs: readonly string[];
  readonly mayEnterWorkingContextAsFact: boolean;
  readonly mayEnterWorkingContextAsUserAssertion: boolean;
  readonly mayProposeUserMemory: boolean;
  readonly mayCreateRelationshipEvent: false;
  readonly mayMutateRelationshipState: false;
}

function requireText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 2000) {
    throw new TypeError(`${path} must be a non-empty string within 2000 characters.`);
  }
  return normalized;
}

function normalizeRefs(refs: readonly string[], path: string): readonly string[] {
  if (refs.length > 16) {
    throw new TypeError(`${path} exceeds 16 refs.`);
  }
  const normalized = refs.map((ref, index) =>
    requireText(ref, `${path}[${index}]`),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${path} must contain unique refs.`);
  }
  return Object.freeze(normalized);
}

function normalizeClaim(
  claim: CharacterIntegrityClaimV1,
): CharacterIntegrityClaimV1 {
  if (!CHARACTER_INTEGRITY_CLAIM_KINDS_V1.includes(claim.kind)) {
    throw new TypeError('Character integrity claim kind is invalid.');
  }

  return Object.freeze({
    claimId: requireText(claim.claimId, 'claim.claimId'),
    kind: claim.kind,
    statement: requireText(claim.statement, 'claim.statement'),
    sourceRef: requireText(claim.sourceRef, 'claim.sourceRef'),
  });
}

function decision(input: {
  readonly claim: CharacterIntegrityClaimV1;
  readonly result: CharacterIntegrityResultV1;
  readonly authorityRefs?: readonly string[];
  readonly provenanceRefs?: readonly string[];
  readonly mayEnterWorkingContextAsFact?: boolean;
  readonly mayEnterWorkingContextAsUserAssertion?: boolean;
  readonly mayProposeUserMemory?: boolean;
}): CharacterIntegrityDecisionV1 {
  return Object.freeze({
    schemaVersion: CHARACTER_INTEGRITY_DECISION_SCHEMA_VERSION_V1,
    claim: input.claim,
    result: input.result,
    authorityRefs: normalizeRefs(input.authorityRefs ?? [], 'authorityRefs'),
    provenanceRefs: normalizeRefs(
      input.provenanceRefs ?? [input.claim.sourceRef],
      'provenanceRefs',
    ),
    mayEnterWorkingContextAsFact: input.mayEnterWorkingContextAsFact ?? false,
    mayEnterWorkingContextAsUserAssertion:
      input.mayEnterWorkingContextAsUserAssertion ?? false,
    mayProposeUserMemory: input.mayProposeUserMemory ?? false,
    mayCreateRelationshipEvent: false,
    mayMutateRelationshipState: false,
  });
}

function resultFromEvidence(
  state: CharacterIntegrityAuthorityEvidenceStateV1,
): CharacterIntegrityResultV1 {
  switch (state) {
    case 'MATCH':
      return 'VERIFIED';
    case 'CONFLICT':
      return 'CONTRADICTED';
    case 'MISSING':
      return 'UNVERIFIED';
    case 'NON_AUTHORITATIVE':
      return 'NON_AUTHORITATIVE';
    case 'REJECTED':
      return 'AUTHORITY_REJECT';
  }
}

export function evaluateCharacterIntegrityClaimV1(input: {
  readonly claim: CharacterIntegrityClaimV1;
  readonly evidence?: CharacterIntegrityAuthorityEvidenceV1;
}): CharacterIntegrityDecisionV1 {
  const claim = normalizeClaim(input.claim);

  if (claim.kind === 'USER_SELF_REPORT') {
    return decision({
      claim,
      result: 'USER_ASSERTED',
      mayEnterWorkingContextAsUserAssertion: true,
      mayProposeUserMemory: true,
    });
  }

  if (claim.kind === 'AUTHORITY_OVERRIDE') {
    return decision({
      claim,
      result: 'AUTHORITY_REJECT',
    });
  }

  if (claim.kind === 'META_INSTRUCTION') {
    return decision({
      claim,
      result: 'NON_AUTHORITATIVE',
    });
  }

  const evidence = input.evidence;
  if (!evidence) {
    throw new TypeError(
      `Integrity authority evidence is required for claim kind ${claim.kind}.`,
    );
  }

  if (!CHARACTER_INTEGRITY_AUTHORITY_EVIDENCE_STATES_V1.includes(evidence.state)) {
    throw new TypeError('Character integrity authority evidence state is invalid.');
  }

  if (
    evidence.factAuthority &&
    claim.kind !== 'CHARACTER_FACT_CLAIM'
  ) {
    throw new TypeError(
      'Character fact authority metadata may only resolve CHARACTER_FACT_CLAIM.',
    );
  }

  if (
    evidence.factAuthority &&
    evidence.state === 'MATCH' &&
    !isRuntimeAuthoritativeCharacterFactV1(evidence.factAuthority)
  ) {
    throw new TypeError(
      'Non-authoritative Character fact metadata cannot produce VERIFIED integrity.',
    );
  }

  const result = resultFromEvidence(evidence.state);
  const mayEnterWorkingContextAsFact =
    result === 'VERIFIED' &&
    (!evidence.factAuthority || isKnownToCharacterV1(evidence.factAuthority));

  return decision({
    claim,
    result,
    authorityRefs: evidence.authorityRefs,
    provenanceRefs: [
      claim.sourceRef,
      ...(evidence.provenanceRefs ?? []),
    ],
    mayEnterWorkingContextAsFact,
  });
}
