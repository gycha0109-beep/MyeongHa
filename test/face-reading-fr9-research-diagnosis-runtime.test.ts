import { describe, expect, it } from 'vitest';
import {
  FaceAuthorityValidationError,
  buildResearchFaceDiagnosis,
  projectResearchFaceDiagnosisGrounding,
  type FaceResearchDiagnosisInput,
} from '../packages/face-reading/src/index.js';

function baseInput(): FaceResearchDiagnosisInput {
  return {
    readingRef: 'reading:fr9:test',
    engineVersion: 'face-research-engine-test-v1',
    sourceSnapshotRef: 'source-snapshot:fr9-test-v1',
    assertionAuthority: 'research_fixture',
    evidenceRefs: ['fixture:fr9-test-v1'],
    fiveOfficers: [
      {
        officerKey: 'discernment',
        criterionStates: {
          'criterion.discernment.bridge_straight': 'met',
          'criterion.discernment.tip_round_full': 'met',
        },
      },
      {
        officerKey: 'intake',
        criterionStates: {
          'criterion.intake.square_broad': 'not_met',
          'criterion.intake.lips_substantial': 'met',
        },
      },
    ],
  };
}

describe('FR-9 decisive research diagnosis', () => {
  it('builds a deterministic verdict, top features, and hidden tension without promoting 官成', () => {
    const output = buildResearchFaceDiagnosis(baseInput());

    expect(output.status).toBe('research_only');
    expect(output.assertionAuthority).toBe('research_fixture');
    expect(output.evidenceRefs).toEqual(['fixture:fr9-test-v1']);
    expect(output.reading.verdict.semanticKey).toBe('face.research.verdict.discernment.complete');
    expect(output.narrative.verdict).toBe(
      '審辨官이 중심을 잡는 관상입니다. 코 쪽 정적 조건이 이번 판독에서 가장 선명하게 모였습니다.',
    );
    expect(output.narrative.hiddenTension).toBe(
      '審辨官은 서고 出納官은 꺾입니다. 이번 판독의 핵심 대비는 코와 입 사이입니다.',
    );
    expect(output.narrative.topFeatures).toHaveLength(3);
    expect(output.claims.some((claim) => claim.claimType === 'FACE_TENSION_INTERPRETATION')).toBe(true);
    expect(output.claims.some((claim) => claim.semanticKey.includes('formed'))).toBe(false);
    expect(output.claims.some((claim) => claim.semanticKey.includes('bright_color'))).toBe(false);
    expect(output.reading.modules.tensions?.claimRefs).toHaveLength(1);
    expect(output.reading.modules.fiveOfficers?.comparisonPolicyGroup).toBeUndefined();
    expect(output.reading.lenses.map((lens) => lens.lensKey)).toContain('contrast');
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.evidenceRefs)).toBe(true);
  });

  it('keeps diagnosed prose free of hedging language', () => {
    const output = buildResearchFaceDiagnosis(baseInput());
    const prose = [
      output.narrative.framing,
      output.narrative.verdict,
      ...output.narrative.topFeatures.map((feature) => feature.text),
      output.narrative.hiddenTension ?? '',
    ].join('\n');

    expect(prose).not.toMatch(/가능성이|일 수도|아마|것 같습니다|추정됩니다|정확히는 알 수 없|보입니다/u);
  });

  it('does not let dynamic appearance assertions alter the static semantic signature', () => {
    const withDynamic: FaceResearchDiagnosisInput = {
      ...baseInput(),
      fiveOfficers: baseInput().fiveOfficers.map((officer) =>
        officer.officerKey === 'discernment'
          ? {
              ...officer,
              criterionStates: {
                ...officer.criterionStates,
                'criterion.discernment.bright_color': 'met',
              },
            }
          : officer,
      ),
    };

    const baseline = buildResearchFaceDiagnosis(baseInput());
    const dynamic = buildResearchFaceDiagnosis(withDynamic);

    expect(dynamic.semanticSignature).toBe(baseline.semanticSignature);
    expect(dynamic.narrative).toEqual(baseline.narrative);
  });

  it('keeps provenance/read identity out of the semantic signature while preserving provenance in output', () => {
    const first = buildResearchFaceDiagnosis(baseInput());
    const second = buildResearchFaceDiagnosis({
      ...baseInput(),
      readingRef: 'reading:fr9:other',
      sourceSnapshotRef: 'source-snapshot:other',
      assertionAuthority: 'human_label_assertion',
      evidenceRefs: ['label-dataset:other'],
    });

    expect(second.semanticSignature).toBe(first.semanticSignature);
    expect(second.narrative.verdict).toBe(first.narrative.verdict);
    expect(second.assertionAuthority).toBe('human_label_assertion');
    expect(second.evidenceRefs).toEqual(['label-dataset:other']);
  });

  it('changes semantic signature and tension when a criterion state materially changes', () => {
    const contradicted = buildResearchFaceDiagnosis(baseInput());
    const intakeComplete = buildResearchFaceDiagnosis({
      ...baseInput(),
      fiveOfficers: baseInput().fiveOfficers.map((officer) =>
        officer.officerKey === 'intake'
          ? {
              ...officer,
              criterionStates: {
                'criterion.intake.square_broad': 'met',
                'criterion.intake.lips_substantial': 'met',
              },
            }
          : officer,
      ),
    });

    expect(intakeComplete.semanticSignature).not.toBe(contradicted.semanticSignature);
    expect(intakeComplete.narrative.hiddenTension).toBeNull();
    expect(contradicted.narrative.hiddenTension).not.toBeNull();
  });
});

describe('FR-9 partial and invalid inputs', () => {
  it('returns a decisive hold verdict for an insufficient section instead of treating missing as negative evidence', () => {
    const output = buildResearchFaceDiagnosis({
      ...baseInput(),
      fiveOfficers: [
        {
          officerKey: 'discernment',
          criterionStates: {
            'criterion.discernment.bridge_straight': 'met',
          },
        },
      ],
    });

    expect(output.reading.observationState).toBe('section_limited');
    expect(output.reading.unavailableSections).toContain('five_officers.discernment.static_support');
    expect(output.narrative.verdict).toContain('오관 판결 보류');
    expect(output.claims.some((claim) => claim.pattern === 'static_support_insufficient')).toBe(true);
    expect(output.claims.some((claim) => claim.pattern === 'not_met')).toBe(false);
  });

  it('rejects duplicate officer inputs and unknown criteria', () => {
    const duplicate: FaceResearchDiagnosisInput = {
      ...baseInput(),
      fiveOfficers: [baseInput().fiveOfficers[0]!, baseInput().fiveOfficers[0]!],
    };
    expect(() => buildResearchFaceDiagnosis(duplicate)).toThrow(/Duplicate five-officer input/u);

    const unknown: FaceResearchDiagnosisInput = {
      ...baseInput(),
      fiveOfficers: [
        {
          officerKey: 'discernment',
          criterionStates: {
            'criterion.discernment.provider_magic_score': 'met',
          },
        },
      ],
    };
    expect(() => buildResearchFaceDiagnosis(unknown)).toThrow(FaceAuthorityValidationError);
  });

  it('requires explicit evidence provenance even in research mode', () => {
    expect(() => buildResearchFaceDiagnosis({ ...baseInput(), evidenceRefs: [] })).toThrow(/evidenceRefs must be non-empty/u);
  });

  it('rejects an assertion-authority value that is not part of the research contract', () => {
    const invalid = {
      ...baseInput(),
      assertionAuthority: 'production_photo_classifier',
    } as unknown as FaceResearchDiagnosisInput;
    expect(() => buildResearchFaceDiagnosis(invalid)).toThrow(/Unsupported research assertion authority/u);
  });
});

describe('FR-9 character grounding boundary', () => {
  it('projects only engine-issued semantics and deterministic narrative blocks', () => {
    const output = buildResearchFaceDiagnosis(baseInput());
    const grounding = projectResearchFaceDiagnosisGrounding(output, 'face-grounding-fr9-test-v1');

    expect(grounding.faceReadingRef).toBe(output.reading.readingRef);
    expect(grounding.semanticClaims.map((claim) => claim.claimRef)).toEqual(
      expect.arrayContaining([...output.reading.verdict.claimRefs]),
    );
    expect(grounding.approvedNarrativeBlocks?.map((block) => block.text)).toContain(output.narrative.verdict);
    expect(grounding.approvedNarrativeBlocks?.map((block) => block.text)).toContain(output.narrative.hiddenTension);
    expect(Object.isFrozen(grounding)).toBe(true);
    expect(Object.isFrozen(grounding.approvedNarrativeBlocks)).toBe(true);
  });

  it('rejects a structurally identical forged diagnosis object', () => {
    const issued = buildResearchFaceDiagnosis(baseInput());
    const forged = { ...issued };

    expect(() => projectResearchFaceDiagnosisGrounding(forged, 'face-grounding-fr9-test-v1')).toThrow(/was not issued/u);
  });
});
