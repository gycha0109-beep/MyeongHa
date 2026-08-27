import type { SourcePassage } from './contracts.js';
import type { FaceMethodologyRegistry } from './methodology.js';

export const FACE_THREE_DIVISION_PASSAGES_V0 = [
  {
    passageId: 'passage.shenxiang.face_three_divisions.boundaries',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '面三停',
    originalText: '面之三停者，自發際下至眉間為上停，自眉間下至鼻為中停，自准下人中至頦為下停。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.sancai_three_divisions.boundaries',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '三才三停論',
    originalText: '自髮際至眉為上停，眉至准頭為中停，准頭至地閣為下停。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.three_divisions.boundaries',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '永樂百問 / 二十九、三停有面有身何說？',
    originalText: '面上三停，髮際到山根為上停，為初限。准頭為中限，人中到地閣為下限，主未年。',
    verificationStatus: 'unverified_ocr',
  },
] as const satisfies readonly SourcePassage[];

export const FACE_THREE_DIVISION_METHODOLOGIES_V0: FaceMethodologyRegistry = {
  registryId: 'methodologies.face.three_divisions.research_v0',
  version: '0.1.0',
  definitions: [
    {
      methodologyId: 'method.shenxiang.face_three_divisions',
      version: '0.1.0',
      systemKey: 'three_divisions',
      sourceRefs: ['passage.shenxiang.face_three_divisions.boundaries'],
      lineageNotes: [
        'Electronic transcription only; exact NLC scan page is not yet checked.',
        'Do not silently merge this boundary wording with 三才三停論.',
      ],
      status: 'research',
      observationContract: {
        requiredConcepts: ['hairline', 'brow_line', 'nose_or_zhuntou_boundary', 'chin_or_dige_boundary'],
        optionalConcepts: ['face_midline'],
        forbiddenConcepts: ['colorAppearance'],
      },
      regionSemantics: [
        {
          regionKey: 'upper_division',
          fromConcept: 'hairline',
          toConcept: 'brow_line',
          sourceRef: 'passage.shenxiang.face_three_divisions.boundaries',
          status: 'research',
        },
        {
          regionKey: 'middle_division',
          fromConcept: 'brow_line',
          toConcept: 'nose_or_zhuntou_boundary',
          sourceRef: 'passage.shenxiang.face_three_divisions.boundaries',
          status: 'research',
        },
        {
          regionKey: 'lower_division',
          fromConcept: 'nose_or_zhuntou_boundary',
          toConcept: 'chin_or_dige_boundary',
          sourceRef: 'passage.shenxiang.face_three_divisions.boundaries',
          status: 'research',
        },
      ],
      interpretationNotes: ['Classification bands are not authorized yet.'],
    },
    {
      methodologyId: 'method.shenxiang.sancai_three_divisions',
      version: '0.1.0',
      systemKey: 'three_divisions',
      sourceRefs: ['passage.shenxiang.sancai_three_divisions.boundaries'],
      lineageNotes: [
        'Same work/tradition as 面三停; preserve as a distinct methodological statement until source review resolves equivalence.',
      ],
      status: 'research',
      observationContract: {
        requiredConcepts: ['hairline', 'brow_line', 'zhuntou', 'dige'],
        optionalConcepts: ['face_midline'],
        forbiddenConcepts: ['colorAppearance'],
      },
      regionSemantics: [
        {
          regionKey: 'upper_division',
          fromConcept: 'hairline',
          toConcept: 'brow_line',
          sourceRef: 'passage.shenxiang.sancai_three_divisions.boundaries',
          status: 'research',
        },
        {
          regionKey: 'middle_division',
          fromConcept: 'brow_line',
          toConcept: 'zhuntou',
          sourceRef: 'passage.shenxiang.sancai_three_divisions.boundaries',
          status: 'research',
        },
        {
          regionKey: 'lower_division',
          fromConcept: 'zhuntou',
          toConcept: 'dige',
          sourceRef: 'passage.shenxiang.sancai_three_divisions.boundaries',
          status: 'research',
        },
      ],
      interpretationNotes: ['No pixel/landmark threshold or equal-balance tolerance is authorized yet.'],
    },
    {
      methodologyId: 'method.liuzhuang.three_divisions',
      version: '0.1.0',
      systemKey: 'three_divisions',
      sourceRefs: ['passage.liuzhuang.three_divisions.boundaries'],
      lineageNotes: [
        'Boundary wording differs materially from the Shenxiang 面三停 / 三才三停 statements.',
        'Do not place this method in the same production methodology pack without an explicit composition policy.',
      ],
      status: 'research',
      observationContract: {
        requiredConcepts: ['hairline', 'shangen', 'zhuntou', 'renzhong', 'dige'],
        optionalConcepts: ['face_midline'],
        forbiddenConcepts: ['colorAppearance'],
      },
      regionSemantics: [
        {
          regionKey: 'upper_limit_statement',
          fromConcept: 'hairline',
          toConcept: 'shangen',
          sourceRef: 'passage.liuzhuang.three_divisions.boundaries',
          status: 'research',
        },
        {
          regionKey: 'lower_limit_statement',
          fromConcept: 'renzhong',
          toConcept: 'dige',
          sourceRef: 'passage.liuzhuang.three_divisions.boundaries',
          status: 'research',
        },
      ],
      interpretationNotes: [
        'The electronic wording does not provide a clean modern three-segment metric formula; keep non-executable until scan review and textual interpretation are complete.',
      ],
    },
  ],
};
