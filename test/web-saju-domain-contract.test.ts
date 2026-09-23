import { describe, expect, it } from 'vitest';

import { SAJU_DOMAINS } from '../packages/contracts/src/index.js';
import {
  SAJU_DOMAINS_V1,
  normalizeSajuDomainV1,
} from '../apps/web/saju-domain-contract.js';

describe('web Saju domain contract', () => {
  it('stays exactly aligned with the canonical shared SajuDomain registry', () => {
    expect(SAJU_DOMAINS_V1).toEqual(SAJU_DOMAINS);
  });

  it('normalizes only canonical SajuDomain values', () => {
    expect(normalizeSajuDomainV1(' career ')).toBe('career');
    expect(normalizeSajuDomainV1('general')).toBe('general');
    expect(normalizeSajuDomainV1('annual')).toBeNull();
    expect(normalizeSajuDomainV1('monthly')).toBeNull();
    expect(normalizeSajuDomainV1('general_natal')).toBeNull();
    expect(normalizeSajuDomainV1(null)).toBeNull();
  });
});
