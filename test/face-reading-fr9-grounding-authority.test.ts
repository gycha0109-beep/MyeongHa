import { describe, expect, it } from 'vitest';
import {
  buildResearchFaceDiagnosis,
  projectResearchFaceDiagnosisGrounding,
  type FaceResearchDiagnosisInput,
} from '../packages/face-reading/src/index.js';

function input(): FaceResearchDiagnosisInput {
  return {
    readingRef: 'reading:fr9:grounding-authority',
    engineVersion: 'face-research-engine-test-v1',
    sourceSnapshotRef: 'source-snapshot:fr9-grounding-authority',
    assertionAuthority: 'human_label_assertion',
    evidenceRefs: ['label-dataset:fr9-grounding-authority'],
    fiveOfficers: [
      {
        officerKey: 'discernment',
        criterionStates: {
          'criterion.discernment.bridge_straight': 'met',
          'criterion.discernment.tip_round_full': 'met',
        },
      },
    ],
  };
}

describe('FR-9 research grounding authority', () => {
  it('does not strip research-only state or assertion provenance during Character grounding projection', () => {
    const diagnosis = buildResearchFaceDiagnosis(input());
    const grounding = projectResearchFaceDiagnosisGrounding(diagnosis, 'face-grounding-fr9-authority-v1');

    expect(grounding.authorityState).toBe('research_only');
    expect(grounding.assertionAuthority).toBe('human_label_assertion');
    expect(grounding.evidenceRefs).toEqual(['label-dataset:fr9-grounding-authority']);
    expect(grounding.semanticSignature).toBe(diagnosis.semanticSignature);
    expect(Object.isFrozen(grounding.evidenceRefs)).toBe(true);
  });
});
