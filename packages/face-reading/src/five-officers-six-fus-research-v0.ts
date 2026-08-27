import type {
  FaceAuthorityRegistry,
  FaceClaim,
  FaceMethodologyDefinition,
  FaceMethodologyPackDefinition,
  FaceRegionMapDefinition,
  SourcePassage,
} from './contracts.js';
import {
  FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
  FACE_COMPARISON_POLICY_V0,
  FACE_METHOD_REFS_V0,
} from './research-pack-v0.js';
import { FaceAuthorityValidationError } from './validation.js';

export type FiveOfficerKey =
  | 'listening'
  | 'longevity'
  | 'inspection'
  | 'discernment'
  | 'intake';

export type FiveOfficerCriterionModality =
  | 'static_geometry'
  | 'multi_view_static'
  | 'capture_sensitive'
  | 'dynamic_appearance';

export type FiveOfficerCriterionState = 'met' | 'not_met' | 'unavailable' | 'not_evaluated';

export type FiveOfficerStaticSupportState = 'complete' | 'contradicted' | 'insufficient';

export interface FiveOfficerCriterionDefinition {
  readonly criterionId: string;
  readonly officerKey: FiveOfficerKey;
  readonly traditionalOfficerName: string;
  readonly anatomicalTarget: 'ear' | 'brow' | 'eye' | 'nose' | 'mouth';
  readonly sourceRefs: readonly string[];
  readonly sourceConcept: string;
  readonly modality: FiveOfficerCriterionModality;
  readonly requiredForTraditionalFormation: boolean;
  readonly staticV1Eligible: boolean;
  readonly operationalizationNote: string;
}

export interface FiveOfficerDefinition {
  readonly officerKey: FiveOfficerKey;
  readonly traditionalOfficerName: string;
  readonly anatomicalTarget: 'ear' | 'brow' | 'eye' | 'nose' | 'mouth';
  readonly sourceRefs: readonly string[];
  readonly criterionIds: readonly string[];
}

export interface FiveOfficerAssessmentInput {
  readonly officerKey: FiveOfficerKey;
  readonly criterionStates: Readonly<Record<string, FiveOfficerCriterionState>>;
}

export interface FiveOfficerAssessment {
  readonly officerKey: FiveOfficerKey;
  readonly traditionalOfficerName: string;
  readonly staticSupportState: FiveOfficerStaticSupportState;
  readonly metStaticCriterionIds: readonly string[];
  readonly failedStaticCriterionIds: readonly string[];
  readonly unavailableStaticCriterionIds: readonly string[];
  readonly blockedTraditionalFormationCriterionIds: readonly string[];
  readonly traditionalFormationState: 'not_authorized';
  readonly traditionalFormationReason: string;
}

export const FACE_FR3_METHOD_REFS_V0 = Object.freeze({
  shenxiangFiveOfficers: 'method.shenxiang.five_officers@0.1.0',
  liuzhuangFiveOfficers: 'method.liuzhuang.five_officers@0.1.0',
  shenxiangSixFus: 'method.shenxiang.six_fus@0.1.0',
  liuzhuangSixFus: 'method.liuzhuang.six_fus@0.1.0',
});

export const FACE_FR3_PASSAGES_V0 = [
  {
    passageId: 'passage.shenxiang.five_officers.mapping',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '五官說',
    originalText: '五官者，一曰耳為採聽官；二曰眉為保壽官；三曰眼為監察官；四曰鼻為審辨官；五曰口為出納官。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.five_officers.listening',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '採聽官',
    originalText: '耳須要色鮮，高聳於眉，輪廓完成，貼肉敦厚，風門寬大，謂之採聽官成。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.five_officers.longevity',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '保壽官',
    originalText: '眉須要寬廣清長，雙分入鬢，首尾豐盈，高居額中，乃為保壽官成。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.five_officers.inspection',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '監察官',
    originalText: '眼須要含藏不露，黑白分明，瞳子端定，光彩射人，乃為監察官成。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.five_officers.discernment',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '審辨官',
    originalText: '鼻須要梁柱端直，印堂平闊，山根連印，年壽高隆，準圓庫起，色鮮黃明，乃為審辨官成。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.five_officers.intake',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '出納官',
    originalText: '口須要方大，唇紅端厚，角弓，開大合小，乃為出納官成。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.six_fus.mapping',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '六取五官六府',
    originalText: '天庭日月二角為天府；兩顴為人府；地角邊腮為末景地府。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.five_officers.mapping',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '五行貴賤難逃生克之中',
    originalText: '五官：眉為保壽官，眼為監察官，鼻為審判官，耳為採聽官，口為出納官。',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.six_fus.mapping',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '五行貴賤難逃生克之中',
    originalText: '六府：天倉為上二府，顴骨為中二府，地庫為下二府。',
    verificationStatus: 'unverified_ocr',
  },
] as const satisfies readonly SourcePassage[];

export const FACE_FR3_METHODOLOGIES_V0 = [
  {
    methodologyId: 'method.shenxiang.five_officers',
    version: '0.1.0',
    traditionalTerm: '五官',
    scope: 'static_face',
    sourceRefs: [
      'passage.shenxiang.five_officers.mapping',
      'passage.shenxiang.five_officers.listening',
      'passage.shenxiang.five_officers.longevity',
      'passage.shenxiang.five_officers.inspection',
      'passage.shenxiang.five_officers.discernment',
      'passage.shenxiang.five_officers.intake',
    ],
    description: '神相全編의 五官 명칭과 官成 조건을 관측 조건 집합으로 보존한다.',
    limitations: [
      '현재 passage는 전자본문이며 scan_checked 전이다.',
      '官成 조건에는 색·광채·개폐처럼 정적 구조만으로 확정할 수 없는 항목이 포함된다.',
      '정적 v1은 官成 자체가 아니라 static support만 생성한다.',
    ],
    reviewStatus: 'research',
  },
  {
    methodologyId: 'method.liuzhuang.five_officers',
    version: '0.1.0',
    traditionalTerm: '五官',
    scope: 'static_face',
    sourceRefs: ['passage.liuzhuang.five_officers.mapping'],
    description: '柳莊相法의 五官 명칭 대응을 별도 전승으로 보존한다.',
    limitations: ['鼻 관명은 전자본문에서 審判官으로 나타나며 審辨官과의 판본 관계는 미해결이다.'],
    reviewStatus: 'research',
  },
  {
    methodologyId: 'method.shenxiang.six_fus',
    version: '0.1.0',
    traditionalTerm: '六府',
    scope: 'static_face',
    sourceRefs: ['passage.shenxiang.six_fus.mapping'],
    description: '神相全編의 天府·人府·地府 삼쌍 구조를 보존한다.',
    limitations: ['현대 landmark 좌표로의 세부 경계 operationalization은 아직 없다.'],
    reviewStatus: 'research',
  },
  {
    methodologyId: 'method.liuzhuang.six_fus',
    version: '0.1.0',
    traditionalTerm: '六府',
    scope: 'static_face',
    sourceRefs: ['passage.liuzhuang.six_fus.mapping'],
    description: '柳莊相法의 上二府·中二府·下二府 위치 체계를 별도 보존한다.',
    limitations: ['神相全編의 天府/地府 좌표와 동일하다고 가정하지 않는다.'],
    reviewStatus: 'research',
  },
] as const satisfies readonly FaceMethodologyDefinition[];

export const FACE_FR3_SIX_FU_REGION_MAPS_V0 = [
  {
    regionMapId: 'regionmap.shenxiang.six_fus',
    version: '0.1.0',
    methodologyRef: FACE_FR3_METHOD_REFS_V0.shenxiangSixFus,
    sourceRefs: ['passage.shenxiang.six_fus.mapping'],
    coordinateFrame: 'normalized_face_landmark_frame',
    regions: [
      {
        regionKey: 'upper_pair',
        label: '天府',
        geometryDefinition: { kind: 'traditional_region_pair', concepts: ['tianting', 'sun_horn', 'moon_horn'] },
        sourceRefs: ['passage.shenxiang.six_fus.mapping'],
      },
      {
        regionKey: 'middle_pair',
        label: '人府',
        geometryDefinition: { kind: 'traditional_region_pair', concepts: ['left_cheekbone', 'right_cheekbone'] },
        sourceRefs: ['passage.shenxiang.six_fus.mapping'],
      },
      {
        regionKey: 'lower_pair',
        label: '地府',
        geometryDefinition: { kind: 'traditional_region_pair', concepts: ['dige', 'left_jaw_side', 'right_jaw_side'] },
        sourceRefs: ['passage.shenxiang.six_fus.mapping'],
      },
    ],
    mappingStatus: 'research',
  },
  {
    regionMapId: 'regionmap.liuzhuang.six_fus',
    version: '0.1.0',
    methodologyRef: FACE_FR3_METHOD_REFS_V0.liuzhuangSixFus,
    sourceRefs: ['passage.liuzhuang.six_fus.mapping'],
    coordinateFrame: 'normalized_face_landmark_frame',
    regions: [
      {
        regionKey: 'upper_pair',
        label: '上二府',
        geometryDefinition: { kind: 'traditional_region_pair', concepts: ['left_tiancang', 'right_tiancang'] },
        sourceRefs: ['passage.liuzhuang.six_fus.mapping'],
      },
      {
        regionKey: 'middle_pair',
        label: '中二府',
        geometryDefinition: { kind: 'traditional_region_pair', concepts: ['left_cheekbone', 'right_cheekbone'] },
        sourceRefs: ['passage.liuzhuang.six_fus.mapping'],
      },
      {
        regionKey: 'lower_pair',
        label: '下二府',
        geometryDefinition: { kind: 'traditional_region_pair', concepts: ['left_diku', 'right_diku'] },
        sourceRefs: ['passage.liuzhuang.six_fus.mapping'],
      },
    ],
    mappingStatus: 'research',
  },
] as const satisfies readonly FaceRegionMapDefinition[];

export const FACE_FR3_CONFLICTS_V0 = [
  {
    conflictId: 'conflict.six_fus.region_mapping_v0',
    methodologyRefs: [FACE_FR3_METHOD_REFS_V0.shenxiangSixFus, FACE_FR3_METHOD_REFS_V0.liuzhuangSixFus],
    sourceRefs: ['passage.shenxiang.six_fus.mapping', 'passage.liuzhuang.six_fus.mapping'],
    affectedTiers: ['F2', 'F3', 'F7'],
    status: 'open',
    reason: '神相全編은 天庭日月二角/兩顴/地角邊腮를, 柳莊相法은 天倉/顴骨/地庫를 六府의 상·중·하쌍으로 제시한다. 하나의 공용 좌표로 합칠 authority가 없다.',
  },
  {
    conflictId: 'conflict.five_officers.nose_title_variant_v0',
    methodologyRefs: [FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers, FACE_FR3_METHOD_REFS_V0.liuzhuangFiveOfficers],
    sourceRefs: ['passage.shenxiang.five_officers.mapping', 'passage.liuzhuang.five_officers.mapping'],
    affectedTiers: ['F2', 'F3'],
    status: 'open',
    reason: '神相全編 전자본문은 審辨官, 柳莊相法 전자본문은 審判官으로 표기한다. scan 대조 전에는 동일 표기의 단순 OCR 변형으로 처리하지 않는다.',
  },
] as const;

export const FIVE_OFFICER_DEFINITIONS_V0: readonly FiveOfficerDefinition[] = [
  {
    officerKey: 'listening',
    traditionalOfficerName: '採聽官',
    anatomicalTarget: 'ear',
    sourceRefs: ['passage.shenxiang.five_officers.mapping', 'passage.shenxiang.five_officers.listening'],
    criterionIds: [
      'criterion.listening.outline_complete',
      'criterion.listening.high_relative_to_brow',
      'criterion.listening.close_and_substantial',
      'criterion.listening.ear_gate_wide',
      'criterion.listening.fresh_color',
    ],
  },
  {
    officerKey: 'longevity',
    traditionalOfficerName: '保壽官',
    anatomicalTarget: 'brow',
    sourceRefs: ['passage.shenxiang.five_officers.mapping', 'passage.shenxiang.five_officers.longevity'],
    criterionIds: [
      'criterion.longevity.broad_long',
      'criterion.longevity.extends_to_temple',
      'criterion.longevity.head_tail_full',
      'criterion.longevity.high_forehead_position',
    ],
  },
  {
    officerKey: 'inspection',
    traditionalOfficerName: '監察官',
    anatomicalTarget: 'eye',
    sourceRefs: ['passage.shenxiang.five_officers.mapping', 'passage.shenxiang.five_officers.inspection'],
    criterionIds: [
      'criterion.inspection.contained_not_exposed',
      'criterion.inspection.pupil_stable_center',
      'criterion.inspection.black_white_distinct',
      'criterion.inspection.radiant_appearance',
    ],
  },
  {
    officerKey: 'discernment',
    traditionalOfficerName: '審辨官',
    anatomicalTarget: 'nose',
    sourceRefs: ['passage.shenxiang.five_officers.mapping', 'passage.shenxiang.five_officers.discernment'],
    criterionIds: [
      'criterion.discernment.bridge_straight',
      'criterion.discernment.yintang_root_continuity',
      'criterion.discernment.bridge_prominent',
      'criterion.discernment.tip_round_full',
      'criterion.discernment.bright_color',
    ],
  },
  {
    officerKey: 'intake',
    traditionalOfficerName: '出納官',
    anatomicalTarget: 'mouth',
    sourceRefs: ['passage.shenxiang.five_officers.mapping', 'passage.shenxiang.five_officers.intake'],
    criterionIds: [
      'criterion.intake.square_broad',
      'criterion.intake.lips_substantial',
      'criterion.intake.corners_arched',
      'criterion.intake.open_close_relation',
      'criterion.intake.red_lip_color',
    ],
  },
];

export const FIVE_OFFICER_CRITERIA_V0: readonly FiveOfficerCriterionDefinition[] = [
  {
    criterionId: 'criterion.listening.outline_complete', officerKey: 'listening', traditionalOfficerName: '採聽官', anatomicalTarget: 'ear',
    sourceRefs: ['passage.shenxiang.five_officers.listening'], sourceConcept: '輪廓完成', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: true, operationalizationNote: '윤곽 완전성의 machine threshold는 아직 calibration 전이며 research observation만 허용한다.',
  },
  {
    criterionId: 'criterion.listening.high_relative_to_brow', officerKey: 'listening', traditionalOfficerName: '採聽官', anatomicalTarget: 'ear',
    sourceRefs: ['passage.shenxiang.five_officers.listening'], sourceConcept: '高聳於眉', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: true, operationalizationNote: '귀 상단과 brow line의 상대 위치는 기하 관측 후보이나 전통 寸 단위 환산은 하지 않는다.',
  },
  {
    criterionId: 'criterion.listening.close_and_substantial', officerKey: 'listening', traditionalOfficerName: '採聽官', anatomicalTarget: 'ear',
    sourceRefs: ['passage.shenxiang.five_officers.listening'], sourceConcept: '貼肉敦厚', modality: 'multi_view_static', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: 'frontal single-view만으로 두께/두부 밀착을 확정하지 않는다.',
  },
  {
    criterionId: 'criterion.listening.ear_gate_wide', officerKey: 'listening', traditionalOfficerName: '採聽官', anatomicalTarget: 'ear',
    sourceRefs: ['passage.shenxiang.five_officers.listening'], sourceConcept: '風門寬大', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '귀구멍/風門의 경계와 촬영각 민감도를 먼저 정의해야 한다.',
  },
  {
    criterionId: 'criterion.listening.fresh_color', officerKey: 'listening', traditionalOfficerName: '採聽官', anatomicalTarget: 'ear',
    sourceRefs: ['passage.shenxiang.five_officers.listening'], sourceConcept: '色鮮', modality: 'dynamic_appearance', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: 'static v1의 colorAppearance 금지 경계에 의해 자동판정하지 않는다.',
  },
  {
    criterionId: 'criterion.longevity.broad_long', officerKey: 'longevity', traditionalOfficerName: '保壽官', anatomicalTarget: 'brow',
    sourceRefs: ['passage.shenxiang.five_officers.longevity'], sourceConcept: '寬廣清長', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: true, operationalizationNote: '寬/長의 수치 threshold는 source가 제공하지 않으므로 별도 calibration 전에는 research classification만 허용한다.',
  },
  {
    criterionId: 'criterion.longevity.extends_to_temple', officerKey: 'longevity', traditionalOfficerName: '保壽官', anatomicalTarget: 'brow',
    sourceRefs: ['passage.shenxiang.five_officers.longevity'], sourceConcept: '雙分入鬢', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: true, operationalizationNote: 'brow tail과 temple zone의 상대 위치 후보.',
  },
  {
    criterionId: 'criterion.longevity.head_tail_full', officerKey: 'longevity', traditionalOfficerName: '保壽官', anatomicalTarget: 'brow',
    sourceRefs: ['passage.shenxiang.five_officers.longevity'], sourceConcept: '首尾豐盈', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '豐盈의 기하 정의와 모량/화장 confound를 분리해야 한다.',
  },
  {
    criterionId: 'criterion.longevity.high_forehead_position', officerKey: 'longevity', traditionalOfficerName: '保壽官', anatomicalTarget: 'brow',
    sourceRefs: ['passage.shenxiang.five_officers.longevity'], sourceConcept: '高居額中', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: true, operationalizationNote: 'forehead frame 내 상대 위치 후보.',
  },
  {
    criterionId: 'criterion.inspection.contained_not_exposed', officerKey: 'inspection', traditionalOfficerName: '監察官', anatomicalTarget: 'eye',
    sourceRefs: ['passage.shenxiang.five_officers.inspection'], sourceConcept: '含藏不露', modality: 'capture_sensitive', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '표정/시선 방향에 민감하므로 neutral-gaze capture contract가 필요하다.',
  },
  {
    criterionId: 'criterion.inspection.pupil_stable_center', officerKey: 'inspection', traditionalOfficerName: '監察官', anatomicalTarget: 'eye',
    sourceRefs: ['passage.shenxiang.five_officers.inspection'], sourceConcept: '瞳子端定', modality: 'capture_sensitive', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '시선 방향과 촬영 유도에 의존하므로 morphology로 고정하지 않는다.',
  },
  {
    criterionId: 'criterion.inspection.black_white_distinct', officerKey: 'inspection', traditionalOfficerName: '監察官', anatomicalTarget: 'eye',
    sourceRefs: ['passage.shenxiang.five_officers.inspection'], sourceConcept: '黑白分明', modality: 'capture_sensitive', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '노출·화이트밸런스·홍채/공막 segmentation 영향을 받는다.',
  },
  {
    criterionId: 'criterion.inspection.radiant_appearance', officerKey: 'inspection', traditionalOfficerName: '監察官', anatomicalTarget: 'eye',
    sourceRefs: ['passage.shenxiang.five_officers.inspection'], sourceConcept: '光彩射人', modality: 'dynamic_appearance', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: 'dynamic appearance에 해당해 static v1에서 차단한다.',
  },
  {
    criterionId: 'criterion.discernment.bridge_straight', officerKey: 'discernment', traditionalOfficerName: '審辨官', anatomicalTarget: 'nose',
    sourceRefs: ['passage.shenxiang.five_officers.discernment'], sourceConcept: '梁柱端直', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: true, operationalizationNote: 'midline deviation metric 후보이나 straight tolerance는 calibration이 필요하다.',
  },
  {
    criterionId: 'criterion.discernment.yintang_root_continuity', officerKey: 'discernment', traditionalOfficerName: '審辨官', anatomicalTarget: 'nose',
    sourceRefs: ['passage.shenxiang.five_officers.discernment'], sourceConcept: '印堂平闊，山根連印', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '印堂/山根의 region map과 평·광 threshold가 아직 없다.',
  },
  {
    criterionId: 'criterion.discernment.bridge_prominent', officerKey: 'discernment', traditionalOfficerName: '審辨官', anatomicalTarget: 'nose',
    sourceRefs: ['passage.shenxiang.five_officers.discernment'], sourceConcept: '年壽高隆', modality: 'multi_view_static', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '돌출도는 profile/depth 관측이 필요하다.',
  },
  {
    criterionId: 'criterion.discernment.tip_round_full', officerKey: 'discernment', traditionalOfficerName: '審辨官', anatomicalTarget: 'nose',
    sourceRefs: ['passage.shenxiang.five_officers.discernment'], sourceConcept: '準圓庫起', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: true, operationalizationNote: '준두 round/full morphology 후보이나 threshold는 미정이다.',
  },
  {
    criterionId: 'criterion.discernment.bright_color', officerKey: 'discernment', traditionalOfficerName: '審辨官', anatomicalTarget: 'nose',
    sourceRefs: ['passage.shenxiang.five_officers.discernment'], sourceConcept: '色鮮黃明', modality: 'dynamic_appearance', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '색·기색 판독은 static v1에서 차단한다.',
  },
  {
    criterionId: 'criterion.intake.square_broad', officerKey: 'intake', traditionalOfficerName: '出納官', anatomicalTarget: 'mouth',
    sourceRefs: ['passage.shenxiang.five_officers.intake'], sourceConcept: '方大', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: true, operationalizationNote: 'mouth aspect/width 후보이나 方/大 threshold는 별도 calibration이 필요하다.',
  },
  {
    criterionId: 'criterion.intake.lips_substantial', officerKey: 'intake', traditionalOfficerName: '出納官', anatomicalTarget: 'mouth',
    sourceRefs: ['passage.shenxiang.five_officers.intake'], sourceConcept: '端厚', modality: 'static_geometry', requiredForTraditionalFormation: true,
    staticV1Eligible: true, operationalizationNote: 'neutral-mouth capture에서 lip thickness 후보.',
  },
  {
    criterionId: 'criterion.intake.corners_arched', officerKey: 'intake', traditionalOfficerName: '出納官', anatomicalTarget: 'mouth',
    sourceRefs: ['passage.shenxiang.five_officers.intake'], sourceConcept: '角弓', modality: 'capture_sensitive', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '표정에 따라 mouth corner curvature가 변하므로 neutral-expression gate가 필요하다.',
  },
  {
    criterionId: 'criterion.intake.open_close_relation', officerKey: 'intake', traditionalOfficerName: '出納官', anatomicalTarget: 'mouth',
    sourceRefs: ['passage.shenxiang.five_officers.intake'], sourceConcept: '開大合小', modality: 'capture_sensitive', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: '의도적 입 벌림/다묾 상태와 혼동되므로 단일 neutral frame에서 자동판정하지 않는다.',
  },
  {
    criterionId: 'criterion.intake.red_lip_color', officerKey: 'intake', traditionalOfficerName: '出納官', anatomicalTarget: 'mouth',
    sourceRefs: ['passage.shenxiang.five_officers.intake'], sourceConcept: '唇紅', modality: 'dynamic_appearance', requiredForTraditionalFormation: true,
    staticV1Eligible: false, operationalizationNote: 'lip color는 조명·화장 confound가 커 static v1에서 차단한다.',
  },
];

function officerDefinition(officerKey: FiveOfficerKey): FiveOfficerDefinition {
  const definition = FIVE_OFFICER_DEFINITIONS_V0.find((candidate) => candidate.officerKey === officerKey);
  if (definition === undefined) {
    throw new FaceAuthorityValidationError(`Unknown five-officer key: ${officerKey}`);
  }
  return definition;
}

function criteriaForOfficer(officerKey: FiveOfficerKey): readonly FiveOfficerCriterionDefinition[] {
  const definition = officerDefinition(officerKey);
  const byId = new Map(FIVE_OFFICER_CRITERIA_V0.map((criterion) => [criterion.criterionId, criterion] as const));
  return definition.criterionIds.map((criterionId) => {
    const criterion = byId.get(criterionId);
    if (criterion === undefined) {
      throw new FaceAuthorityValidationError(`${officerKey} references unknown criterion: ${criterionId}`);
    }
    return criterion;
  });
}

export function evaluateFiveOfficerStaticSupport(input: FiveOfficerAssessmentInput): FiveOfficerAssessment {
  const definition = officerDefinition(input.officerKey);
  const criteria = criteriaForOfficer(input.officerKey);
  const known = new Set(criteria.map((criterion) => criterion.criterionId));

  for (const criterionId of Object.keys(input.criterionStates)) {
    if (!known.has(criterionId)) {
      throw new FaceAuthorityValidationError(`${input.officerKey} received unknown criterion state: ${criterionId}`);
    }
  }

  const staticCriteria = criteria.filter((criterion) => criterion.requiredForTraditionalFormation && criterion.staticV1Eligible);
  const blockedCriteria = criteria.filter((criterion) => criterion.requiredForTraditionalFormation && !criterion.staticV1Eligible);
  const met: string[] = [];
  const failed: string[] = [];
  const unavailable: string[] = [];

  for (const criterion of staticCriteria) {
    const state = input.criterionStates[criterion.criterionId] ?? 'not_evaluated';
    if (state === 'met') met.push(criterion.criterionId);
    if (state === 'not_met') failed.push(criterion.criterionId);
    if (state === 'unavailable' || state === 'not_evaluated') unavailable.push(criterion.criterionId);
  }

  const staticSupportState: FiveOfficerStaticSupportState =
    failed.length > 0 ? 'contradicted' : unavailable.length > 0 ? 'insufficient' : 'complete';

  return {
    officerKey: input.officerKey,
    traditionalOfficerName: definition.traditionalOfficerName,
    staticSupportState,
    metStaticCriterionIds: met,
    failedStaticCriterionIds: failed,
    unavailableStaticCriterionIds: unavailable,
    blockedTraditionalFormationCriterionIds: blockedCriteria.map((criterion) => criterion.criterionId),
    traditionalFormationState: 'not_authorized',
    traditionalFormationReason:
      blockedCriteria.length > 0
        ? 'Traditional 官成 requires criteria that static v1 intentionally does not authorize.'
        : 'Traditional 官成 remains research-only until source and operationalization promotion gates are complete.',
  };
}

export function buildFiveOfficerResearchClaims(
  input: FiveOfficerAssessmentInput,
  assessment: FiveOfficerAssessment = evaluateFiveOfficerStaticSupport(input),
): readonly FaceClaim[] {
  const criteria = criteriaForOfficer(input.officerKey);
  const claims: FaceClaim[] = [];

  for (const criterion of criteria) {
    if (!criterion.staticV1Eligible) continue;
    const state = input.criterionStates[criterion.criterionId] ?? 'not_evaluated';
    if (state === 'not_evaluated' || state === 'unavailable') continue;
    claims.push({
      claimRef: `claim.research.${criterion.criterionId}.${state}`,
      claimType: 'FACE_LOCAL_INTERPRETATION',
      tier: 'F2',
      methodologyRef: FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers,
      sourceRefs: criterion.sourceRefs,
      semanticKey: `face.five_officers.${input.officerKey}.${criterion.criterionId.split('.').at(-1)}.${state}`,
      pattern: state,
      salience: state === 'not_met' ? 'countervailing' : 'supporting',
    });
  }

  claims.push({
    claimRef: `claim.research.five_officers.${input.officerKey}.static_support.${assessment.staticSupportState}`,
    claimType: 'FACE_CONFIGURATION_INTERPRETATION',
    tier: 'F3',
    methodologyRef: FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers,
    sourceRefs: officerDefinition(input.officerKey).sourceRefs,
    semanticKey: `face.five_officers.${input.officerKey}.static_support_${assessment.staticSupportState}`,
    pattern: `static_support_${assessment.staticSupportState}`,
    salience: assessment.staticSupportState === 'complete' ? 'strong' : assessment.staticSupportState === 'contradicted' ? 'countervailing' : 'secondary',
  });

  return claims;
}

export const FACE_FR3_RESEARCH_PACK_V0: FaceMethodologyPackDefinition = {
  ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.methodologyPacks[0]!,
  packId: 'pack.face.fr3_research_v0',
  version: '0.3.0',
  methodologyDefinitionRefs: [
    FACE_METHOD_REFS_V0.shenxiangThreeDivisions,
    FACE_METHOD_REFS_V0.mayiThreeDivisions,
    FACE_METHOD_REFS_V0.liuzhuangThreeDivisions,
    FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers,
    FACE_FR3_METHOD_REFS_V0.liuzhuangFiveOfficers,
    FACE_FR3_METHOD_REFS_V0.shenxiangSixFus,
    FACE_FR3_METHOD_REFS_V0.liuzhuangSixFus,
    FACE_METHOD_REFS_V0.twelvePalaces,
  ],
  regionMapRefs: [
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.methodologyPacks[0]!.regionMapRefs,
    'regionmap.shenxiang.six_fus@0.1.0',
    'regionmap.liuzhuang.six_fus@0.1.0',
  ],
  comparisonPolicyRef: `${FACE_COMPARISON_POLICY_V0.policyId}@${FACE_COMPARISON_POLICY_V0.version}`,
};

export const FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0: FaceAuthorityRegistry = {
  ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
  passages: [...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.passages, ...FACE_FR3_PASSAGES_V0],
  methodologies: [
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.methodologies.filter(
      (method) => `${method.methodologyId}@${method.version}` !== FACE_METHOD_REFS_V0.fiveOfficers,
    ),
    ...FACE_FR3_METHODOLOGIES_V0,
  ],
  conflicts: [...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.conflicts, ...FACE_FR3_CONFLICTS_V0],
  regionMaps: [...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.regionMaps, ...FACE_FR3_SIX_FU_REGION_MAPS_V0],
  methodologyPacks: [FACE_FR3_RESEARCH_PACK_V0],
};
