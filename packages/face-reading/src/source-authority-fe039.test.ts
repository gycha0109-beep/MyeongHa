import { describe, expect, it } from 'vitest';
import {
  FACE_SOURCE_AUTHORITY_VERSION_FE039,
  admitFaceSourceAuthorityBundleFE039,
  type FaceSourceAuthorityBundleFE039,
} from './source-authority-fe039.js';

function syntheticBundle(
  overrides: Partial<FaceSourceAuthorityBundleFE039> = {},
): FaceSourceAuthorityBundleFE039 {
  return {
    schemaVersion: 'myeongha-face-source-authority-bundle-v1',
    bundleRef: 'fe039.synthetic.bundle.001',
    admissionTarget: 'research',
    work: {
      workId: 'fe039.synthetic.work.001',
      canonicalTitle: 'FE039 Synthetic Test Work',
      alternateTitles: ['Synthetic Alternate B', 'Synthetic Alternate A'],
      attributedAuthors: ['Synthetic Author B', 'Synthetic Author A'],
      estimatedPeriod: 'synthetic-test-only',
      sourceClass: 'primary_manual',
    },
    witness: {
      witnessId: 'fe039.synthetic.witness.001',
      workId: 'fe039.synthetic.work.001',
      editionLabel: 'Synthetic Test Edition',
      publicationYear: 2000,
      holdingInstitution: 'Synthetic Test Fixture',
      digitalSourceUrl: 'https://example.invalid/fe039-synthetic',
      checksumSha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      witnessStatus: 'candidate',
    },
    passages: [{
      passageId: 'fe039.synthetic.passage.001',
      witnessId: 'fe039.synthetic.witness.001',
      volume: 'synthetic-volume',
      chapter: 'synthetic-chapter',
      printedPage: '1',
      scanPage: 1,
      originalText: 'Synthetic source passage for contract validation only.',
      normalizedText: 'Synthetic normalized passage.',
      translation: 'Synthetic translation.',
      verificationStatus: 'unverified_ocr',
    }],
    methodologyStatements: [{
      statementId: 'fe039.synthetic.method.001',
      version: '0.0.1-test',
      methodologyKey: 'fe039.synthetic.methodology',
      sourcePassageRefs: ['fe039.synthetic.passage.001'],
      traditionalTerm: 'SYNTHETIC_TERM',
      semanticStatement:
        'Synthetic methodology statement with no traditional authority.',
      interpretationScope: 'morphology',
      reviewStatus: 'research',
    }],
    lineageRelations: [{
      fromWorkId: 'fe039.synthetic.work.001',
      toWorkId: 'fe039.synthetic.related-work.001',
      relation: 'independent_uncertain',
      evidenceRefs: ['fe039.synthetic.passage.001'],
      confidence: 'low',
    }],
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('FE039 source authority admission', () => {
  it('admits unverified OCR only as research authority', async () => {
    const result = await admitFaceSourceAuthorityBundleFE039(
      syntheticBundle(),
    );

    expect(FACE_SOURCE_AUTHORITY_VERSION_FE039)
      .toBe('MHA-FACE-SOURCE-AUTHORITY-FE039-v1');
    expect(result).toMatchObject({
      status: 'admitted',
      state: 'research_admitted',
      bundleRef: 'fe039.synthetic.bundle.001',
      workRef: 'fe039.synthetic.work.001',
      witnessRef: 'fe039.synthetic.witness.001',
      passageRefs: ['fe039.synthetic.passage.001'],
      methodologyStatementRefs: ['fe039.synthetic.method.001'],
      boundary: {
        sourceAuthorityAdmitted: true,
        operationalizationAuthorityIssued: false,
        ruleAuthorityIssued: false,
        criterionAuthorityIssued: false,
        structuredClaimIssued: false,
        narrativeAuthorityIssued: false,
        classificationIssued: false,
        scoreIssued: false,
        rankingIssued: false,
        productionAuthorityIssued: false,
      },
    });
    if (result.status === 'admitted') {
      expect(result.authorityBundleSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('admits production candidate only with verified witness, checked passage, and reviewed methodology', async () => {
    const bundle = syntheticBundle({
      admissionTarget: 'production_candidate',
      witness: {
        ...syntheticBundle().witness,
        witnessStatus: 'verified',
      },
      passages: [{
        ...syntheticBundle().passages[0]!,
        verificationStatus: 'scan_checked',
      }],
      methodologyStatements: [{
        ...syntheticBundle().methodologyStatements[0]!,
        reviewStatus: 'reviewed',
      }],
    });

    await expect(admitFaceSourceAuthorityBundleFE039(bundle))
      .resolves.toMatchObject({
        status: 'admitted',
        state: 'production_candidate',
      });
  });

  it('keeps authority hash deterministic across non-semantic list ordering', async () => {
    const first = await admitFaceSourceAuthorityBundleFE039(
      syntheticBundle(),
    );
    const reordered = syntheticBundle({
      work: {
        ...syntheticBundle().work,
        alternateTitles: ['Synthetic Alternate A', 'Synthetic Alternate B'],
        attributedAuthors: ['Synthetic Author A', 'Synthetic Author B'],
      },
    });
    const second = await admitFaceSourceAuthorityBundleFE039(reordered);

    expect(first.status).toBe('admitted');
    expect(second.status).toBe('admitted');
    if (first.status === 'admitted' && second.status === 'admitted') {
      expect(second.authorityBundleSha256)
        .toBe(first.authorityBundleSha256);
    }
  });

  it('rejects broken provenance, deprecated witness, and insufficient production evidence', async () => {
    await expect(admitFaceSourceAuthorityBundleFE039(
      syntheticBundle({
        witness: {
          ...syntheticBundle().witness,
          workId: 'different.work',
        },
      }),
    )).resolves.toMatchObject({
      status: 'rejected',
      reason: 'broken_provenance',
    });

    await expect(admitFaceSourceAuthorityBundleFE039(
      syntheticBundle({
        witness: {
          ...syntheticBundle().witness,
          witnessStatus: 'deprecated',
        },
      }),
    )).resolves.toMatchObject({
      status: 'rejected',
      reason: 'deprecated_witness',
    });

    await expect(admitFaceSourceAuthorityBundleFE039(
      syntheticBundle({ admissionTarget: 'production_candidate' }),
    )).resolves.toMatchObject({
      status: 'rejected',
      reason: 'production_evidence_insufficient',
    });
  });

  it('rejects duplicate or missing passage references', async () => {
    const duplicate = syntheticBundle({
      passages: [
        syntheticBundle().passages[0]!,
        syntheticBundle().passages[0]!,
      ],
    });
    await expect(admitFaceSourceAuthorityBundleFE039(duplicate))
      .resolves.toMatchObject({
        status: 'rejected',
        reason: 'duplicate_reference',
      });

    const missing = syntheticBundle({
      methodologyStatements: [{
        ...syntheticBundle().methodologyStatements[0]!,
        sourcePassageRefs: ['missing.passage'],
      }],
    });
    await expect(admitFaceSourceAuthorityBundleFE039(missing))
      .resolves.toMatchObject({
        status: 'rejected',
        reason: 'broken_provenance',
      });
  });

  it.each([
    ['numeric threshold', 'numericThreshold', 0.42],
    ['classification band', 'classificationBand', 'wide'],
    ['rule ref', 'ruleRef', 'rule.001'],
    ['claim', 'claim', { semanticKey: 'wealth' }],
    ['narrative', 'narrative', 'Synthetic narrative'],
    ['score', 'score', 99],
    ['source strength', 'sourceStrength', 'strong'],
  ])('rejects arbitrary %s authority injection', async (_label, key, injected) => {
    const value = clone(syntheticBundle()) as Record<string, unknown>;
    value[key] = injected;

    await expect(admitFaceSourceAuthorityBundleFE039(value))
      .resolves.toMatchObject({
        status: 'rejected',
        reason: 'invalid_shape',
      });
  });
});
