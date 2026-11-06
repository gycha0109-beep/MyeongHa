import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMERCE_SAJU_PRODUCTS_V1 } from './commerce-saju-upgrade-pricing-v1.js';

/**
 * One immutable candidate collision inventory MUST match the already reviewed
 * Saju quote product fields. This is pending-checkout arbitration only and
 * must not be promoted to Entitlement/Capability granting authority.
 */
const candidate = readFileSync(
  new URL('../../../docs/operations/candidates/commerce_saju_record_verified_purchase_ledger_v1.sql',
    import.meta.url),
  'utf8',
);
const start = candidate.indexOf('create function public.internal_commerce_saju_candidate_overlap_fields_v1(');
const end = candidate.indexOf('$saju_overlap_fields$;', start);
if (start < 0 || end <= start) throw Error('SAJU_PENDING_COLLISION_POLICY_FUNCTION_MISSING');
const fragment = candidate.slice(start, end);
const mapping = new Map(
  [...fragment.matchAll(/when '([^']+)' then array\[([^\]]+)\]::text\[\]/gu)]
    .map(match => [
      match[1]!,
      [...match[2]!.matchAll(/'([^']+)'/gu)].map(value => value[1]!),
    ]),
);

describe('Saju pending product overlap candidate follows approved quote fields', () => {
  it('exactly pins the 10 singles and 3 bundles, with no invented rights', () => {
    expect(mapping.size).toBe(13);
    expect([...mapping.keys()].sort()).toEqual(
      Object.keys(COMMERCE_SAJU_PRODUCTS_V1).sort(),
    );
    for (const [productKey, policy] of Object.entries(COMMERCE_SAJU_PRODUCTS_V1)) {
      expect(mapping.get(productKey)).toEqual([...policy.fields]);
    }
  });

  it('rejects unknown product keys, scopes same record, and locks before inspecting pendings', () => {
    expect(fragment).toContain('else null::text[]');
    const guard = candidate.slice(candidate.indexOf(
      'create or replace function public.tr_commerce_saju_origin_revision_lock_v1()',
    ));
    expect(guard).toContain('for update');
    expect(guard).toContain("transaction_isolation') <> 'read committed'");
    expect(guard).toContain("prior.saju_record_id=new.saju_record_id");
    expect(guard).toContain("prior.birth_revision_id=new.birth_revision_id");
    expect(guard).toContain("prior_pi.status in ('created','pending')");
    expect(guard).toContain('&& v_new_fields');
    expect(guard).toContain("SAJU_OVERLAPPING_PENDING_PRODUCT");
    expect(guard).toContain("SAJU_DUPLICATE_PENDING_SAME_PRODUCT");
    expect(guard).toContain("SAJU_PENDING_PRODUCT_FIELDS_UNAVAILABLE");
    expect(candidate).not.toContain('grant execute on function public.internal_commerce_saju_candidate_overlap_fields_v1');
    expect(candidate).toContain(
      'revoke all on function public.internal_commerce_saju_candidate_overlap_fields_v1(text)',
    );
  });

  it('holds overlapping fields and permits disjoint singles by the existing policy', () => {
    function overlaps(a: string, b: string) {
      return mapping.get(a)!.some(field => mapping.get(b)!.includes(field));
    }
    expect(overlaps('standard.love_relationship', 'bundle.love_relationship')).toBe(true);
    expect(overlaps('standard.career', 'bundle.career_economy')).toBe(true);
    expect(overlaps('bundle.full_saju', 'standard.family')).toBe(true);
    expect(overlaps('standard.love_relationship', 'standard.career')).toBe(false);
    expect(overlaps('standard.year', 'standard.month')).toBe(false);
  });
});
