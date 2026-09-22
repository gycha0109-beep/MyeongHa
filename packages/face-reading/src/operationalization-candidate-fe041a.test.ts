import { describe, expect, it } from 'vitest';
import {
  admitFaceSourceAuthorityBundleFE039,
  type FaceSourceAuthorityBundleFE039,
} from './source-authority-fe039.js';
import {
  createFaceCriterionCandidateFE039,
} from './criterion-candidate-fe039.js';
import {
  loadCanonicalFaceMetricRegistryFE040A,
} from './metric-registry-bridge-fe040a.js';
import {
  FACE_OPERATIONALIZATION_CANDIDATE_VERSION_FE041A,
  createFaceOperationalizationCandidateFE041A,
} from './operationalization-candidate-fe041a.js';
import { createFaceInterpretationShellFE038 } from './interpretation-shell-fe038.js';

function productionBundle(): FaceSourceAuthorityBundleFE039 {
  return {
    schemaVersion: 'myeongha-face-source-authority-bundle-v1',
    bundleRef: 'fe041a.synthetic.bundle.production',
    admissionTarget: 'production_candidate',
    work: {
      workId: 'fe041a.synthetic.work.production',
      canonicalTitle: 'FE041A Synthetic Production Candidate Work',
      alternateTitles: [],
      attributedAuthors: ['Synthetic Author'],
      estimatedPeriod: 'synthetic-test-only',
      sourceClass: 'primary_manual',
    },
    witness: {
      witnessId: 'fe041a.synthetic.witness.production',
      workId: 'fe041a.synthetic.work.production',
      editionLabel: 'Synthetic Verified Edition',
      publicationYear: 2001,
      holdingInstitution: 'Synthetic Test Fixture',
      digitalSourceUrl: 'https://example.invalid/fe041a-synthetic',
      checksumSha256:
        'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      witnessStatus: 'verified',
    },
    passages: [{
      passageId: 'fe041a.synthetic.passage.production',
      witnessId: 'fe041a.synthetic.witness.production',
      volume: null,
      chapter: 'synthetic',
      printedPage: '1',
      scanPage: 1,
      originalText: 'Synthetic scan-checked passage for FE041A.',
      normalizedText: null,
      translation: null,
      verificationStatus: 'scan_checked',
    }],
    methodologyStatements: [{
      statementId: 'fe041a.synthetic.method.production',
      version: '0.0.1-test',
      methodologyKey: 'fe041a.synthetic.production-method',
      sourcePassageRefs: ['fe041a.synthetic.passage.production'],
      traditionalTerm: 'SYNTHETIC_TERM',
      semanticStatement:
        'Synthetic reviewed methodology statement for contract validation.',
      interpretationScope: 'morphology',
      reviewStatus: 'reviewed',
    }],
    lineageRelations: [],
  };
}

async function fixtures() {
  const sourceAdmission = await admitFaceSourceAuthorityBundleFE039(
    productionBundle(),
  );
  if (sourceAdmission.status !== 'admitted') {
    throw new Error('FE041A source fixture admission failed');
  }

  const criterionCandidate = createFaceCriterionCandidateFE039({
    schemaVersion: 'myeongha-face-criterion-candidate-input-v1',
    candidateRef: 'fe041a.synthetic.criterion.001',
    sourceAuthorityAdmission: sourceAdmission,
    methodologyStatementRefs: ['fe041a.synthetic.method.production'],
    traditionalTerm: 'SYNTHETIC_TERM',
  });
  if (!criterionCandidate) {
    throw new Error('FE041A criterion fixture admission failed');
  }

  const metricRegistryAdmission =
    await loadCanonicalFaceMetricRegistryFE040A();
  if (metricRegistryAdmission.status !== 'admitted') {
    throw new Error('FE041A registry fixture admission failed');
  }

  return { criterionCandidate, metricRegistryAdmission };
}

function clone<T>(value: T): any {
  return JSON.parse(JSON.stringify(value));
}

describe('FE041A operationalization candidate boundary', () => {
  it('records only a research mapping to canonical metric refs', async () => {
    const { criterionCandidate, metricRegistryAdmission } = await fixtures();
    const metricRefs = metricRegistryAdmission.metrics
      .slice(0, 2)
      .map((metric) => metric.metricRef);

    const candidate = createFaceOperationalizationCandidateFE041A({
      schemaVersion:
        'myeongha-face-operationalization-candidate-input-v1',
      operationalizationRef: 'fe041a.synthetic.operationalization.001',
      criterionCandidate,
      metricRegistryAdmission,
      inputMetricRefs: metricRefs,
      reviewStatus: 'research',
    });

    expect(FACE_OPERATIONALIZATION_CANDIDATE_VERSION_FE041A)
      .toBe('MHA-FACE-OPERATIONALIZATION-CANDIDATE-FE041A-v1');
    expect(candidate).toMatchObject({
      state: 'research_mapping_candidate',
      operationalizationRef: 'fe041a.synthetic.operationalization.001',
      criterionCandidateRef: 'fe041a.synthetic.criterion.001',
      traditionalTerm: 'SYNTHETIC_TERM',
      metricRegistryRef: metricRegistryAdmission.registryRef,
      reviewStatus: 'research',
      classificationBands: null,
      numericThresholds: null,
      calibrationRef: null,
      ruleRef: null,
      productionCriterionAdmitted: false,
      boundary: {
        researchMetricMappingRecorded: true,
        operationalizationAuthorityIssued: false,
        traditionalBindingAuthorityIssued: false,
        numericThresholdAuthorityIssued: false,
        comparisonBandAuthorityIssued: false,
        calibrationAuthorityIssued: false,
        classificationIssued: false,
        ruleAuthorityIssued: false,
        criterionAuthorityIssued: false,
        structuredClaimIssued: false,
        scoreIssued: false,
        rankingIssued: false,
        narrativeAuthorityIssued: false,
        llmSemanticAuthorityIssued: false,
        productionInterpretationAuthorityIssued: false,
      },
    });
    expect(candidate?.inputMetricRefs).toEqual(
      [...metricRefs].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('rejects unknown, duplicate, or empty metric refs', async () => {
    const { criterionCandidate, metricRegistryAdmission } = await fixtures();
    const metricRef = metricRegistryAdmission.metrics[0]!.metricRef;
    const base = {
      schemaVersion:
        'myeongha-face-operationalization-candidate-input-v1',
      operationalizationRef: 'fe041a.synthetic.operationalization.negative',
      criterionCandidate,
      metricRegistryAdmission,
      reviewStatus: 'research',
    } as const;

    expect(createFaceOperationalizationCandidateFE041A({
      ...base,
      inputMetricRefs: ['not.registered.metric'],
    })).toBeNull();
    expect(createFaceOperationalizationCandidateFE041A({
      ...base,
      inputMetricRefs: [metricRef, metricRef],
    })).toBeNull();
    expect(createFaceOperationalizationCandidateFE041A({
      ...base,
      inputMetricRefs: [],
    })).toBeNull();
  });

  it('requires an actually issued canonical registry admission', async () => {
    const { criterionCandidate, metricRegistryAdmission } = await fixtures();
    const forgedRegistry = clone(metricRegistryAdmission);

    expect(createFaceOperationalizationCandidateFE041A({
      schemaVersion:
        'myeongha-face-operationalization-candidate-input-v1',
      operationalizationRef: 'fe041a.synthetic.operationalization.forged',
      criterionCandidate,
      metricRegistryAdmission: forgedRegistry,
      inputMetricRefs: [metricRegistryAdmission.metrics[0]!.metricRef],
      reviewStatus: 'research',
    })).toBeNull();
  });

  it.each([
    ['numeric threshold', 'numericThreshold', 0.42],
    ['classification bands', 'classificationBands', [{ min: 0.4 }]],
    ['calibration ref', 'calibrationRef', 'calibration.001'],
    ['rule ref', 'ruleRef', 'rule.001'],
    ['production authorization', 'productionAuthorized', true],
    ['score', 'score', 99],
    ['claim', 'claim', { semanticKey: 'synthetic' }],
    ['narrative', 'narrative', 'Synthetic narrative'],
  ])('rejects injected %s authority', async (_label, key, injected) => {
    const { criterionCandidate, metricRegistryAdmission } = await fixtures();
    const value = {
      schemaVersion:
        'myeongha-face-operationalization-candidate-input-v1',
      operationalizationRef: 'fe041a.synthetic.operationalization.injected',
      criterionCandidate,
      metricRegistryAdmission,
      inputMetricRefs: [metricRegistryAdmission.metrics[0]!.metricRef],
      reviewStatus: 'research',
    };
    const injectedValue = clone(value);
    injectedValue[key] = injected;

    expect(
      createFaceOperationalizationCandidateFE041A(injectedValue),
    ).toBeNull();
  });

  it('does not unlock the FE038 interpretation shell', () => {
    const shell = createFaceInterpretationShellFE038({
      schemaVersion: 'myeongha-face-neutral-observation-ref-v1',
      observationRef: 'fe041a.synthetic.observation',
      sourceContractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
      sourceProjectionSchemaVersion:
        'myeongha-face-preview-one-shot-result-v1',
      metricCount: 13,
      regionCount: 4,
    });

    expect(shell.criterion.state).toBe('not_admitted');
    expect(shell.claims).toEqual([]);
    expect(shell.narrative.allowed).toBe(false);
  });
});
