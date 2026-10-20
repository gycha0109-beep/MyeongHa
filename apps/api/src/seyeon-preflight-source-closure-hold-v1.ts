import type {
  CharacterGovernedPreflightResultV1,
} from './character-governed-preflight-v1.js';
import {
  CHARACTER_GOVERNED_PREFLIGHT_SCHEMA_VERSION_V1,
} from './character-governed-preflight-v1.js';
import {
  CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2,
  type CharacterDisclosurePreflightResultV2,
  type CharacterDisclosureTopicClassificationV2,
} from './character-disclosure-preflight-v2.js';

/**
 * S3/G1 source-closure safety seam. The zero-source DB Pin precedes governed
 * Preflight, whose private retriever can introduce NEW content not covered by
 * that Pin. No positive/derived source authority or post-Preflight DB receipt
 * is approved yet; reject the additional ingress BEFORE interpreter/render.
 *
 * This check is not a DB Pin, Grant validation, or Reveal authorization.
 */
export const SEYEON_PREFLIGHT_SOURCE_CLOSURE_HOLD_VERSION_V1 =
  'seyeon-preflight-source-closure-hold-v1' as const;

export class SeyeonPreflightSourceClosureHoldV1 extends Error {
  readonly code = 'PREFLIGHT_PRIVATE_SOURCE_PIN_UNAVAILABLE' as const;

  constructor() {
    super('Se-yeon governed Preflight private-source authorization is unavailable.');
    this.name = 'SeyeonPreflightSourceClosureHoldV1';
  }
}

/**
 * The governed integrity lane is a SECOND model-context source. A future
 * resolver may return MATCH/CONFLICT or source references even while private
 * disclosure retrieval is empty. Until exact source/Grant lineage can be
 * pinned, the only admitted authority result is the Production conservative
 * resolver's explicit MISSING, bound to this user message. Self-report and
 * instruction claims contain no independently verified source.
 *
 * This is a post-Preflight model-input HOLD, not an authority resolver or
 * approval to read/commit/reveal any personal record.
 */
function assertSeyeonZeroIntegrityAuthorityV1(
  integrity: CharacterGovernedPreflightResultV1['integrity'],
): void {
  if (integrity === null || typeof integrity !== 'object' ||
      integrity.schemaVersion !== 'character-integrity-preflight-v1' ||
      integrity.characterId !== 'seyeon' ||
      typeof integrity.userMessageRef !== 'string' ||
      integrity.userMessageRef.trim() !== integrity.userMessageRef ||
      integrity.userMessageRef.length === 0 ||
      !Array.isArray(integrity.classification?.claims) ||
      !Array.isArray(integrity.decisions) ||
      integrity.classification.claims.length !== integrity.decisions.length ||
      integrity.decisions.length > 8) {
    throw new SeyeonPreflightSourceClosureHoldV1();
  }

  for (let i = 0; i < integrity.decisions.length; i++) {
    const decision = integrity.decisions[i];
    const classified = integrity.classification.claims[i];
    if (decision === undefined || classified === undefined ||
        decision.schemaVersion !== 'character-integrity-decision-v1' ||
        decision.claim === null || typeof decision.claim !== 'object' ||
        decision.claim.claimId !== classified.claimId ||
        decision.claim.kind !== classified.kind ||
        decision.claim.statement !== classified.statement ||
        decision.claim.sourceRef !== integrity.userMessageRef ||
        !Array.isArray(decision.authorityRefs) ||
        decision.authorityRefs.length !== 0 ||
        !Array.isArray(decision.provenanceRefs) ||
        decision.mayEnterWorkingContextAsFact !== false ||
        decision.mayCreateRelationshipEvent !== false ||
        decision.mayMutateRelationshipState !== false) {
      throw new SeyeonPreflightSourceClosureHoldV1();
    }

    const kind = decision.claim.kind;
    const requiresExternalAuthority =
      kind === 'CHARACTER_FACT_CLAIM' ||
      kind === 'SHARED_EVENT_CLAIM' ||
      kind === 'RELATIONSHIP_STATUS_CLAIM' ||
      kind === 'THIRD_PARTY_CLAIM';
    const selfReport = kind === 'USER_SELF_REPORT';
    const expectedResult =
      requiresExternalAuthority ? 'UNVERIFIED' :
      selfReport ? 'USER_ASSERTED' :
      kind === 'AUTHORITY_OVERRIDE' ? 'AUTHORITY_REJECT' :
      kind === 'META_INSTRUCTION' ? 'NON_AUTHORITATIVE' : null;
    const expectedRefs = requiresExternalAuthority
      ? [integrity.userMessageRef, 'production-governance:unresolved:' + kind]
      : [integrity.userMessageRef];

    if (expectedResult === null ||
        decision.result !== expectedResult ||
        decision.mayEnterWorkingContextAsUserAssertion !== selfReport ||
        decision.mayProposeUserMemory !== selfReport ||
        decision.provenanceRefs.length !== expectedRefs.length ||
        expectedRefs.some((ref, index) => decision.provenanceRefs[index] !== ref)) {
      throw new SeyeonPreflightSourceClosureHoldV1();
    }
  }
}

export function assertSeyeonPreflightZeroPrivateSourceClosureV1(
  preflight: CharacterGovernedPreflightResultV1,
): Readonly<{
  version: typeof SEYEON_PREFLIGHT_SOURCE_CLOSURE_HOLD_VERSION_V1;
  sourceState: 'explicit_zero_private_retrieval';
  permitsPositiveSourcePin: false;
  permitsHttpReveal: false;
}> {
  if (
    preflight === null || typeof preflight !== 'object' ||
    preflight.schemaVersion !== CHARACTER_GOVERNED_PREFLIGHT_SCHEMA_VERSION_V1 ||
    preflight.disclosure === null ||
    typeof preflight.disclosure !== 'object' ||
    preflight.disclosure.schemaVersion !== CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2 ||
    preflight.disclosure.status !== 'not_sensitive' ||
    preflight.disclosure.classification?.topicKey !== null ||
    preflight.disclosure.source !== null ||
    preflight.disclosure.factAuthority !== null ||
    preflight.disclosure.decision !== null ||
    !Array.isArray(preflight.retrievedPrivateSources) ||
    preflight.retrievedPrivateSources.length !== 0
  ) {
    throw new SeyeonPreflightSourceClosureHoldV1();
  }
  assertSeyeonZeroIntegrityAuthorityV1(preflight.integrity);

  return Object.freeze({
    version: SEYEON_PREFLIGHT_SOURCE_CLOSURE_HOLD_VERSION_V1,
    sourceState: 'explicit_zero_private_retrieval' as const,
    permitsPositiveSourcePin: false as const,
    permitsHttpReveal: false as const,
  });
}

/**
 * S3-B: deny an additional private-source read itself, not only its subsequent
 * inclusion in a model prompt. The earlier zero Pin has not authorized the
 * private retriever. Only a structurally explicit zero retrieval scope may
 * progress; no positive Grant or Reveal authority is created here.
 */
export function assertSeyeonZeroPrivateRetrievalBeforeReadV1(
  preflight: CharacterDisclosurePreflightResultV2,
): void {
  if (
    preflight === null || typeof preflight !== 'object' ||
    preflight.schemaVersion !== CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2
  ) {
    throw new SeyeonPreflightSourceClosureHoldV1();
  }
  if (preflight.status === 'not_sensitive') {
    if (
      preflight.source !== null ||
      preflight.factAuthority !== null ||
      preflight.decision !== null
    ) {
      throw new SeyeonPreflightSourceClosureHoldV1();
    }
    return;
  }
  if (preflight.status !== 'sensitive') {
    throw new SeyeonPreflightSourceClosureHoldV1();
  }
  const scope = preflight.decision?.retrievalScope;
  if (
    scope === null || typeof scope !== 'object' ||
    scope.depth !== 'none' || scope.sourceRef !== null
  ) {
    throw new SeyeonPreflightSourceClosureHoldV1();
  }
}

/**
 * S3-C: a positive disclosure topic can trigger private source-descriptor and
 * fact-authority reads before the S3-B retriever guard. No owner-approved
 * positive source/Grant contract exists. Refuse that metadata read in
 * Production; only an explicitly classified non-sensitive question may pass.
 *
 * This is a zero-only read boundary, NOT positive source authorization.
 */
export function assertSeyeonZeroPrivateDescriptorBeforeReadV1(
  classification: CharacterDisclosureTopicClassificationV2,
): void {
  if (
    classification === null ||
    typeof classification !== 'object' ||
    Array.isArray(classification) ||
    classification.topicKey !== null ||
    ![
      'casual_curiosity',
      'reciprocal_disclosure',
      'continuation',
      'relationship_relevant',
      'pressuring',
    ].includes(classification.questionContext) ||
    Object.keys(classification).some(
      key => key !== 'topicKey' && key !== 'questionContext',
    )
  ) {
    throw new SeyeonPreflightSourceClosureHoldV1();
  }
}
