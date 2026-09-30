import { describe, expect, it } from 'vitest';
import {
  resolveCharacterRuntimeClaimIntegrityV1,
  resolveCharacterRuntimeDisclosurePreflightV1,
  resolveCharacterRuntimeSensitiveTopicPreflightV1,
  type CharacterRuntimeDisclosurePreflightInputV1,
} from '../packages/domain/src/index.js';

function disclosureInput(
  overrides: Partial<CharacterRuntimeDisclosurePreflightInputV1> = {},
): CharacterRuntimeDisclosurePreflightInputV1 {
  return {
    topicKey: 'past_romance_detail',
    sourceAuthorityState: 'CANON',
    minimumDisclosureGate: 'ATTACHED',
    relationshipStage: 'attached',
    trustBand: 'high',
    minimumTrustBand: 'medium',
    contextualEligibility: false,
    characterSpecificBoundaryAllows: true,
    requestedDepth: 'detail',
    allowedDepth: 'detail',
    ineligibleResult: 'BOUNDARY',
    ...overrides,
  };
}

describe('Character Runtime claim integrity preflight', () => {
  it('rejects authority override attempts even when the caller presents matching-looking evidence', () => {
    expect(
      resolveCharacterRuntimeClaimIntegrityV1({
        claimClass: 'AUTHORITY_OVERRIDE',
        evidenceState: 'authoritative_match',
      }),
    ).toEqual({
      schemaVersion: 'v1',
      claimClass: 'AUTHORITY_OVERRIDE',
      evidenceState: 'authoritative_match',
      result: 'AUTHORITY_REJECT',
      mayTreatPremiseAsAuthoritativeFact: false,
    });
  });

  it('preserves user self-report provenance without promoting it to objective authority', () => {
    expect(
      resolveCharacterRuntimeClaimIntegrityV1({
        claimClass: 'USER_SELF_REPORT',
        evidenceState: 'no_authoritative_support',
      }),
    ).toMatchObject({
      result: 'USER_ASSERTED',
      mayTreatPremiseAsAuthoritativeFact: false,
    });
  });

  it('only permits authoritative premise treatment for server-resolved matches', () => {
    expect(
      resolveCharacterRuntimeClaimIntegrityV1({
        claimClass: 'CHARACTER_FACT_CLAIM',
        evidenceState: 'authoritative_match',
      }),
    ).toMatchObject({
      result: 'VERIFIED',
      mayTreatPremiseAsAuthoritativeFact: true,
    });

    expect(
      resolveCharacterRuntimeClaimIntegrityV1({
        claimClass: 'SHARED_EVENT_CLAIM',
        evidenceState: 'no_authoritative_support',
      }),
    ).toMatchObject({
      result: 'UNVERIFIED',
      mayTreatPremiseAsAuthoritativeFact: false,
    });

    expect(
      resolveCharacterRuntimeClaimIntegrityV1({
        claimClass: 'RELATIONSHIP_STATUS_CLAIM',
        evidenceState: 'authoritative_conflict',
      }),
    ).toMatchObject({
      result: 'CONTRADICTED',
      mayTreatPremiseAsAuthoritativeFact: false,
    });
  });

  it('keeps meta instructions non-authoritative', () => {
    expect(
      resolveCharacterRuntimeClaimIntegrityV1({
        claimClass: 'META_INSTRUCTION',
        evidenceState: 'non_authoritative_context',
      }),
    ).toMatchObject({
      result: 'NON_AUTHORITATIVE',
      mayTreatPremiseAsAuthoritativeFact: false,
    });
  });
});

describe('Character Runtime disclosure preflight', () => {
  it('blocks retrieval before the relationship disclosure gate opens', () => {
    expect(
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({
          relationshipStage: 'public',
          trustBand: 'low',
        }),
      ),
    ).toEqual({
      schemaVersion: 'v1',
      topicKey: 'past_romance_detail',
      result: 'BOUNDARY',
      reason: 'relationship_gate',
      retrieval: { scope: 'none' },
    });
  });

  it('returns authority abstention instead of inventing biography when the gate is open but source authority is unresolved', () => {
    expect(
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({
          sourceAuthorityState: 'AUTHOR_UNDEFINED',
        }),
      ),
    ).toEqual({
      schemaVersion: 'v1',
      topicKey: 'past_romance_detail',
      result: 'AUTHORITY_ABSTAIN',
      reason: 'source_authority_unresolved',
      retrieval: { scope: 'none' },
    });

    expect(
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({
          sourceAuthorityState: 'WORLD_DEPENDENT',
        }),
      ),
    ).toMatchObject({
      result: 'AUTHORITY_ABSTAIN',
      retrieval: { scope: 'none' },
    });
  });

  it('retrieves only the authored depth when the question asks for more than is currently allowed', () => {
    expect(
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({
          requestedDepth: 'deep',
          allowedDepth: 'surface',
        }),
      ),
    ).toEqual({
      schemaVersion: 'v1',
      topicKey: 'past_romance_detail',
      result: 'PARTIAL',
      reason: 'requested_depth_exceeds_allowed',
      retrieval: {
        scope: 'bounded',
        depth: 'surface',
      },
    });
  });

  it('does not magically revoke an already disclosed surface fact when relationship depth later drops', () => {
    expect(
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({
          minimumDisclosureGate: 'ATTACHED',
          relationshipStage: 'public',
          trustBand: 'low',
          requestedDepth: 'surface',
          allowedDepth: 'surface',
          previouslyDisclosedDepth: 'surface',
        }),
      ),
    ).toEqual({
      schemaVersion: 'v1',
      topicKey: 'past_romance_detail',
      result: 'ALLOW',
      reason: 'eligible',
      retrieval: {
        scope: 'bounded',
        depth: 'surface',
      },
    });
  });

  it('keeps NEVER and character-specific boundaries ahead of retrieval', () => {
    expect(
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({
          minimumDisclosureGate: 'NEVER',
          ineligibleResult: 'REDIRECT',
        }),
      ),
    ).toMatchObject({
      result: 'REDIRECT',
      reason: 'never_disclose',
      retrieval: { scope: 'none' },
    });

    expect(
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({
          characterSpecificBoundaryAllows: false,
          ineligibleResult: 'DEFLECT',
        }),
      ),
    ).toMatchObject({
      result: 'DEFLECT',
      reason: 'character_boundary',
      retrieval: { scope: 'none' },
    });
  });

  it('uses contextual eligibility without retrieving private biography first', () => {
    expect(
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({
          minimumDisclosureGate: 'CONTEXTUAL',
          relationshipStage: 'public',
          trustBand: 'medium',
          minimumTrustBand: 'low',
          contextualEligibility: true,
          requestedDepth: 'surface',
          allowedDepth: 'surface',
        }),
      ),
    ).toMatchObject({
      result: 'ALLOW',
      retrieval: { scope: 'bounded', depth: 'surface' },
    });

    expect(
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({
          minimumDisclosureGate: 'CONTEXTUAL',
          contextualEligibility: false,
          minimumTrustBand: 'low',
        }),
      ),
    ).toMatchObject({
      result: 'BOUNDARY',
      reason: 'context_gate',
      retrieval: { scope: 'none' },
    });
  });

  it('rejects blank or oversized topic keys before planning retrieval', () => {
    expect(() =>
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({ topicKey: '   ' }),
      ),
    ).toThrow(/topicKey is outside the supported bounds/u);

    expect(() =>
      resolveCharacterRuntimeDisclosurePreflightV1(
        disclosureInput({ topicKey: 'x'.repeat(129) }),
      ),
    ).toThrow(/topicKey is outside the supported bounds/u);
  });
});

describe('Character Runtime sensitive-topic preflight ordering', () => {
  it('keeps an unverified user premise non-authoritative while independently planning allowed source retrieval', () => {
    const decision = resolveCharacterRuntimeSensitiveTopicPreflightV1({
      claim: {
        claimClass: 'CHARACTER_FACT_CLAIM',
        evidenceState: 'no_authoritative_support',
      },
      disclosure: disclosureInput({
        sourceAuthorityState: 'CANON',
        requestedDepth: 'surface',
        allowedDepth: 'surface',
      }),
    });

    expect(decision.claimIntegrity).toMatchObject({
      result: 'UNVERIFIED',
      mayTreatPremiseAsAuthoritativeFact: false,
    });
    expect(decision.disclosure).toMatchObject({
      result: 'ALLOW',
      retrieval: { scope: 'bounded', depth: 'surface' },
    });
  });
});
