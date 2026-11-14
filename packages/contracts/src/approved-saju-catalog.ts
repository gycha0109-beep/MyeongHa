/**
 * Customer catalog approved on 2026-11-06.
 * An offer describes required readings; it does not authorize a charge or grant.
 */
export const SAJU_READING_COMPONENTS_V1 = Object.freeze({
  career: { domain: 'career', temporalScope: 'natal', text: '직업운' },
  business: { domain: 'business', temporalScope: 'natal', text: '사업운' },
  wealth: { domain: 'wealth', temporalScope: 'natal', text: '재물운' },
  relationship: {
    domain: 'relationship', temporalScope: 'natal', relationshipScope: 'general', text: '연애운',
  },
  year: { domain: 'general', temporalScope: 'annual', text: '올해' },
  month: { domain: 'general', temporalScope: 'monthly', text: '이번 달' },
  compatibility: { domain: 'compatibility', temporalScope: 'natal', text: '궁합' },
} as const);

export type SajuReadingComponentV1 = keyof typeof SAJU_READING_COMPONENTS_V1;

const careerEconomy = ['career', 'business', 'wealth'] as const;
const basic = [...careerEconomy, 'relationship'] as const;

interface SajuOfferDefinitionV1 {
  readonly id: string;
  readonly title: string;
  readonly priceKrw: number;
  readonly type: 'single' | 'comparison' | 'package';
  readonly components: readonly SajuReadingComponentV1[];
  readonly includes?: readonly string[];
  readonly counterpartOrder?: 'first' | 'additional';
}

const offers = [
  { id: 'career', title: '직업·커리어운', priceKrw: 9900, type: 'single', components: ['career'] },
  { id: 'business', title: '사업운', priceKrw: 9900, type: 'single', components: ['business'] },
  { id: 'wealth', title: '재물운', priceKrw: 9900, type: 'single', components: ['wealth'] },
  { id: 'relationship', title: '나의 인연·관계운', priceKrw: 9900, type: 'single', components: ['relationship'] },
  { id: 'year', title: '올해의 사주', priceKrw: 7900, type: 'single', components: ['year'] },
  { id: 'month', title: '이번 달의 사주', priceKrw: 4900, type: 'single', components: ['month'] },
  { id: 'first-counterpart', title: '첫 번째 상대방과 관계 비교', priceKrw: 12900, type: 'comparison', components: ['compatibility'], counterpartOrder: 'first' },
  { id: 'additional-counterpart', title: '두 번째 이후 상대방 1명당', priceKrw: 9900, type: 'comparison', components: ['compatibility'], counterpartOrder: 'additional' },
  { id: 'relationship-plus-first', title: '나의 인연·관계운 + 첫 관계 비교', priceKrw: 19900, type: 'comparison', components: ['relationship', 'compatibility'], counterpartOrder: 'first' },
  { id: 'career-economy', title: '커리어·경제 패키지', priceKrw: 24900, type: 'package', components: careerEconomy, includes: careerEconomy },
  { id: 'basic', title: '전체 사주 기본', priceKrw: 29900, type: 'package', components: basic, includes: basic },
  { id: 'basic-year', title: '전체 사주 + 올해', priceKrw: 35800, type: 'package', components: [...basic, 'year'], includes: ['basic', 'year'] },
  { id: 'basic-month', title: '전체 사주 + 이번 달', priceKrw: 33800, type: 'package', components: [...basic, 'month'], includes: ['basic', 'month'] },
  { id: 'basic-year-month', title: '전체 사주 + 올해 + 이번 달', priceKrw: 39700, type: 'package', components: [...basic, 'year', 'month'], includes: ['basic', 'year', 'month'] },
] as const satisfies readonly SajuOfferDefinitionV1[];

export type ApprovedSajuOfferIdV1 = typeof offers[number]['id'];

export interface ApprovedSajuOfferV1 extends SajuOfferDefinitionV1 {
  readonly id: ApprovedSajuOfferIdV1;
  readonly includes?: readonly ApprovedSajuOfferIdV1[];
}

export const APPROVED_SAJU_CATALOG_V1: readonly ApprovedSajuOfferV1[] = Object.freeze(
  offers.map((offer: ApprovedSajuOfferV1) => Object.freeze({
    ...offer,
    components: Object.freeze([...offer.components]),
    ...(offer.includes === undefined ? {} : { includes: Object.freeze([...offer.includes]) }),
  })),
);

export function getApprovedSajuOfferV1(id: string): ApprovedSajuOfferV1 | undefined {
  return APPROVED_SAJU_CATALOG_V1.find((offer) => offer.id === id);
}
