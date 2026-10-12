import { describe, expect, it } from 'vitest';
import { assessStandardReaderV2BinderPolicyCandidateV1 } from
  '../apps/api/src/postgres-standard-reader-v2-bind-policy-preflight-v1.js';

const request = Object.freeze({
  resolvedSubjectId: '11390000-0000-0000-0000-000000000001',
  productId: '11392000-0000-0000-0000-000000000001',
  readerCharacterId: 'baekheon',
});
const selected = Object.freeze({
  productId: request.productId,
  readerCharacterId: request.readerCharacterId,
  readerContentBundleId: '11391000-0000-0000-0000-000000000001',
  specVersion: 'v1',
  topicKey: 'test_reader_topic',
});
const scope = Object.freeze({
  productId: request.productId,
  productSpecVersion: 'v1',
  sajuDomain: 'relationship',
  effectiveAt: '2026-10-12T00:00:00.000Z',
});
const approvedStandard = Object.freeze({
  status: 'approved' as const,
  rule: Object.freeze({
    kind: 'standard_all_readers' as const,
    productId: request.productId,
    productSpecVersion: 'v1',
    sajuDomain: 'relationship' as const,
    ruleVersion: 'synthetic-v1',
    approvedPolicyRevision: 'synthetic-revision-v1',
  }),
});
const input = Object.freeze({ request, selected, scope, lookup: approvedStandard });

describe('D-01 / CAP-B Standard Reader v2 binder policy preflight', () => {
  it('classifies Standard Reader without any specialist capability field', () => {
    expect(assessStandardReaderV2BinderPolicyCandidateV1(input)).toEqual({
      status: 'standard_candidate',
      productId: request.productId,
      productSpecVersion: 'v1',
      sajuDomain: 'relationship',
      readerCharacterId: 'baekheon',
      readerContentBundleId: selected.readerContentBundleId,
      approvedPolicyRevision: approvedStandard.rule.approvedPolicyRevision,
      ruleVersion: 'synthetic-v1',
    });
  });

  it('withholds missing rules, invalid or changed Product scope and forged Reader', () => {
    const cases = [
      { ...input, lookup: { status: 'withheld', reason: 'unclassified' } as const },
      { ...input, scope: { ...scope, productSpecVersion: 'v2' } },
      { ...input, selected: null },
      { ...input, request: { ...request, readerCharacterId: 'not-a-reader' } },
      { ...input, request: { ...request, resolvedSubjectId: 'other' } },
      { ...input, lookup: {
        status: 'approved' as const,
        rule: { ...approvedStandard.rule, sajuDomain: 'wealth' as const },
      } },
    ];
    for (const candidate of cases) {
      expect(assessStandardReaderV2BinderPolicyCandidateV1(candidate).status).toBe('withheld');
    }
  });

  it('keeps premium explicitly HOLD even for allowlisted real specialist Reader', () => {
    const premium = {
      status: 'approved' as const,
      rule: {
        ...approvedStandard.rule,
        kind: 'premium_restricted' as const,
        allowedReaderIds: ['baekheon' as const],
      },
    };
    expect(assessStandardReaderV2BinderPolicyCandidateV1({
      ...input, lookup: premium,
    })).toEqual({ status: 'withheld', reason: 'premium_hold' });

    expect(assessStandardReaderV2BinderPolicyCandidateV1({
      ...input,
      lookup: { ...premium, rule: { ...premium.rule, allowedReaderIds: ['seyeon' as const] } },
    })).toEqual({ status: 'withheld', reason: 'policy_unavailable' });
  });

  it('contains no grant, binding, canInitiate, sale or public disclosure authority', () => {
    const result = assessStandardReaderV2BinderPolicyCandidateV1(input);
    expect(result).not.toHaveProperty('entitlementGrantId');
    expect(result).not.toHaveProperty('purchaseIntentId');
    expect(result).not.toHaveProperty('canInitiate');
    expect(result).not.toHaveProperty('replayed');
    expect(result).not.toHaveProperty('readingId');
    expect(result).not.toHaveProperty('releaseApproved');
  });
});
