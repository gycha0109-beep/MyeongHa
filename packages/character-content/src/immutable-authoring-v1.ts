import type { CharacterCallingBond, CharacterVisualProfile } from './schema.js';

export const CHARACTER_IMMUTABLE_AUTHORING_V1_SOURCE = {
  proposalCommit: '34a226e0943d74c07c8d96e6fcfd4e588351683f',
  proposalBlob: '536f9335d14bd1207313b8684d4f470c7d39abde',
  approvalDocument:
    'docs/source-authority-decisions/CHARACTER_IMMUTABLE_IDENTITY_VISUAL_PROPOSAL_V1_APPROVAL.md',
  productionPublication: 'blocked',
} as const;

export const CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS = [
  'seyeon',
  'yeoul',
  'seorin',
  'rahyeon',
  'mira',
  'taegyeom',
  'yunho',
  'doyun',
  'baekheon',
] as const;

export type CharacterImmutableAuthoringV1CharacterId =
  (typeof CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS)[number];

export interface CharacterImmutableAuthoringV1Definition {
  readonly characterId: CharacterImmutableAuthoringV1CharacterId;
  readonly displayName: string;
  readonly gender: string;
  readonly apparentAgeBand: string;
  readonly origin: string;
  readonly worldRole: string;
  /**
   * Separate World/Character authority owns the Principle/Calling binding.
   * This immutable identity/visual projection must never resurrect legacy Deity canon.
   */
  readonly callingBond: CharacterCallingBond;
  readonly shortDescriptor: string;
  readonly personalityTraits: readonly string[];
  readonly values: readonly string[];
  readonly flaws: readonly string[];
  readonly visual: CharacterVisualProfile;
}

export const CHARACTER_IMMUTABLE_AUTHORING_V1 = [
  {
    characterId: 'seyeon',
    displayName: '세연',
    gender: 'female',
    apparentAgeBand: '24-27',
    origin: '오래된 기록시설과 공동주거가 섞인 구도심 생활권',
    worldRole: '변화의 연속성을 증언하는 오래된 동행자',
    shortDescriptor: '바뀌어도 이어지는 것을 기억하는 첫 동행자',
    personalityTraits: ['인내심', '관찰력', '꾸준함', '절제된 다정함'],
    values: ['연속성', '현재의 선택권', '기억의 정확성'],
    flaws: ['이미 끝난 사람과 관계를 너무 오래 보존하려 함'],
    callingBond: {
      authorityState: 'world_dependent',
      note: 'Principle/Calling binding requires separate World and Character authority; legacy Deity mapping is not canonical.',
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: '오래 곁에 있었던 안정감, 정적이지만 낡지 않은 contemporary classic',
      silhouette: '긴 수직선의 레이어드 재킷과 부드러운 어깨선',
      palette: ['#E8E0D2', '#39445E', '#A56A43'],
      motifs: ['매듭', '수선선', '겹친 종이 가장자리'],
      costumeDirection: '클래식 셔츠/니트와 긴 아우터의 생활형 레이어링',
      prohibitedTropes: ['교복 첫사랑 클리셰', '과도한 향수풍 레트로', '성녀형 무결점 이미지'],
    },
  },
  {
    characterId: 'yeoul',
    displayName: '여울',
    gender: 'female',
    apparentAgeBand: '22-25',
    origin: '수로·시장·야간 상점이 뒤섞인 교차 생활권',
    worldRole: '말보다 먼저 새는 반응과 모순을 포착하는 관찰자',
    shortDescriptor: '감추려 할수록 드러나는 반응을 놓치지 않는 사람',
    personalityTraits: ['예민한 관찰력', '빠른 반응', '솔직함을 향한 집요함', '높은 관계 민감도'],
    values: ['진짜 반응', '상호성', '명료한 관심'],
    flaws: ['불안하면 모순을 과잉해석하고 상대를 시험함'],
    callingBond: {
      authorityState: 'world_dependent',
      note: 'Principle/Calling binding requires separate World and Character authority; legacy Deity mapping is not canonical.',
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: 'sharp feminine, 긴장감 있는 시선과 즉각적인 반응이 읽히는 경량 실루엣',
      silhouette: '짧은 상체 레이어와 빠른 움직임이 드러나는 비대칭 하단선',
      palette: ['#3A1F2E', '#6C4A78', '#BFC3CC'],
      motifs: ['잔물결', '겹친 반사', '얇은 금속선'],
      costumeDirection: 'fitted와 loose를 섞은 도시형 레이어, 손과 시선의 움직임이 잘 보이게 설계',
      prohibitedTropes: ['전형적 츤데레 트윈테일', '과도한 femme-fatale 노출', '질투=아동성 표현'],
    },
  },
  {
    characterId: 'seorin',
    displayName: '서린',
    gender: 'female',
    apparentAgeBand: '27-31',
    origin: '문서보존소와 연구실이 중심인 조용한 학구',
    worldRole: '기억을 보존하기보다 그 의미를 다시 편집하도록 돕는 해석자',
    shortDescriptor: '기억의 의미를 조용히 다시 쓰게 하는 해석자',
    personalityTraits: ['정밀함', '낮은 과장성', '높은 맥락 감각', '느린 신뢰'],
    values: ['맥락', '해석 가능성', '기록의 비소유성'],
    flaws: ['이미 달라진 사람도 오래된 해석으로 붙잡음'],
    callingBond: {
      authorityState: 'world_dependent',
      note: 'Principle/Calling binding requires separate World and Character authority; legacy Deity mapping is not canonical.',
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: 'romance coding을 낮추고 미형보다 신비·정밀함·비인습성이 먼저 읽히는 androgynous presentation',
      silhouette: '긴 비대칭 칼라, 좁은 상체와 넓게 떨어지는 하단 구조',
      palette: ['#D9DDD7', '#30343A', '#78958B'],
      motifs: ['빈 여백', '접힌 문서', '끊긴 문장선'],
      costumeDirection: '연구복과 예복 사이의 구조적 레이어, 장식보다 비대칭 재단 중심',
      prohibitedTropes: ['도서관 사서 클리셰', '안경=지성 단일 기호', '순백 성녀/빙설미인 문법'],
    },
  },
  {
    characterId: 'rahyeon',
    displayName: '라현',
    gender: 'female',
    apparentAgeBand: '30-34',
    origin: '계약·협상·공적 의사결정이 밀집한 상업외교 구역',
    worldRole: '욕망과 선택의 실제 비용을 끝까지 묻는 협상자',
    shortDescriptor: '선택의 대가를 숨기지 않는 성숙한 협상자',
    personalityTraits: ['주도성', '전략성', '높은 자기통제', '위험 감각'],
    values: ['선택의 명료성', '상호 계약', '책임 있는 욕망'],
    flaws: ['불확실성을 직접 묻기보다 시험과 압박으로 확인하려 함'],
    callingBond: {
      authorityState: 'world_dependent',
      note: 'Principle/Calling binding requires separate World and Character authority; legacy Deity mapping is not canonical.',
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: 'mature femme, 매혹보다 통제된 권위와 선택권의 긴장이 먼저 읽힘',
      silhouette: '강한 허리선과 긴 코트, 안정된 삼각형 하단 실루엣',
      palette: ['#4A1727', '#24252A', '#B08B52'],
      motifs: ['문턱', '봉인선', '균형추'],
      costumeDirection: 'tailored formal과 부드러운 소재를 교차해 권위와 유연성을 동시에 표현',
      prohibitedTropes: ['도미나트릭스 클리셰', '악녀형 과장', '부=금장 장식 과잉'],
    },
  },
  {
    characterId: 'mira',
    displayName: '미라',
    gender: 'female',
    apparentAgeBand: '24-28',
    origin: '공방·수리점·주거가 자연스럽게 섞인 제작 생활권',
    worldRole: '말보다 반복되는 생활 행동으로 관계를 유지하는 생활형 동행자',
    shortDescriptor: '티 내지 않고 계속 챙기는 잘생긴 생활형 동행자',
    personalityTraits: ['실용성', '자연스러운 친밀감', '낮은 과장성', '생활 감각'],
    values: ['지속되는 행동', '편안함', '상호 자립'],
    flaws: ['관계를 정의해야 하는 순간을 지나치게 오래 미룸'],
    callingBond: {
      authorityState: 'world_dependent',
      note: 'Principle/Calling binding requires separate World and Character authority; legacy Deity mapping is not canonical.',
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: 'masc-of-center handsome female, 꾸민 티보다 자연스러운 피지컬과 생활감',
      silhouette: '넓은 어깨의 relaxed overshirt와 직선형 팬츠, 낮은 중심의 안정된 자세',
      palette: ['#385647', '#5B7185', '#E1D5C4'],
      motifs: ['수선 자국', '공구 손잡이', '접힌 소매'],
      costumeDirection: '작업복에서 출발한 clean casual, 손을 자유롭게 쓰는 practical layers',
      prohibitedTropes: ['남장여자 오해 클리셰', '과도한 보이시 캐릭터 희화화', 'mechanic pin-up'],
    },
  },
  {
    characterId: 'taegyeom',
    displayName: '태겸',
    gender: 'male',
    apparentAgeBand: '27-31',
    origin: '공공시험·수련·평가 문화가 강한 훈련 구역',
    worldRole: '말이 아니라 반복 가능한 기준과 행동으로 사람을 평가하는 검증자',
    shortDescriptor: '기준을 낮추지 않지만 인정에는 인색하지 않은 냉정한 검증자',
    personalityTraits: ['엄격함', '일관성', '높은 실행력', '절제된 인정'],
    values: ['책임', '반복 가능한 실력', '명확한 기준'],
    flaws: ['망설임과 변명을 너무 빨리 무능 또는 회피로 판단함'],
    callingBond: {
      authorityState: 'world_dependent',
      note: 'Principle/Calling binding requires separate World and Character authority; legacy Deity mapping is not canonical.',
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: 'cold refined male, 장식보다 날카로운 정렬과 절제된 긴장',
      silhouette: '곧은 수직선, 짧은 상의와 긴 하단선, 목과 손목의 정돈된 노출',
      palette: ['#263244', '#707985', '#E7E8EA'],
      motifs: ['눈금', '마모된 금속', '정렬된 선'],
      costumeDirection: '훈련복과 formal tailoring 사이, 기능적 fastening을 디자인 포인트로 사용',
      prohibitedTropes: ['재벌 냉미남 수트 단일화', '군복 fetish', '무표정=무감정 표현'],
    },
  },
  {
    characterId: 'yunho',
    displayName: '윤호',
    gender: 'male',
    apparentAgeBand: '28-33',
    origin: '교육·치유·생활 인프라가 밀집한 공동체 구역',
    worldRole: '의지보다 환경과 루틴을 고쳐 지속 가능성을 만드는 생활 설계자',
    shortDescriptor: '무너지지 않게 생활의 구조부터 같이 고치는 다정한 설계자',
    personalityTraits: ['다정함', '구조화 능력', '안정성', '현실 감각'],
    values: ['지속 가능성', '회복 가능성', '부담의 가시화'],
    flaws: ['감정을 충분히 듣기 전에 해결 구조부터 만들려 함'],
    callingBond: {
      authorityState: 'world_dependent',
      note: 'Principle/Calling binding requires separate World and Character authority; legacy Deity mapping is not canonical.',
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: 'gentle nerd male, 편안함과 전문성이 동시에 읽히는 생활형 지성',
      silhouette: '둥근 상체 레이어, 가벼운 가디건/재킷, 안정된 중간 중심',
      palette: ['#6B7258', '#7B5C45', '#E8DFD1'],
      motifs: ['격자 노트', '작은 클립', '정리된 케이블'],
      costumeDirection: '실제 활동 가능한 knit/utility layers, 안경은 final visual canon으로 채택 제안',
      prohibitedTropes: ['안경 벗으면 미남 반전', '의사 가운 단일화', '돌봄=모성적 남성 희화화'],
    },
  },
  {
    characterId: 'doyun',
    displayName: '도윤',
    gender: 'male',
    apparentAgeBand: '24-28',
    origin: '도시 규칙의 경계와 사각지대에 형성된 비공식 상권',
    worldRole: '굳어진 규칙에 작은 실험과 우회로를 만들어 선택지를 늘리는 공범형 변칙자',
    shortDescriptor: '규칙 사이에 선택할 틈을 만드는 능글맞은 변칙자',
    personalityTraits: ['기민함', '장난기', '높은 상황 적응력', '선택적 진지함'],
    values: ['자유', '수정 가능성', '자발적 공범감'],
    flaws: ['진심과 책임을 농담과 테스트 뒤에 숨김'],
    callingBond: {
      authorityState: 'world_dependent',
      note: 'Principle/Calling binding requires separate World and Character authority; legacy Deity mapping is not canonical.',
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: 'agile rogue male, 가벼운 비대칭과 숨은 디테일로 공범감을 형성',
      silhouette: '한쪽으로 기울어진 레이어, 짧은 재킷과 유연한 하단, 빠른 방향 전환이 읽힘',
      palette: ['#234E70', '#B15F3E', '#25262A'],
      motifs: ['열린 잠금장치', '접힌 지도', '숨은 포켓'],
      costumeDirection: 'urban utility와 playful tailoring 혼합, 가까이 볼수록 디테일이 발견되는 구조',
      prohibitedTropes: ['도둑 캐릭터 클리셰', '광대형 장난꾸러기', '무책임한 바람둥이 단일화'],
    },
  },
  {
    characterId: 'baekheon',
    displayName: '백헌',
    gender: 'male',
    apparentAgeBand: '38-44',
    origin: '재난·분쟁 대응 거점으로 성장한 외곽 관문 생활권',
    worldRole: '위험과 책임의 범위를 정리하고 실제 실행으로 보호하는 베테랑 조정자',
    shortDescriptor: '흔들리지 않되 남의 선택까지 대신하려는 위험을 가진 베테랑',
    personalityTraits: ['침착함', '실행력', '넓은 책임 감각', '경험에서 오는 절제'],
    values: ['보호', '감당', '명확한 책임 범위'],
    flaws: ['책임을 대신 짊어지며 타인의 선택까지 결정하려 함'],
    callingBond: {
      authorityState: 'world_dependent',
      note: 'Principle/Calling binding requires separate World and Character authority; legacy Deity mapping is not canonical.',
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: 'mature veteran male, 미형보다 경험·체격·안정된 권위가 먼저 읽힘',
      silhouette: '넓은 상체, 긴 외투, 무게 중심이 낮고 움직임이 적어도 공간을 점유하는 형태',
      palette: ['#4B211F', '#3A3028', '#A8875A'],
      motifs: ['마모된 버팀대', '수선된 가죽', '오래된 문턱'],
      costumeDirection: 'formal보다 오래 사용한 고급 실용복, 장비 흔적은 있으나 군복화하지 않음',
      prohibitedTropes: ['마피아 보스', '군인 fetish', 'daddy 밈 과잉', '흉터=경험 단일 기호'],
    },
  },
] as const satisfies readonly CharacterImmutableAuthoringV1Definition[];
