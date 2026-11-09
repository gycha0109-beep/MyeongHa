/** Approved customer-facing catalog, transcribed from the 2026-11-06 decision. */
export interface ApprovedSajuOfferV1 {
  readonly id: string;
  readonly title: string;
  readonly priceKrw: number;
  readonly type: 'single' | 'comparison' | 'package';
  readonly includes?: readonly string[];
}

export const APPROVED_SAJU_CATALOG_V1: readonly ApprovedSajuOfferV1[] = Object.freeze([
  { id: 'career', title: '직업·커리어운', priceKrw: 9900, type: 'single' },
  { id: 'business', title: '사업운', priceKrw: 9900, type: 'single' },
  { id: 'wealth', title: '재물운', priceKrw: 9900, type: 'single' },
  { id: 'relationship', title: '나의 인연·관계운', priceKrw: 9900, type: 'single' },
  { id: 'year', title: '올해의 사주', priceKrw: 7900, type: 'single' },
  { id: 'month', title: '이번 달의 사주', priceKrw: 4900, type: 'single' },
  { id: 'first-counterpart', title: '첫 번째 상대방과 관계 비교', priceKrw: 12900, type: 'comparison' },
  { id: 'additional-counterpart', title: '두 번째 이후 상대방 1명당', priceKrw: 9900, type: 'comparison' },
  { id: 'relationship-plus-first', title: '나의 인연·관계운 + 첫 관계 비교', priceKrw: 19900, type: 'comparison' },
  { id: 'career-economy', title: '커리어·경제 패키지', priceKrw: 24900, type: 'package', includes: ['직업·커리어운', '사업운', '재물운'] },
  { id: 'basic', title: '전체 사주 기본', priceKrw: 29900, type: 'package', includes: ['직업·커리어운', '사업운', '재물운', '나의 인연·관계운'] },
  { id: 'basic-year', title: '전체 사주 + 올해', priceKrw: 35800, type: 'package', includes: ['전체 사주 기본', '올해의 사주'] },
  { id: 'basic-month', title: '전체 사주 + 이번 달', priceKrw: 33800, type: 'package', includes: ['전체 사주 기본', '이번 달의 사주'] },
  { id: 'basic-year-month', title: '전체 사주 + 올해 + 이번 달', priceKrw: 39700, type: 'package', includes: ['전체 사주 기본', '올해의 사주', '이번 달의 사주'] },
]);

export const APPROVED_SAJU_CATALOG_GROUPS_V1 = Object.freeze([
  { id: 'single', title: '단품 6종' },
  { id: 'comparison', title: '관계 비교 상품' },
  { id: 'package', title: '패키지 5종' },
] as const);
