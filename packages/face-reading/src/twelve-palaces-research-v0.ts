import type {
  FaceMethodologyDefinition,
  FaceRegionMapDefinition,
  SourcePassage,
} from './contracts.js';
import { FaceAuthorityValidationError } from './validation.js';

export type TwelvePalaceKeyV0 =
  | 'life'
  | 'wealth'
  | 'siblings'
  | 'property'
  | 'children'
  | 'servants'
  | 'spouse'
  | 'illness'
  | 'migration'
  | 'career'
  | 'fortune_virtue'
  | 'appearance';

export type TwelvePalaceLocatorKindV0 =
  | 'local'
  | 'paired'
  | 'distributed'
  | 'composite'
  | 'global_configuration';

export type TwelvePalaceResearchTraditionV0 = 'shenxiang' | 'liuzhuang';

export interface TwelvePalaceLocatorV0 {
  readonly kind: TwelvePalaceLocatorKindV0;
  readonly anchorRefs: readonly string[];
  readonly relation: string;
  readonly requiresConfigurationRefs?: readonly string[];
}

export interface TwelvePalaceDefinitionV0 {
  readonly ordinal: number;
  readonly palaceKey: TwelvePalaceKeyV0;
  readonly traditionalLabel: string;
  readonly tradition: TwelvePalaceResearchTraditionV0;
  readonly methodologyRef: string;
  readonly locator: TwelvePalaceLocatorV0;
  readonly sourceRefs: readonly string[];
  readonly productSafety: {
    readonly locatorOnly: true;
    readonly blockedInferenceKeys: readonly string[];
  };
}

export interface TwelvePalaceMapItemV0 {
  readonly ordinal: number;
  readonly palaceKey: TwelvePalaceKeyV0;
  readonly traditionalLabel: string;
  readonly locatorKind: TwelvePalaceLocatorKindV0;
  readonly anchorRefs: readonly string[];
  readonly relation: string;
  readonly sourceRefs: readonly string[];
  readonly interactionMode:
    | 'region'
    | 'paired_regions'
    | 'distributed_regions'
    | 'composite_highlight'
    | 'whole_face_configuration';
}

export interface TwelvePalaceResearchMapProjectionV0 {
  readonly schemaVersion: 'v0';
  readonly authorityState: 'research_only';
  readonly tradition: TwelvePalaceResearchTraditionV0;
  readonly methodologyRef: string;
  readonly items: readonly TwelvePalaceMapItemV0[];
}

export const SHENXIANG_TWELVE_PALACE_METHOD_REF_V0 =
  'method.shenxiang.twelve_palaces@0.1.0';
export const LIUZHUANG_TWELVE_PALACE_METHOD_REF_V0 =
  'method.liuzhuang.twelve_palaces@0.1.0';

export const TWELVE_PALACE_LOCATOR_PASSAGES_V0 = [
  {
    passageId: 'passage.shenxiang.twelve_palaces.life.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 一命宮',
    originalText: '命宫者，居两眉之间，山根之上。',
    normalizedText: '命宮 locator: 양 미간, 山根 상부.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.wealth.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 二財帛',
    originalText: '鼻乃财星，位居土宿。财帛宫论曰：天仓、地库、金甲柜、井、灶，总曰财帛官。',
    normalizedText: '財帛宮 locator는 코 단일점이 아니라 鼻와 天倉·地庫·金甲櫃·井·灶의 복합 구성.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.siblings.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 三兄弟',
    originalText: '兄弟位居两眉，属罗计。',
    normalizedText: '兄弟宮 locator: 양 눈썹.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.property.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 四田宅',
    originalText: '田宅者，立居两眼。',
    normalizedText: '田宅宮 locator: 양 눈.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.children.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 五男女',
    originalText: '男女者。位居两眼一下。名曰泪堂。',
    normalizedText: '男女宮 locator: 양 눈 아래 淚堂/臥蠶 계열.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.servants.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 六奴僕',
    originalText: '奴仆者，位居地阁，重接水星。',
    normalizedText: '奴僕宮 locator: 地閣과 水星(입) 연결 구성.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.spouse.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 七妻妾',
    originalText: '妻妾者，位居鱼尾，号曰奸门。',
    normalizedText: '妻妾宮 locator: 양 魚尾/奸門.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.illness.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 八疾厄',
    originalText: '疾厄者，印堂之下，位居山根。',
    normalizedText: '疾厄宮 locator: 印堂 아래 山根 계열. 현대 의학 진단 authority가 아님.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.migration.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 九遷移',
    originalText: '迁移者，位居眉角，号曰天仓。迁移宫论曰：边地驿马，山林发际，乃为出入之所。',
    normalizedText: '遷移宮 locator: 眉角/天倉 중심 + 邊地·驛馬·山林·髮際의 분산 구성.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.career.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 十官祿',
    originalText: '官禄者，位居中正，上合离宫。',
    normalizedText: '官祿宮 locator: 中正에서 離宮으로 이어지는 상부 중앙 영역.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.fortune_virtue.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 十一福德',
    originalText: '福德者，位居天仓，牵连地阁。福德宫论曰：天仓地库为福德宫。',
    normalizedText: '福德宮 locator: 天倉과 地閣/地庫를 연결하는 비연속 복합 구성.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.shenxiang.twelve_palaces.appearance.locator',
    witnessId: 'witness.shenxiang_quanbian.ctext',
    chapter: '十二宮相論 / 十二相貌',
    originalText: '相貌者，先观五岳，次辨三停。',
    normalizedText: '相貌宮은 국소 region이 아니라 五嶽 + 三停의 전면 configuration.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.life.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 1、命宮',
    originalText: '两眉之间，山根之上。',
    normalizedText: '命宮 locator: 양 미간, 山根 상부.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.wealth.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 2、財帛宮',
    originalText: '鼻乃财星，位居土宿。',
    normalizedText: '財帛宮 locator의 중심은 鼻. 세부 倉庫 구성은 별도 passage 검증 필요.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.siblings.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 3、兄弟宮',
    originalText: '兄弟位居两眉，属罗计。',
    normalizedText: '兄弟宮 locator: 양 눈썹.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.property.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 4、田宅宮',
    originalText: '眼为田宅。',
    normalizedText: '田宅宮 locator: 양 눈.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.children.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 5、男女宮',
    originalText: '男位左，女为右，俱在眼下，名曰泪堂，又名卧蚕。',
    normalizedText: '男女宮 locator: 좌우 눈 아래 淚堂/臥蠶.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.servants.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 6、奴僕宮',
    originalText: '奴仆为金缕地阁，重接水星。',
    normalizedText: '奴僕宮 locator: 地閣과 水星 연결 구성. 金縷 표기는 OCR 재검증 필요.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.spouse.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 7、妻妾宮',
    originalText: '妻妾位居鱼尾，号曰奸门。',
    normalizedText: '妻妾宮 locator: 양 魚尾/奸門.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.illness.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 8、疾厄宮',
    originalText: '疾厄宫者，年寿、山根之位。',
    normalizedText: '疾厄宮 locator: 年壽/山根. 현대 의학 진단 authority가 아님.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.migration.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 9、遷移宮',
    originalText: '位居眉尾，号曰天仓。',
    normalizedText: '遷移宮 locator: 眉尾/天倉.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.career.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 10、官祿宮',
    originalText: '位居中正，上合离宫。',
    normalizedText: '官祿宮 locator: 中正에서 離宮으로 이어지는 상부 중앙 영역.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.fortune_virtue.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 11、福德宮',
    originalText: '位居天仓，接连地阁。',
    normalizedText: '福德宮 locator: 天倉과 地閣을 연결하는 비연속 구성.',
    verificationStatus: 'unverified_ocr',
  },
  {
    passageId: 'passage.liuzhuang.twelve_palaces.appearance.locator',
    witnessId: 'witness.liuzhuang_xiangfa.ctext',
    chapter: '七十三、十二宮 / 12、相貌宮',
    originalText: '相貌者乃总论也，先观五岳，次察三停。',
    normalizedText: '相貌宮은 국소 region이 아니라 五嶽 + 三停의 전면 configuration.',
    verificationStatus: 'unverified_ocr',
  },
] as const satisfies readonly SourcePassage[];

const SHENXIANG_PASSAGE_REFS = TWELVE_PALACE_LOCATOR_PASSAGES_V0
  .filter((passage) => passage.passageId.startsWith('passage.shenxiang.'))
  .map((passage) => passage.passageId);
const LIUZHUANG_PASSAGE_REFS = TWELVE_PALACE_LOCATOR_PASSAGES_V0
  .filter((passage) => passage.passageId.startsWith('passage.liuzhuang.'))
  .map((passage) => passage.passageId);

export const TWELVE_PALACE_METHODOLOGIES_V0 = [
  {
    methodologyId: 'method.shenxiang.twelve_palaces',
    version: '0.1.0',
    traditionalTerm: '十二宮相論',
    scope: 'static_face',
    sourceRefs: SHENXIANG_PASSAGE_REFS,
    description: '《神相全編》 전자본문의 十二宮 locator를 궁별로 분리한 연구 방법론. 궁을 동일 크기의 12개 점으로 환원하지 않는다.',
    limitations: [
      '현재 locator passage는 CText 전자본문 기반 unverified_ocr이며 scan_checked 이전이다.',
      'locator authority만 제공하며 길흉·질병·가족관계 판정을 production-authorize하지 않는다.',
      '정확한 polygon/landmark binding은 별도 operationalization이 필요하다.',
    ],
    reviewStatus: 'research',
  },
  {
    methodologyId: 'method.liuzhuang.twelve_palaces',
    version: '0.1.0',
    traditionalTerm: '七十三、十二宮',
    scope: 'static_face',
    sourceRefs: LIUZHUANG_PASSAGE_REFS,
    description: '《柳莊相法》 전자본문의 十二宮 locator를 독립적으로 보존하는 연구 방법론.',
    limitations: [
      '현재 locator passage는 CText 전자본문 기반 unverified_ocr이며 NLC scan 대조 이전이다.',
      '神相系 locator와 자동 병합하지 않는다.',
      '정확한 polygon/landmark binding은 별도 operationalization이 필요하다.',
    ],
    reviewStatus: 'research',
  },
] as const satisfies readonly FaceMethodologyDefinition[];

const PALACE_META = [
  ['life', '命宮'],
  ['wealth', '財帛宮'],
  ['siblings', '兄弟宮'],
  ['property', '田宅宮'],
  ['children', '男女宮'],
  ['servants', '奴僕宮'],
  ['spouse', '妻妾宮'],
  ['illness', '疾厄宮'],
  ['migration', '遷移宮'],
  ['career', '官祿宮'],
  ['fortune_virtue', '福德宮'],
  ['appearance', '相貌宮'],
] as const satisfies readonly (readonly [TwelvePalaceKeyV0, string])[];

const LOCATORS: Readonly<Record<TwelvePalaceResearchTraditionV0, Readonly<Record<TwelvePalaceKeyV0, TwelvePalaceLocatorV0>>>> = {
  shenxiang: {
    life: { kind: 'local', anchorRefs: ['brow_midline', 'shangen'], relation: 'between_brows_above_shangen' },
    wealth: { kind: 'composite', anchorRefs: ['nose', 'tiancang_pair', 'diku_pair', 'jinjiagui_pair', 'jingzao_pair'], relation: 'nose_plus_warehouse_configuration' },
    siblings: { kind: 'paired', anchorRefs: ['left_brow', 'right_brow'], relation: 'bilateral_brows' },
    property: { kind: 'paired', anchorRefs: ['left_eye', 'right_eye'], relation: 'bilateral_eyes' },
    children: { kind: 'paired', anchorRefs: ['left_tear_trough', 'right_tear_trough'], relation: 'bilateral_under_eye_lei_tang' },
    servants: { kind: 'composite', anchorRefs: ['dige', 'mouth_shuixing'], relation: 'dige_connected_to_shuixing' },
    spouse: { kind: 'paired', anchorRefs: ['left_jianmen', 'right_jianmen'], relation: 'bilateral_eye_tail_jianmen' },
    illness: { kind: 'local', anchorRefs: ['yintang', 'shangen', 'nianshou'], relation: 'below_yintang_centered_on_shangen' },
    migration: { kind: 'distributed', anchorRefs: ['left_tiancang', 'right_tiancang', 'biandi_pair', 'yima_pair', 'shanlin_hairline'], relation: 'brow_corner_tiancang_plus_travel_regions' },
    career: { kind: 'local', anchorRefs: ['zhongzheng', 'ligong'], relation: 'zhongzheng_to_ligong' },
    fortune_virtue: { kind: 'distributed', anchorRefs: ['tiancang_pair', 'dige', 'diku_pair'], relation: 'tiancang_connected_to_lower_face' },
    appearance: { kind: 'global_configuration', anchorRefs: ['five_yue_configuration', 'three_divisions_configuration'], relation: 'whole_face_configuration', requiresConfigurationRefs: ['five_yue', 'three_divisions'] },
  },
  liuzhuang: {
    life: { kind: 'local', anchorRefs: ['brow_midline', 'shangen'], relation: 'between_brows_above_shangen' },
    wealth: { kind: 'local', anchorRefs: ['nose'], relation: 'nose_centered' },
    siblings: { kind: 'paired', anchorRefs: ['left_brow', 'right_brow'], relation: 'bilateral_brows' },
    property: { kind: 'paired', anchorRefs: ['left_eye', 'right_eye'], relation: 'bilateral_eyes' },
    children: { kind: 'paired', anchorRefs: ['left_tear_trough', 'right_tear_trough'], relation: 'bilateral_under_eye_lei_tang' },
    servants: { kind: 'composite', anchorRefs: ['dige', 'mouth_shuixing'], relation: 'dige_connected_to_shuixing' },
    spouse: { kind: 'paired', anchorRefs: ['left_jianmen', 'right_jianmen'], relation: 'bilateral_eye_tail_jianmen' },
    illness: { kind: 'local', anchorRefs: ['nianshou', 'shangen'], relation: 'nianshou_and_shangen' },
    migration: { kind: 'paired', anchorRefs: ['left_tiancang', 'right_tiancang'], relation: 'bilateral_brow_tail_tiancang' },
    career: { kind: 'local', anchorRefs: ['zhongzheng', 'ligong'], relation: 'zhongzheng_to_ligong' },
    fortune_virtue: { kind: 'distributed', anchorRefs: ['tiancang_pair', 'dige'], relation: 'tiancang_connected_to_dige' },
    appearance: { kind: 'global_configuration', anchorRefs: ['five_yue_configuration', 'three_divisions_configuration'], relation: 'whole_face_configuration', requiresConfigurationRefs: ['five_yue', 'three_divisions'] },
  },
};

function passageRef(tradition: TwelvePalaceResearchTraditionV0, palaceKey: TwelvePalaceKeyV0): string {
  return `passage.${tradition}.twelve_palaces.${palaceKey}.locator`;
}

function methodRef(tradition: TwelvePalaceResearchTraditionV0): string {
  return tradition === 'shenxiang'
    ? SHENXIANG_TWELVE_PALACE_METHOD_REF_V0
    : LIUZHUANG_TWELVE_PALACE_METHOD_REF_V0;
}

export const TWELVE_PALACE_DEFINITIONS_V0: readonly TwelvePalaceDefinitionV0[] = Object.freeze(
  (['shenxiang', 'liuzhuang'] as const).flatMap((tradition) =>
    PALACE_META.map(([palaceKey, traditionalLabel], index) => ({
      ordinal: index + 1,
      palaceKey,
      traditionalLabel,
      tradition,
      methodologyRef: methodRef(tradition),
      locator: LOCATORS[tradition][palaceKey],
      sourceRefs: [passageRef(tradition, palaceKey)],
      productSafety: {
        locatorOnly: true as const,
        blockedInferenceKeys: palaceKey === 'illness'
          ? ['medical_diagnosis', 'disease_prediction', 'health_status_inference']
          : [],
      },
    })),
  ),
);

function regionMapFor(tradition: TwelvePalaceResearchTraditionV0): FaceRegionMapDefinition {
  const definitions = TWELVE_PALACE_DEFINITIONS_V0.filter((definition) => definition.tradition === tradition);
  return {
    regionMapId: `regionmap.${tradition}.twelve_palaces`,
    version: '0.1.0',
    methodologyRef: methodRef(tradition),
    sourceRefs: definitions.flatMap((definition) => definition.sourceRefs),
    coordinateFrame: 'normalized_face_landmark_frame',
    regions: definitions.map((definition) => ({
      regionKey: definition.palaceKey,
      label: definition.traditionalLabel,
      geometryDefinition: {
        locatorKind: definition.locator.kind,
        anchorRefs: definition.locator.anchorRefs,
        relation: definition.locator.relation,
        ...(definition.locator.requiresConfigurationRefs === undefined
          ? {}
          : { requiresConfigurationRefs: definition.locator.requiresConfigurationRefs }),
      },
      sourceRefs: definition.sourceRefs,
    })),
    mappingStatus: 'research',
  };
}

export const TWELVE_PALACE_REGION_MAPS_V0 = [
  regionMapFor('shenxiang'),
  regionMapFor('liuzhuang'),
] as const satisfies readonly FaceRegionMapDefinition[];

function interactionMode(kind: TwelvePalaceLocatorKindV0): TwelvePalaceMapItemV0['interactionMode'] {
  switch (kind) {
    case 'local': return 'region';
    case 'paired': return 'paired_regions';
    case 'distributed': return 'distributed_regions';
    case 'composite': return 'composite_highlight';
    case 'global_configuration': return 'whole_face_configuration';
  }
}

export function validateTwelvePalaceDefinitionsV0(
  definitions: readonly TwelvePalaceDefinitionV0[] = TWELVE_PALACE_DEFINITIONS_V0,
): readonly TwelvePalaceDefinitionV0[] {
  for (const tradition of ['shenxiang', 'liuzhuang'] as const) {
    const scoped = definitions.filter((definition) => definition.tradition === tradition);
    if (scoped.length !== 12) {
      throw new FaceAuthorityValidationError(`${tradition} Twelve Palaces must contain exactly 12 definitions.`);
    }
    const ordinals = new Set(scoped.map((definition) => definition.ordinal));
    const keys = new Set(scoped.map((definition) => definition.palaceKey));
    if (ordinals.size !== 12 || ![...ordinals].every((ordinal) => Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= 12)) {
      throw new FaceAuthorityValidationError(`${tradition} Twelve Palaces ordinals must be unique 1..12.`);
    }
    if (keys.size !== 12) {
      throw new FaceAuthorityValidationError(`${tradition} Twelve Palaces palace keys must be unique.`);
    }
    for (const definition of scoped) {
      if (definition.methodologyRef !== methodRef(tradition)) {
        throw new FaceAuthorityValidationError(`${tradition}.${definition.palaceKey} methodologyRef mismatch.`);
      }
      if (definition.sourceRefs.length !== 1 || definition.sourceRefs[0] !== passageRef(tradition, definition.palaceKey)) {
        throw new FaceAuthorityValidationError(`${tradition}.${definition.palaceKey} locator requires its own palace passage.`);
      }
      if (definition.locator.anchorRefs.length === 0) {
        throw new FaceAuthorityValidationError(`${tradition}.${definition.palaceKey} locator requires anchorRefs.`);
      }
      if (definition.palaceKey === 'appearance' && definition.locator.kind !== 'global_configuration') {
        throw new FaceAuthorityValidationError(`${tradition}.appearance must remain a global configuration, not a point/region.`);
      }
      if (definition.palaceKey === 'illness') {
        const requiredBlocks = ['medical_diagnosis', 'disease_prediction', 'health_status_inference'];
        for (const block of requiredBlocks) {
          if (!definition.productSafety.blockedInferenceKeys.includes(block)) {
            throw new FaceAuthorityValidationError(`${tradition}.illness must block ${block}.`);
          }
        }
      }
    }
  }
  return definitions;
}

export function projectTwelvePalaceResearchMapV0(
  tradition: TwelvePalaceResearchTraditionV0,
): TwelvePalaceResearchMapProjectionV0 {
  validateTwelvePalaceDefinitionsV0();
  const definitions = TWELVE_PALACE_DEFINITIONS_V0
    .filter((definition) => definition.tradition === tradition)
    .sort((left, right) => left.ordinal - right.ordinal);

  return Object.freeze({
    schemaVersion: 'v0' as const,
    authorityState: 'research_only' as const,
    tradition,
    methodologyRef: methodRef(tradition),
    items: Object.freeze(definitions.map((definition) => Object.freeze({
      ordinal: definition.ordinal,
      palaceKey: definition.palaceKey,
      traditionalLabel: definition.traditionalLabel,
      locatorKind: definition.locator.kind,
      anchorRefs: Object.freeze([...definition.locator.anchorRefs]),
      relation: definition.locator.relation,
      sourceRefs: Object.freeze([...definition.sourceRefs]),
      interactionMode: interactionMode(definition.locator.kind),
    }))),
  });
}
