import { describe, expect, it, vi } from 'vitest';
import { SAJU_DOMAINS, type SajuDomain } from '../packages/contracts/src/index.js';
import {
  OFFICIAL_READER_RUNTIME_IDS_V1,
  READER_RUNTIME_PUBLIC_ACTIVATED_V1,
  resolveReaderRuntimeRolloutCandidateV1,
} from '../apps/api/src/reader-production-rollout-policy-v1.js';
import {
  assessProductReaderEligibilityV1,
  resolveProductReaderEligibilityV1,
  type ProductReaderEligibilityAuthorityPortV1,
  type ProductReaderEligibilitySourceV1,
  type ProductReaderRuleLookupV1,
} from '../apps/api/src/product-reader-eligibility-policy-v1.js';

const SOURCE: ProductReaderEligibilitySourceV1 = Object.freeze({
  productId: 'synthetic-product-not-on-sale',
  productSpecVersion: 'synthetic-product-spec-v1',
  sajuDomain: 'general',
});
const EFFECTIVE_AT = '2026-10-09T07:00:00.000Z';

function sourceFor(domain: SajuDomain): ProductReaderEligibilitySourceV1 {
  return { ...SOURCE, sajuDomain: domain };
}

function approvedStandard(source: ProductReaderEligibilitySourceV1 = SOURCE):
  ProductReaderRuleLookupV1 {
  return {
    status: 'approved',
    rule: {
      kind: 'standard_all_readers',
      ...source,
      ruleVersion: 'synthetic-reader-policy-v1',
      approvedPolicyRevision: 'synthetic-review-only-v1',
    },
  };
}

function approvedPremium(
  ids: readonly (typeof OFFICIAL_READER_RUNTIME_IDS_V1)[number][],
  source: ProductReaderEligibilitySourceV1 = SOURCE,
): ProductReaderRuleLookupV1 {
  return {
    status: 'approved',
    rule: {
      kind: 'premium_restricted',
      ...source,
      ruleVersion: 'synthetic-premium-policy-v1',
      approvedPolicyRevision: 'synthetic-review-only-v1',
      allowedReaderIds: ids,
    },
  };
}

describe('A1 Product × Reader eligibility (no grants, checkout or public activation)', () => {
  it.each(SAJU_DOMAINS)('all official Readers are eligible for approved synthetic %s standard Saju', (domain) => {
    const source = sourceFor(domain);
    for (const reader of OFFICIAL_READER_RUNTIME_IDS_V1) {
      expect(assessProductReaderEligibilityV1({
        source,
        serverReaderId: reader,
        lookup: approvedStandard(source),
      })).toEqual({
        status: 'eligible',
        readerCharacterId: reader,
        productId: SOURCE.productId,
        ruleVersion: 'synthetic-reader-policy-v1',
        approvedPolicyRevision: 'synthetic-review-only-v1',
      });
    }
  });

  it('uses canonical Reader identities, not a manually duplicated allowlist', () => {
    expect(OFFICIAL_READER_RUNTIME_IDS_V1).toHaveLength(9);
    const statuses = OFFICIAL_READER_RUNTIME_IDS_V1.map((reader) =>
      assessProductReaderEligibilityV1({
        source: SOURCE, serverReaderId: reader, lookup: approvedStandard(),
      }).status);
    expect(statuses).toEqual(Array(OFFICIAL_READER_RUNTIME_IDS_V1.length).fill('eligible'));
  });

  it('does not turn product eligibility into public or internal Reader rollout approval', () => {
    expect(assessProductReaderEligibilityV1({
      source: SOURCE, serverReaderId: 'baekheon', lookup: approvedStandard(),
    }).status).toBe('eligible');
    expect(resolveReaderRuntimeRolloutCandidateV1('baekheon').status).toBe('withheld');
    expect(READER_RUNTIME_PUBLIC_ACTIVATED_V1).toBe(false);
  });

  it.each(['unclassified', 'disabled', 'stale', 'invalid_policy'] as const)(
    'rejects %s Product authority responses', (reason) => {
      expect(assessProductReaderEligibilityV1({
        source: SOURCE, serverReaderId: 'seyeon',
        lookup: { status: 'withheld', reason },
      })).toEqual({ status: 'withheld', reason });
    },
  );

  it.each([
    '', 'SEYEON', 'unauthorized_reader', null, undefined, 4,
  ])('rejects unknown/invalid Reader %s', (serverReaderId) => {
    expect(assessProductReaderEligibilityV1({
      source: SOURCE, serverReaderId, lookup: approvedStandard(),
    })).toEqual({ status: 'withheld', reason: 'unknown_reader' });
  });

  it('rejects every source parity mismatch, without treating text labels as approval', () => {
    for (const mismatch of [
      { ...SOURCE, productId: 'synthetic-other-product' },
      { ...SOURCE, productSpecVersion: 'different-spec-v99' },
      { ...SOURCE, sajuDomain: 'wealth' as const },
    ]) {
      expect(assessProductReaderEligibilityV1({
        source: mismatch, serverReaderId: 'seyeon', lookup: approvedStandard(),
      })).toEqual({ status: 'withheld', reason: 'policy_source_mismatch' });
    }
    expect(assessProductReaderEligibilityV1({
      source: { ...SOURCE, productId: 'standard.love_relationship' },
      serverReaderId: 'seyeon',
      lookup: { status: 'withheld', reason: 'unclassified' },
    })).toEqual({ status: 'withheld', reason: 'unclassified' });
  });

  it('grants product eligibility only for explicit synthetic premium Reader IDs', () => {
    expect(assessProductReaderEligibilityV1({
      source: SOURCE, serverReaderId: 'seyeon',
      lookup: approvedPremium(['seyeon', 'taegyeom']),
    }).status).toBe('eligible');
    expect(assessProductReaderEligibilityV1({
      source: SOURCE, serverReaderId: 'baekheon',
      lookup: approvedPremium(['seyeon', 'taegyeom']),
    })).toEqual({ status: 'withheld', reason: 'reader_excluded' });
  });

  it.each([
    { allowedReaderIds: [] },
    { allowedReaderIds: ['seyeon', 'seyeon'] },
    { allowedReaderIds: ['unknown'] },
    { allowedReaderIds: ['seyeon', 'unknown'] },
  ])('denies malformed premium allowlists $allowedReaderIds', ({ allowedReaderIds }) => {
    const rule = {
      ...((approvedPremium(['seyeon']) as Extract<ProductReaderRuleLookupV1, { status: 'approved' }>).rule),
      allowedReaderIds,
    };
    expect(assessProductReaderEligibilityV1({
      source: SOURCE, serverReaderId: 'seyeon',
      lookup: { status: 'approved', rule },
    })).toEqual({ status: 'withheld', reason: 'invalid_policy' });
  });

  it('denies malformed, unapproved and caller-injected policies', () => {
    const approved = approvedStandard() as Extract<
      ProductReaderRuleLookupV1, { status: 'approved' }>;
    for (const lookup of [
      null,
      { status: 'approved' },
      { status: 'withheld', reason: 'unknown_reason' },
      { ...approved, rule: { ...approved.rule, approvedPolicyRevision: '' } },
      { ...approved, rule: { ...approved.rule, ruleVersion: '  ' } },
      { ...approved, rule: { ...approved.rule, allowedReaderIds: ['seyeon'] } },
      { ...approved, rule: { ...approved.rule, kind: 'premium_restricted' } },
      { ...approved, rule: { ...approved.rule, kind: 'standard_all_readers', approval: false } },
      { status: 'approved', rule: { ...approved.rule, sajuDomain: 'not-a-domain' } },
      { status: 'approved', rule: { ...approved.rule, productId: ' ' } },
    ]) {
      expect(assessProductReaderEligibilityV1({
        source: SOURCE, serverReaderId: 'seyeon', lookup,
      }).status).toBe('withheld');
    }
  });

  it('denies invalid official source without authority lookup', async () => {
    const authorityPort = { readApprovedRule: vi.fn(async (_input: Readonly<ProductReaderEligibilitySourceV1 & { effectiveAt: string }>) => approvedStandard()) };
    for (const source of [
      { ...SOURCE, productId: '' },
      { ...SOURCE, productSpecVersion: 'bad ' },
      { ...SOURCE, sajuDomain: 'fake-domain' },
      { ...SOURCE, readingVariant: 'standard' },
    ]) {
      expect((await resolveProductReaderEligibilityV1({
        source, serverReaderId: 'seyeon', effectiveAt: EFFECTIVE_AT, authorityPort,
      })).status).toBe('withheld');
    }
    expect(authorityPort.readApprovedRule).not.toHaveBeenCalled();
  });

  it('does not consult Product authority for an unknown Reader or invalid time', async () => {
    const authorityPort = { readApprovedRule: vi.fn(async (_input: Readonly<ProductReaderEligibilitySourceV1 & { effectiveAt: string }>) => approvedStandard()) };
    const unknownReader = await resolveProductReaderEligibilityV1({
      source: SOURCE, serverReaderId: 'attacker', effectiveAt: EFFECTIVE_AT, authorityPort,
    });
    expect(unknownReader).toEqual({ status: 'withheld', reason: 'unknown_reader' });
    const badClock = await resolveProductReaderEligibilityV1({
      source: SOURCE, serverReaderId: 'seyeon', effectiveAt: 'yesterday', authorityPort,
    });
    expect(badClock).toEqual({ status: 'withheld', reason: 'invalid_source' });
    expect(authorityPort.readApprovedRule).not.toHaveBeenCalled();
  });

  it('reads only server-owned Product metadata and effective time from the authority port', async () => {
    const authorityPort = { readApprovedRule: vi.fn(async (_input: Readonly<ProductReaderEligibilitySourceV1 & { effectiveAt: string }>) => approvedStandard()) };
    const result = await resolveProductReaderEligibilityV1({
      source: SOURCE, serverReaderId: 'seyeon', effectiveAt: EFFECTIVE_AT, authorityPort,
    });
    expect(result.status).toBe('eligible');
    expect(authorityPort.readApprovedRule).toHaveBeenCalledOnce();
    expect(authorityPort.readApprovedRule).toHaveBeenCalledWith({
      ...SOURCE, effectiveAt: EFFECTIVE_AT,
    });
    expect(authorityPort.readApprovedRule.mock.calls[0]?.[0]).not.toHaveProperty('subjectId');
    expect(authorityPort.readApprovedRule.mock.calls[0]?.[0]).not.toHaveProperty('readerCharacterId');
    expect(result).not.toHaveProperty('entitlement');
    expect(result).not.toHaveProperty('grant');
    expect(result).not.toHaveProperty('publicActivated');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('fails closed if Product authority times out, throws or returns an untrusted shape', async () => {
    const authorityPort = {
      readApprovedRule: vi.fn(async () => { throw new Error('backend is down'); }),
    };
    expect(await resolveProductReaderEligibilityV1({
      source: SOURCE, serverReaderId: 'seyeon', effectiveAt: EFFECTIVE_AT,
      authorityPort,
    })).toEqual({ status: 'withheld', reason: 'policy_unavailable' });

    const malformedAuthority = {
      readApprovedRule: vi.fn(async () => (
        { status: 'approved', rule: { ...SOURCE, kind: 'standard_all_readers' } }
      )) as unknown as ProductReaderEligibilityAuthorityPortV1['readApprovedRule'],
    };
    expect(await resolveProductReaderEligibilityV1({
      source: SOURCE, serverReaderId: 'seyeon', effectiveAt: EFFECTIVE_AT,
      authorityPort: malformedAuthority,
    })).toEqual({ status: 'withheld', reason: 'invalid_policy' });
  });
});
