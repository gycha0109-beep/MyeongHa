// Shared official Reading domain presentation; not a Product, Offer or purchase entitlement.
export const SAJU_DOMAIN_PRESENTATION_V1 = Object.freeze({
  general: Object.freeze({ icon: '命', title: '전체 사주' }),
  family: Object.freeze({ icon: '家', title: '가족' }),
  relationship: Object.freeze({ icon: '緣', title: '관계' }),
  compatibility: Object.freeze({ icon: '合', title: '궁합' }),
  career: Object.freeze({ icon: '職', title: '직업 · 커리어' }),
  business: Object.freeze({ icon: '商', title: '사업' }),
  wealth: Object.freeze({ icon: '財', title: '재물' }),
  life_stage: Object.freeze({ icon: '生', title: '삶의 단계' }),
  question_specific: Object.freeze({ icon: '問', title: '지금 고민으로 보기' }),
});

const FALLBACK = Object.freeze({ icon: '命', title: '사주 풀이' });

export function readingDomainPresentationV1(domain) {
  return Object.hasOwn(SAJU_DOMAIN_PRESENTATION_V1, domain)
    ? SAJU_DOMAIN_PRESENTATION_V1[domain] : FALLBACK;
}
