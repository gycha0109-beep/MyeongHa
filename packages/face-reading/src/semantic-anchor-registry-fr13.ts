import type {
  FaceAuthorityConflictDefinition,
  SourcePassage,
} from './contracts.js';
import {
  LIUZHUANG_TWELVE_PALACE_METHOD_REF_V0,
  TWELVE_PALACE_DEFINITIONS_V0,
  type TwelvePalaceDefinitionV0,
} from './twelve-palaces-research-v0.js';
import { FaceAuthorityValidationError } from './validation.js';

export type TraditionalFaceAnchorAuthorityClassV1 =
  | 'neutral_observation'
  | 'traditional_named_region'
  | 'traditional_aggregate'
  | 'traditional_configuration'
  | 'legacy_alias';

export type TraditionalFaceAnchorSemanticShapeV1 =
  | 'point_or_small_region'
  | 'region'
  | 'paired_region'
  | 'aggregate'
  | 'configuration'
  | 'derived_relation';

export type TraditionalFaceAnchorBindingStatusV1 =
  | 'provider_contract_required'
  | 'blocked_needs_operationalization'
  | 'blocked_open_conflict'
  | 'blocked_alias_migration';

export interface TraditionalFaceAnchorDefinitionV1 {
  readonly anchorRef: string;
  readonly label: string;
  readonly authorityClass: TraditionalFaceAnchorAuthorityClassV1;
  readonly semanticShape: TraditionalFaceAnchorSemanticShapeV1;
  readonly sourceRefs: readonly string[];
  readonly providerBindingStatus: TraditionalFaceAnchorBindingStatusV1;
  readonly componentRefs?: readonly string[];
  readonly canonicalAnchorRef?: string;
  readonly blockingConflictRefs?: readonly string[];
  readonly notes: readonly string[];
}

export interface TwelvePalaceAnchorReadinessV1 {
  readonly tradition: TwelvePalaceDefinitionV0['tradition'];
  readonly palaceKey: TwelvePalaceDefinitionV0['palaceKey'];
  readonly state: 'binding_candidate' | 'blocked';
  readonly unresolvedAnchorRefs: readonly string[];
  readonly conflictRefs: readonly string[];
}

export const FR13_ANCHOR_SOURCE_PASSAGES = [
  {
    passageId: 'passage.shenxiang.thirteen_positions.central_sequence',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十三部位總歌 / 中央十三部位',
    originalText: '天中 天庭 司空 中正 印堂 山根 年上 壽上 准頭 人中 水星 承漿 地閣',
    normalizedText: '神相全編 전자본문의 중앙 13부위 명칭 순서. provider landmark index나 현대 해부학 좌표를 뜻하지 않는다.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.six_fu.anchor_system',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '六府',
    originalText: '上二府自輔角至天倉，中二府自命門至虎耳，下二府自肩骨至地閣。',
    normalizedText: '六府는 단일 점이 아니라 상·중·하의 paired/extended region 체계로 읽어야 한다.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.six_fu.anchor_system',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '十九、三停六府',
    originalText: '六府：天倉為上二府，顴骨為中二府，地庫為下二府。',
    normalizedText: '柳莊相法 전자본문은 六府를 天倉/顴骨/地庫의 paired aggregate로 설명한다.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.leitang_wocan.distinction',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '永樂百問 / 臥蠶淚堂辨',
    originalText: '蠶位共淚堂大不相同，臥蠶下乃淚堂。',
    normalizedText: '柳莊相法의 후속 세부 문답은 臥蠶과 淚堂을 서로 다른 부위로 구분한다.',
    verificationStatus: 'unverified_ocr',
  },
] as const satisfies readonly SourcePassage[];

export const FR13_ANCHOR_CONFLICTS = [
  {
    conflictId: 'conflict.liuzhuang.children_palace.leitang_wocan_equivalence_v0',
    methodologyRefs: [LIUZHUANG_TWELVE_PALACE_METHOD_REF_V0],
    sourceRefs: [
      'passage.liuzhuang.twelve_palaces.children.locator',
      'passage.liuzhuang.leitang_wocan.distinction',
    ],
    affectedTiers: ['F0', 'F1', 'F2'],
    status: 'open',
    reason: '柳莊相法 十二宮 문장은 淚堂과 臥蠶을 alias처럼 병기하지만 후속 세부 문답은 두 부위를 명시적으로 구분한다. exact provider binding 전 해결이 필요하다.',
  },
] as const satisfies readonly FaceAuthorityConflictDefinition[];

const P = Object.freeze({
  shenLife: 'passage.shenxiang.twelve_palaces.life.locator',
  shenWealth: 'passage.shenxiang.twelve_palaces.wealth.locator',
  shenSiblings: 'passage.shenxiang.twelve_palaces.siblings.locator',
  shenProperty: 'passage.shenxiang.twelve_palaces.property.locator',
  shenChildren: 'passage.shenxiang.twelve_palaces.children.locator',
  shenServants: 'passage.shenxiang.twelve_palaces.servants.locator',
  shenSpouse: 'passage.shenxiang.twelve_palaces.spouse.locator',
  shenIllness: 'passage.shenxiang.twelve_palaces.illness.locator',
  shenMigration: 'passage.shenxiang.twelve_palaces.migration.locator',
  shenCareer: 'passage.shenxiang.twelve_palaces.career.locator',
  shenFortune: 'passage.shenxiang.twelve_palaces.fortune_virtue.locator',
  shenAppearance: 'passage.shenxiang.twelve_palaces.appearance.locator',
  liuChildren: 'passage.liuzhuang.twelve_palaces.children.locator',
  liuServants: 'passage.liuzhuang.twelve_palaces.servants.locator',
  liuSpouse: 'passage.liuzhuang.twelve_palaces.spouse.locator',
  liuIllness: 'passage.liuzhuang.twelve_palaces.illness.locator',
  liuMigration: 'passage.liuzhuang.twelve_palaces.migration.locator',
  liuCareer: 'passage.liuzhuang.twelve_palaces.career.locator',
  liuFortune: 'passage.liuzhuang.twelve_palaces.fortune_virtue.locator',
  central13: 'passage.shenxiang.thirteen_positions.central_sequence',
  shenSixFu: 'passage.shenxiang.six_fu.anchor_system',
  liuSixFu: 'passage.liuzhuang.six_fu.anchor_system',
  liuLeitangConflict: 'passage.liuzhuang.leitang_wocan.distinction',
});

const neutral = (
  anchorRef: string,
  label: string,
  semanticShape: TraditionalFaceAnchorSemanticShapeV1 = 'region',
): TraditionalFaceAnchorDefinitionV1 => ({
  anchorRef,
  label,
  authorityClass: 'neutral_observation',
  semanticShape,
  sourceRefs: [],
  providerBindingStatus: 'provider_contract_required',
  notes: ['중립 관측 개념이다. 특정 CV provider landmark index는 이 registry가 소유하지 않는다.'],
});

const traditional = (input: {
  anchorRef: string;
  label: string;
  semanticShape?: TraditionalFaceAnchorSemanticShapeV1;
  sourceRefs: readonly string[];
  componentRefs?: readonly string[];
  bindingStatus?: TraditionalFaceAnchorBindingStatusV1;
  conflictRefs?: readonly string[];
  notes?: readonly string[];
}): TraditionalFaceAnchorDefinitionV1 => ({
  anchorRef: input.anchorRef,
  label: input.label,
  authorityClass: input.semanticShape === 'aggregate' || input.semanticShape === 'paired_region'
    ? 'traditional_aggregate'
    : input.semanticShape === 'configuration'
      ? 'traditional_configuration'
      : 'traditional_named_region',
  semanticShape: input.semanticShape ?? 'region',
  sourceRefs: input.sourceRefs,
  providerBindingStatus: input.bindingStatus ?? 'blocked_needs_operationalization',
  ...(input.componentRefs === undefined ? {} : { componentRefs: input.componentRefs }),
  ...(input.conflictRefs === undefined ? {} : { blockingConflictRefs: input.conflictRefs }),
  notes: input.notes ?? ['전통 명명 anchor이며 provider 좌표/landmark binding은 별도 operationalization이 필요하다.'],
});

const alias = (
  anchorRef: string,
  label: string,
  canonicalAnchorRef: string,
  notes: readonly string[],
): TraditionalFaceAnchorDefinitionV1 => ({
  anchorRef,
  label,
  authorityClass: 'legacy_alias',
  semanticShape: 'derived_relation',
  sourceRefs: [],
  providerBindingStatus: 'blocked_alias_migration',
  canonicalAnchorRef,
  notes,
});

export const TRADITIONAL_FACE_ANCHORS_FR13: readonly TraditionalFaceAnchorDefinitionV1[] = Object.freeze([
  neutral('brow_midline', '양 눈썹 사이 중앙'),
  neutral('nose', '코 전체 관측 영역'),
  neutral('left_brow', '왼쪽 눈썹'),
  neutral('right_brow', '오른쪽 눈썹'),
  neutral('left_eye', '왼쪽 눈'),
  neutral('right_eye', '오른쪽 눈'),

  traditional({ anchorRef: 'shangen', label: '山根', sourceRefs: [P.central13, P.shenLife, P.shenIllness] }),
  traditional({ anchorRef: 'yintang', label: '印堂', sourceRefs: [P.central13, P.shenIllness] }),
  traditional({ anchorRef: 'nianshou', label: '年壽', sourceRefs: [P.central13, P.liuIllness] }),
  traditional({ anchorRef: 'dige', label: '地閣', sourceRefs: [P.central13, P.shenServants, P.shenFortune] }),
  traditional({ anchorRef: 'shuixing_region', label: '水星', sourceRefs: [P.central13, P.shenServants] }),
  traditional({ anchorRef: 'zhongzheng', label: '中正', sourceRefs: [P.central13, P.shenCareer] }),
  traditional({ anchorRef: 'ligong', label: '離宮', sourceRefs: [P.shenCareer, P.liuCareer] }),

  traditional({ anchorRef: 'left_tiancang', label: '左天倉', semanticShape: 'region', sourceRefs: [P.shenMigration, P.liuMigration] }),
  traditional({ anchorRef: 'right_tiancang', label: '右天倉', semanticShape: 'region', sourceRefs: [P.shenMigration, P.liuMigration] }),
  traditional({ anchorRef: 'tiancang_pair', label: '兩天倉', semanticShape: 'paired_region', sourceRefs: [P.shenWealth, P.shenMigration, P.shenFortune, P.liuSixFu], componentRefs: ['left_tiancang', 'right_tiancang'] }),
  traditional({ anchorRef: 'diku_pair', label: '地庫 aggregate', semanticShape: 'aggregate', sourceRefs: [P.shenWealth, P.shenFortune, P.shenSixFu, P.liuSixFu], notes: ['FR-12의 `_pair` 표현은 compatibility key다. 地庫의 정확한 좌우 cardinality/provider geometry는 아직 확정하지 않는다.'] }),
  traditional({ anchorRef: 'jinjiagui_pair', label: '金甲櫃 aggregate', semanticShape: 'aggregate', sourceRefs: [P.shenWealth], notes: ['FR-12 compatibility aggregate. 정확한 cardinality와 geometry는 direct source/operationalization 전까지 미정이다.'] }),
  traditional({ anchorRef: 'jingzao_pair', label: '井灶 aggregate', semanticShape: 'aggregate', sourceRefs: [P.shenWealth], notes: ['井/灶를 하나의 현대 해부학 영역으로 합치지 않는다. FR-12 compatibility aggregate다.'] }),
  traditional({ anchorRef: 'biandi_pair', label: '邊地 aggregate', semanticShape: 'aggregate', sourceRefs: [P.shenMigration] }),
  traditional({ anchorRef: 'yima_pair', label: '驛馬 aggregate', semanticShape: 'aggregate', sourceRefs: [P.shenMigration] }),
  traditional({ anchorRef: 'shanlin_hairline', label: '山林/髮際 relation', semanticShape: 'derived_relation', sourceRefs: [P.shenMigration] }),

  traditional({ anchorRef: 'left_jianmen', label: '左奸門', sourceRefs: [P.shenSpouse, P.liuSpouse], notes: ['妻妾宮의 paired presentation을 위한 research semantic anchor. exact side geometry는 미확정이다.'] }),
  traditional({ anchorRef: 'right_jianmen', label: '右奸門', sourceRefs: [P.shenSpouse, P.liuSpouse], notes: ['妻妾宮의 paired presentation을 위한 research semantic anchor. exact side geometry는 미확정이다.'] }),

  traditional({ anchorRef: 'left_leitang_region', label: '左淚堂', sourceRefs: [P.shenChildren, P.liuChildren, P.liuLeitangConflict], bindingStatus: 'blocked_open_conflict', conflictRefs: ['conflict.liuzhuang.children_palace.leitang_wocan_equivalence_v0'] }),
  traditional({ anchorRef: 'right_leitang_region', label: '右淚堂', sourceRefs: [P.shenChildren, P.liuChildren, P.liuLeitangConflict], bindingStatus: 'blocked_open_conflict', conflictRefs: ['conflict.liuzhuang.children_palace.leitang_wocan_equivalence_v0'] }),
  traditional({ anchorRef: 'left_wocan_region', label: '左臥蠶', sourceRefs: [P.liuChildren, P.liuLeitangConflict], bindingStatus: 'blocked_open_conflict', conflictRefs: ['conflict.liuzhuang.children_palace.leitang_wocan_equivalence_v0'] }),
  traditional({ anchorRef: 'right_wocan_region', label: '右臥蠶', sourceRefs: [P.liuChildren, P.liuLeitangConflict], bindingStatus: 'blocked_open_conflict', conflictRefs: ['conflict.liuzhuang.children_palace.leitang_wocan_equivalence_v0'] }),

  traditional({ anchorRef: 'five_yue_configuration', label: '五嶽 configuration', semanticShape: 'configuration', sourceRefs: [P.shenAppearance] }),
  traditional({ anchorRef: 'three_divisions_configuration', label: '三停 configuration', semanticShape: 'configuration', sourceRefs: [P.shenAppearance] }),

  alias('left_tear_trough', 'legacy left tear-trough alias', 'left_leitang_region', [
    'FR-12 compatibility only. 현대 tear trough와 전통 淚堂을 동일시하는 근거가 아니다.',
    'provider binding은 차단된다.',
  ]),
  alias('right_tear_trough', 'legacy right tear-trough alias', 'right_leitang_region', [
    'FR-12 compatibility only. 현대 tear trough와 전통 淚堂을 동일시하는 근거가 아니다.',
    'provider binding은 차단된다.',
  ]),
  alias('mouth_shuixing', 'legacy mouth-shuixing alias', 'shuixing_region', [
    'FR-12 compatibility only. 水星의 provider geometry를 입 전체와 즉시 등치하지 않는다.',
  ]),
]);

const FORBIDDEN_BINDING_FIELD_PATTERN = /(?:landmark|index|coordinate|polygon|mediapipe|facemesh)/iu;

export function validateTraditionalFaceAnchorRegistryFR13(
  definitions: readonly TraditionalFaceAnchorDefinitionV1[] = TRADITIONAL_FACE_ANCHORS_FR13,
): readonly TraditionalFaceAnchorDefinitionV1[] {
  const byRef = new Map<string, TraditionalFaceAnchorDefinitionV1>();
  for (const definition of definitions) {
    if (definition.anchorRef.trim().length === 0) throw new FaceAuthorityValidationError('Face anchorRef is required.');
    if (byRef.has(definition.anchorRef)) throw new FaceAuthorityValidationError(`Duplicate Face anchorRef: ${definition.anchorRef}`);
    byRef.set(definition.anchorRef, definition);
    if (definition.label.trim().length === 0) throw new FaceAuthorityValidationError(`${definition.anchorRef}.label is required.`);
    if (definition.authorityClass !== 'neutral_observation' && definition.authorityClass !== 'legacy_alias' && definition.sourceRefs.length === 0) {
      throw new FaceAuthorityValidationError(`${definition.anchorRef} traditional anchor requires sourceRefs.`);
    }
    if (definition.authorityClass === 'legacy_alias') {
      if (definition.canonicalAnchorRef === undefined) throw new FaceAuthorityValidationError(`${definition.anchorRef} legacy alias requires canonicalAnchorRef.`);
      if (definition.providerBindingStatus !== 'blocked_alias_migration') throw new FaceAuthorityValidationError(`${definition.anchorRef} legacy alias must remain binding-blocked.`);
    }
    const serialized = JSON.stringify(definition);
    if (FORBIDDEN_BINDING_FIELD_PATTERN.test(serialized)) {
      const allowedNotes = definition.notes.join(' ');
      const structural = JSON.stringify({ ...definition, notes: [] });
      if (FORBIDDEN_BINDING_FIELD_PATTERN.test(structural)) {
        throw new FaceAuthorityValidationError(`${definition.anchorRef} semantic registry must not contain provider landmark/index/coordinate/polygon binding.`);
      }
      void allowedNotes;
    }
  }

  for (const definition of definitions) {
    if (definition.canonicalAnchorRef !== undefined && !byRef.has(definition.canonicalAnchorRef)) {
      throw new FaceAuthorityValidationError(`${definition.anchorRef} canonicalAnchorRef is unknown: ${definition.canonicalAnchorRef}`);
    }
    for (const componentRef of definition.componentRefs ?? []) {
      if (!byRef.has(componentRef)) throw new FaceAuthorityValidationError(`${definition.anchorRef} componentRef is unknown: ${componentRef}`);
    }
  }

  const allFr12Refs = new Set(
    TWELVE_PALACE_DEFINITIONS_V0.flatMap((definition) => definition.locator.anchorRefs),
  );
  const unresolved = [...allFr12Refs].filter((ref) => !byRef.has(ref));
  if (unresolved.length > 0) {
    throw new FaceAuthorityValidationError(`FR-12 locator anchorRefs unresolved in FR-13 registry: ${unresolved.join(', ')}`);
  }

  return definitions;
}

export function getTraditionalFaceAnchorFR13(anchorRef: string): TraditionalFaceAnchorDefinitionV1 {
  validateTraditionalFaceAnchorRegistryFR13();
  const definition = TRADITIONAL_FACE_ANCHORS_FR13.find((candidate) => candidate.anchorRef === anchorRef);
  if (definition === undefined) throw new FaceAuthorityValidationError(`Unknown FR-13 Face anchorRef: ${anchorRef}`);
  return definition;
}

export function evaluateTwelvePalaceAnchorReadinessFR13(
  definition: TwelvePalaceDefinitionV0,
): TwelvePalaceAnchorReadinessV1 {
  validateTraditionalFaceAnchorRegistryFR13();
  const anchors = definition.locator.anchorRefs.map(getTraditionalFaceAnchorFR13);
  const unresolvedAnchorRefs = anchors
    .filter((anchor) => anchor.providerBindingStatus !== 'provider_contract_required')
    .map((anchor) => anchor.anchorRef);
  const conflictRefs = [...new Set(anchors.flatMap((anchor) => anchor.blockingConflictRefs ?? []))];
  return Object.freeze({
    tradition: definition.tradition,
    palaceKey: definition.palaceKey,
    state: unresolvedAnchorRefs.length === 0 ? 'binding_candidate' as const : 'blocked' as const,
    unresolvedAnchorRefs: Object.freeze(unresolvedAnchorRefs),
    conflictRefs: Object.freeze(conflictRefs),
  });
}
