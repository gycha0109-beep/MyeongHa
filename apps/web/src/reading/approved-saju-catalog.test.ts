import { describe, expect, it } from 'vitest';
import { APPROVED_SAJU_CATALOG_GROUPS_V1, APPROVED_SAJU_CATALOG_V1 } from './approved-saju-catalog.js';

describe('approved Saju catalog', () => {
  it('contains the approved 6 singles, 3 comparison offers, and 5 packages at their approved prices', () => {
    expect(APPROVED_SAJU_CATALOG_GROUPS_V1.map((group) => group.id)).toEqual(['single', 'comparison', 'package']);
    expect(APPROVED_SAJU_CATALOG_V1.map(({ id, priceKrw }) => [id, priceKrw])).toEqual([
      ['career', 9900], ['business', 9900], ['wealth', 9900], ['relationship', 9900], ['year', 7900], ['month', 4900],
      ['first-counterpart', 12900], ['additional-counterpart', 9900], ['relationship-plus-first', 19900],
      ['career-economy', 24900], ['basic', 29900], ['basic-year', 35800], ['basic-month', 33800], ['basic-year-month', 39700],
    ]);
  });

  it('keeps package contents tied to the approved component readings', () => {
    expect(APPROVED_SAJU_CATALOG_V1.find(({ id }) => id === 'career-economy')?.includes)
      .toEqual(['직업·커리어운', '사업운', '재물운']);
    expect(APPROVED_SAJU_CATALOG_V1.find(({ id }) => id === 'basic')?.includes)
      .toEqual(['직업·커리어운', '사업운', '재물운', '나의 인연·관계운']);
  });
});
