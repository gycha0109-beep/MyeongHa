import { describe, expect, it } from 'vitest';
import {
  admitFaceSourceAuthorityBundleFE039,
  type FaceSourceAuthorityBundleFE039,
} from './source-authority-fe039.js';
import {
  FACE_CRITERION_CANDIDATE_VERSION_FE039,
  admitFaceCriterionCandidateFE039,
  createFaceCriterionCandidateFE039,
} from './criterion-candidate-fe039.js';
import { createFaceInterpretationShellFE038 } from './interpretation-shell-fe038.js';

function productionBundle(): FaceSourceAuthorityBundleFE039 {
  return {
    schemaVersion: 'myeongha-face-source-authority-bundle-v1',
    bundleRef: 'fe039.synthetic.bundle.production',
    admissionTarget: 'production_candidate',
    work: {
      workId: 'fe039.synthetic.work.production',
      canonicalTitle: 'FE039 Synthetic Production Candidate Work',
      alternateTitles: [],
      attributedAuthors: ['Synthetic Author'],
      estimatedPeriod: 'synthetic-test-only',
      sourceClass: 'primary_manual',
    },
    witness: {
      witnessId: 'fe039.synthetic.witness.production',
      workId: 'fe039.synthetic.work.production',
      editionLabel: 'Synthetic Verified Edition',
      publicationYear: 2001,
      holdingInstitution: 'Synthetic Test Fixture',
      digitalSourceUrl: 'https://example.invalid/verified-synthetic',
      checksumSha256:
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      witnessStatus: 'verified',
    },
    passages: [{
      passageId: 'fe039.synthetic.passage.production',
      witnessId: 'fe039.synthetic.witness.production',
      volume: null,
      chapter: 'synthetic',
      printedPage: '1',
      scanPage: 1,
      originalText: 'Synthetic scan-checked passage.',
      normalizedText: null,
      translation: null,
      verificationStatus: 'double_checked',
    }],
    methodologyStatements: [{
      statementId: 'fe039.synthetic.method.production',
      version: '0.0.1-test',
      methodologyKey: 'fe039.synthetic.production-method',
      sourcePassageRefs: ['fe039.synthetic.passage.production'],
      traditionalTerm: 'SYNTHETIC_TERM',
      semanticStatement: 'Synthetic reviewed methodology statement.',
      interpretationScope: 'local_feature',
      reviewStatus: 'reviewed',
    }],
    lineageRelations: [],
  };
}

function clone<T>(value: T): any {
  return JSON.parse(JSON.stringify(value));
}

describe('FE039 criterion candidate boundary', () => {
  it('creates only a source-supported, non-operationalized criterion candidate', async () => {
    const admission = await admitFaceSourceAuthorityBundleFE039(
      productionBundle(),
    );
    expect(admission.status).toBe('admitted');
    if (admission.status !== 'admitted') throw new Error('fixture admission');

    const candidate = createFaceCriterionCandidateFE039({
      schemaVersion: 'myeongha-face-criterion-candidate-input-v1',
      candidateRef: 'fe039.synthetic.criterion.001',
      sourceAuthorityAdmission: admission,
      methodologyStatementRefs: ['fe039.synthetic.method.production'],
      traditionalTerm: 'SYNTHETIC_TERM',
    });

    expect(FACE_CRITERION_CANDIDATE_VERSION_FE039)
      .toBe('MHA-FACE-CRITERION-CANDIDATE-FE039-v1');
    expect(candidate).toMatchObject({
      candidateRef: 'fe039.synthetic.criterion.001',
      admissionState: 'source_supported_not_operationalized',
      operationalizationRef: null,
      ruleRef: null,
      productionCriterionAdmitted: false,
      boundary: {
        numericThresholdDefined: false,
        comparisonBandDefined: false,
        classificationIssued: false,
        scoreIssued: false,
        rankingIssued: false,
        structuredClaimIssued: false,
        traditionalInterpretationIssued: false,
        narrativeAuthorityIssued: false,
        llmSemanticAuthorityIssued: false,
        productionAuthorityIssued: false,
      },
    });
    expect(candidate && admitFaceCriterionCandidateFE039(candidate))
      .toEqual(candidate);
  });

  it('rejects research-only source authority as criterion candidate input', async () => {
    const bundle = productionBundle();
    const researchAdmission = await admitFaceSourceAuthorityBundleFE039({
      ...bundle,
      admissionTarget: 'research',
    });
    expect(researchAdmission.status).toBe('admitted');
    if (researchAdmission.status !== 'admitted') {
      throw new Error('fixture admission');
    }

    expect(createFaceCriterionCandidateFE039({
      schemaVersion: 'myeongha-face-criterion-candidate-input-v1',
      candidateRef: 'fe039.synthetic.criterion.research',
      sourceAuthorityAdmission: researchAdmission,
      methodologyStatementRefs: ['fe039.synthetic.method.production'],
      traditionalTerm: 'SYNTHETIC_TERM',
    })).toBeNull();
  });

  it('rejects methodology refs not admitted by source authority', async () => {
    const admission = await admitFaceSourceAuthorityBundleFE039(
      productionBundle(),
    );
    if (admission.status !== 'admitted') throw new Error('fixture admission');

    expect(createFaceCriterionCandidateFE039({
      schemaVersion: 'myeongha-face-criterion-candidate-input-v1',
      candidateRef: 'fe039.synthetic.criterion.missing',
      sourceAuthorityAdmission: admission,
      methodologyStatementRefs: ['missing.methodology'],
      traditionalTerm: 'SYNTHETIC_TERM',
    })).toBeNull();
  });

  it.each([
    ['operationalization', 'operationalizationRef', 'op.001'],
    ['rule', 'ruleRef', 'rule.001'],
    ['production admission', 'productionCriterionAdmitted', true],
    ['score', 'score', 100],
    ['claim', 'claim', { semanticKey: 'wealth' }],
    ['narrative', 'narrative', 'Synthetic narrative'],
  ])('rejects injected %s on admitted candidate', async (_label, key, injected) => {
    const admission = await admitFaceSourceAuthorityBundleFE039(
      productionBundle(),
    );
    if (admission.status !== 'admitted') throw new Error('fixture admission');
    const candidate = createFaceCriterionCandidateFE039({
      schemaVersion: 'myeongha-face-criterion-candidate-input-v1',
      candidateRef: 'fe039.synthetic.criterion.negative',
      sourceAuthorityAdmission: admission,
      methodologyStatementRefs: ['fe039.synthetic.method.production'],
      traditionalTerm: 'SYNTHETIC_TERM',
    });
    if (!candidate) throw new Error('fixture candidate');

    const injectedCandidate = clone(candidate);
    injectedCandidate[key] = injected;
    expect(admitFaceCriterionCandidateFE039(injectedCandidate)).toBeNull();
  });

  it('does not unlock the FE038 interpretation shell', () => {
    const shell = createFaceInterpretationShellFE038({
      schemaVersion: 'myeongha-face-neutral-observation-ref-v1',
      observationRef: 'fe039.synthetic.observation',
      sourceContractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
      sourceProjectionSchemaVersion:
        'myeongha-face-preview-one-shot-result-v1',
      metricCount: 12,
      regionCount: 4,
    });

    expect(shell.criterion.state).toBe('not_admitted');
    expect(shell.claims).toEqual([]);
    expect(shell.narrative.allowed).toBe(false);
  });
});
