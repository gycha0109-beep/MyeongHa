import {
  SAJU_READING_COMPONENTS_V1,
  type SajuReadingComponentV1,
} from '../../contracts/src/approved-saju-catalog.js';

export const SAJU_PRODUCT_CHAPTER_BLUEPRINT_VERSION_V1 =
  'myeongha-notion-character-product-chapters-v1' as const;

export interface SajuProductChapterBlueprintV1 {
  readonly chapterId: string;
  readonly fixedTitle: string;
  readonly purpose: string;
  readonly special: boolean;
}

const CHAPTER_TITLES: Readonly<Record<SajuReadingComponentV1, readonly [string, string, string, string, ...string[]]>> = {
  career: [
    '타고난 일복은 어떨까?',
    '당신이 가진 무기',
    '직장이라는 세상에서',
    '일이 뜻대로 풀리지 않을 때',
    '나만의 직업 이야기 — 특별 심층 장',
    '어떤 길을 선택해야 할까?',
  ],
  business: [
    '장사할 팔자인가?',
    '무엇을 팔아야 돈이 될까?',
    '혼자 할까, 함께할까?',
    '사업이 흔들리는 순간',
    '당신 사업운의 승부처 — 특별 심층 장',
    '오래가는 사업을 하려면',
  ],
  wealth: [
    '돈복을 타고났을까?',
    '돈은 어디에서 들어오는가',
    '버는 돈과 남는 돈',
    '돈이 새어나가는 곳',
    '당신의 특별한 돈 이야기 — 특별 심층 장',
    '결국 돈을 남기는 사람은',
  ],
  relationship: [
    '타고난 인연복',
    '마음을 주는 방식',
    '어떤 사람과 잘 맞을까?',
    '가까워질수록 생기는 문제',
    '내 인연에서 가장 중요한 것 — 특별 심층 장',
    '좋은 인연을 오래 지키려면',
  ],
  year: [
    '올해는 어떤 해일까?',
    '일과 돈의 흐름',
    '사람과 마음의 흐름',
    '언제 움직이고, 언제 기다릴까?',
    '올해 놓치지 말아야 할 것',
  ],
  month: [
    '이번 달은 어떤 달일까?',
    '이번 달 찾아오는 기회',
    '이번 달 조심할 일',
    '이번 달을 잘 보내는 법',
  ],
  compatibility: [
    '두 사람의 인연은 어떨까?',
    '서로에게 끌리는 이유',
    '함께할 때 좋은 점',
    '왜 자꾸 엇갈릴까?',
    '두 사람 사이의 결정적 변수 — 특별 심층 장',
    '이 인연을 이어가려면',
  ],
} as const;

const PURPOSE: Readonly<Record<SajuReadingComponentV1, readonly string[]>> = {
  career: ['일의 기본 구조', '승인된 업무상의 강점', '직장·책임의 작동', '실제 긴장·제약', '개인별 복합 구조', '이미 확인된 판단의 종합'],
  business: ['사업 기반 구조', '승인된 산출·교환 해석', '협력·조율', '사업상의 긴장·제약', '개인별 복합 구조', '운영 기준의 종합'],
  wealth: ['재물의 중심 구조', '산출·교환의 작동', '자원 관리와 책임', '비용·가치의 긴장', '개인별 복합 구조', '상충과 선택의 종합'],
  relationship: ['관계 기반 구조', '표현과 마음 전달', '관계의 적합 조건', '갈등·긴장', '개인별 복합 구조', '관계 선택의 종합'],
  year: ['확인된 연간 주제', '연간 일·자원 해석', '연간 관계·감정 해석', '확인된 연간 시기 조건', '연간 결론과 유보'],
  month: ['확인된 월간 주제', '해당 월에 승인된 기회 해석', '해당 월에 승인된 긴장·주의 해석', '월간 결론과 유보'],
  compatibility: ['두 명식의 관계 구조', '상호 끌림의 승인 근거', '함께할 때의 보완', '서로 엇갈리는 근거', '두 명식의 특별 복합 구조', '관계 선택의 종합'],
};

export const NOTION_SAJU_PRODUCT_CHAPTER_BLUEPRINTS_V1: Readonly<
  Record<SajuReadingComponentV1, readonly SajuProductChapterBlueprintV1[]>
> = Object.freeze(
  Object.fromEntries(
    (Object.keys(SAJU_READING_COMPONENTS_V1) as SajuReadingComponentV1[]).map((component) => {
      const titles = CHAPTER_TITLES[component];
      return [component, Object.freeze(titles.map((fixedTitle, index) => Object.freeze({
        chapterId: `${component}-${String(index + 1).padStart(2, '0')}`,
        fixedTitle,
        purpose: PURPOSE[component][index]!,
        special: fixedTitle.includes('특별 심층 장'),
      })))];
    }),
  ) as Record<SajuReadingComponentV1, readonly SajuProductChapterBlueprintV1[]>,
);

export function getSajuProductChapterBlueprintV1(
  component: SajuReadingComponentV1,
): readonly SajuProductChapterBlueprintV1[] {
  return NOTION_SAJU_PRODUCT_CHAPTER_BLUEPRINTS_V1[component];
}
