import { describe, expect, it } from 'vitest';
import {
  FACE_INTERPRETATION_SHELL_VERSION_FE038,
  admitFaceInterpretationShellFE038,
  createFaceInterpretationShellFE038,
  type FaceNeutralObservationRefFE038,
} from './interpretation-shell-fe038.js';

const observation: FaceNeutralObservationRefFE038 = {
  schemaVersion: 'myeongha-face-neutral-observation-ref-v1',
  observationRef: 'obs_fe038_fixture_001',
  sourceContractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
  sourceProjectionSchemaVersion: 'myeongha-face-preview-one-shot-result-v1',
  metricCount: 12,
  regionCount: 4,
};

function mutableClone(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

describe('FE038 fail-closed interpretation shell', () => {
  it('creates only the locked criterion/claim/narrative state', () => {
    const shell = createFaceInterpretationShellFE038(observation);

    expect(FACE_INTERPRETATION_SHELL_VERSION_FE038)
      .toBe('MHA-FACE-INTERPRETATION-SHELL-FE038-v1');
    expect(shell).toEqual({
      schemaVersion: 'myeongha-face-interpretation-shell-v1',
      contractVersion: FACE_INTERPRETATION_SHELL_VERSION_FE038,
      observation,
      criterion: {
        state: 'not_admitted',
        reason: 'semantic_authority_not_installed',
        methodologyPackRef: null,
        operationalizationRef: null,
        ruleRef: null,
        sourceAuthorityRef: null,
      },
      claims: [],
      narrative: {
        allowed: false,
        reason: 'no_admitted_structured_claims',
        narrativeProfileRef: null,
        renderedArtifactRef: null,
      },
      boundary: {
        neutralObservationOnly: true,
        criterionAuthorityIssued: false,
        structuredClaimIssued: false,
        narrativeAuthorityIssued: false,
        classificationIssued: false,
        scoreIssued: false,
        rankingIssued: false,
        traditionalInterpretationIssued: false,
        llmSemanticAuthorityIssued: false,
        productionAuthorityIssued: false,
      },
    });
    expect(Object.isFrozen(shell)).toBe(true);
    expect(Object.isFrozen(shell.observation)).toBe(true);
    expect(Object.isFrozen(shell.criterion)).toBe(true);
    expect(Object.isFrozen(shell.claims)).toBe(true);
    expect(Object.isFrozen(shell.narrative)).toBe(true);
    expect(Object.isFrozen(shell.boundary)).toBe(true);
  });

  it('is deterministic for identical observation provenance', () => {
    expect(createFaceInterpretationShellFE038(observation))
      .toEqual(createFaceInterpretationShellFE038({ ...observation }));
  });

  it('positive-admits only the exact locked shell shape', () => {
    const canonical = createFaceInterpretationShellFE038(observation);
    expect(admitFaceInterpretationShellFE038(canonical)).toEqual(canonical);

    const admittedCriterion = mutableClone(canonical);
    admittedCriterion.criterion.state = 'admitted';
    expect(admitFaceInterpretationShellFE038(admittedCriterion)).toBeNull();

    const injectedMethodology = mutableClone(canonical);
    injectedMethodology.criterion.methodologyPackRef = 'methodology_001';
    expect(admitFaceInterpretationShellFE038(injectedMethodology)).toBeNull();

    const injectedClaim = mutableClone(canonical);
    injectedClaim.claims = [{
      claimRef: 'claim_001',
      claimType: 'FACE_PALACE_STATUS',
      semanticKey: 'wealth',
    }];
    expect(admitFaceInterpretationShellFE038(injectedClaim)).toBeNull();

    const narrativeEnabled = mutableClone(canonical);
    narrativeEnabled.narrative.allowed = true;
    expect(admitFaceInterpretationShellFE038(narrativeEnabled)).toBeNull();

    const narrativeText = mutableClone(canonical);
    narrativeText.narrative.text = 'wealth is strong';
    expect(admitFaceInterpretationShellFE038(narrativeText)).toBeNull();

    const scoreInjected = mutableClone(canonical);
    scoreInjected.score = 99;
    expect(admitFaceInterpretationShellFE038(scoreInjected)).toBeNull();

    const llmAuthority = mutableClone(canonical);
    llmAuthority.boundary.llmSemanticAuthorityIssued = true;
    expect(admitFaceInterpretationShellFE038(llmAuthority)).toBeNull();
  });

  it('rejects free-form or malformed observation provenance', () => {
    expect(() => createFaceInterpretationShellFE038({
      ...observation,
      observationRef: 'this is not an opaque reference',
    })).toThrow('FE038_INVALID_NEUTRAL_OBSERVATION_REF');

    expect(() => createFaceInterpretationShellFE038({
      ...observation,
      metricCount: -1,
    })).toThrow('FE038_INVALID_NEUTRAL_OBSERVATION_REF');
  });
});
