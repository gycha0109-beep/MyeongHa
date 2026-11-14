export {
  APPROVED_SAJU_CATALOG_V1,
  getApprovedSajuOfferV1,
  type ApprovedSajuOfferV1,
} from '../../../../packages/contracts/src/approved-saju-catalog.js';

export const APPROVED_SAJU_CATALOG_GROUPS_V1 = Object.freeze([
  { id: 'single', title: '단품 6종' },
  { id: 'comparison', title: '관계 비교 상품' },
  { id: 'package', title: '패키지 5종' },
] as const);
