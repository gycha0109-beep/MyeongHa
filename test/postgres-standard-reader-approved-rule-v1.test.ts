import { describe, expect, it, vi } from 'vitest';
import { createPostgresApprovedStandardReaderRuleAuthorityPortV1 } from
  '../apps/api/src/postgres-standard-reader-approved-rule-v1.js';
import { resolveProductReaderEligibilityV1 } from
  '../apps/api/src/product-reader-eligibility-policy-v1.js';

const SOURCE = Object.freeze({
  productId: '00000000-0000-4000-8000-000000000001',
  productSpecVersion: 'v1',
  sajuDomain: 'relationship' as const,
  effectiveAt: '2026-10-12T04:00:00.000Z',
});
const approvedRow = Object.freeze({
  productId: SOURCE.productId, productSpecVersion: SOURCE.productSpecVersion,
  sajuDomain: SOURCE.sajuDomain,
  ruleVersion: 'synthetic-only-v1',
  approvedPolicyRevision: 'synthetic-only-revision',
  kind: 'standard_all_readers', allowedReaderIds: null,
});

function testPort(rows: unknown[]) {
  const query = vi.fn(async (_sql: string, _args: readonly unknown[] = []) => ({ rows }));
  return {
    port: createPostgresApprovedStandardReaderRuleAuthorityPortV1({
      query: query as never,
    }), query,
  };
}

describe('D-01 private PostgreSQL-approved Reader rule source', () => {
  it('withholds an unseeded Product without inventing a standard rule', async () => {
    const { port, query } = testPort([]);
    expect(await port.readApprovedRule(SOURCE)).toEqual({
      status: 'withheld', reason: 'unclassified',
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('preserves exact Product, spec, domain and DB timestamp query', async () => {
    const { port, query } = testPort([approvedRow]);
    expect(await port.readApprovedRule(SOURCE)).toEqual({
      status: 'approved', rule: {
        productId: SOURCE.productId,
        productSpecVersion: SOURCE.productSpecVersion,
        sajuDomain: SOURCE.sajuDomain,
        ruleVersion: 'synthetic-only-v1',
        approvedPolicyRevision: 'synthetic-only-revision',
        kind: 'standard_all_readers',
      },
    });
    expect(query.mock.calls[0]?.[1]).toEqual([
      SOURCE.productId, SOURCE.productSpecVersion,
      SOURCE.sajuDomain, SOURCE.effectiveAt,
    ]);
  });

  it('rejects mismatched, duplicate, malformed or impersonated database rows', async () => {
    const failures = [
      [approvedRow, approvedRow],
      [{ ...approvedRow, productId: 'other-product' }],
      [{ ...approvedRow, productSpecVersion: 'old' }],
      [{ ...approvedRow, sajuDomain: 'wealth' }],
      [{ ...approvedRow, approvedPolicyRevision: '' }],
      [{ ...approvedRow, allowedReaderIds: ['seyeon'] }],
      [{ ...approvedRow, kind: 'arbitrary' }],
    ];
    for (const rows of failures) {
      expect(await testPort(rows).port.readApprovedRule(SOURCE)).toEqual({
        status: 'withheld', reason: 'invalid_policy',
      });
    }
  });

  it('rejects invalid or duplicate premium Reader IDs at the PostgreSQL adapter itself', async () => {
    for (const allowedReaderIds of [
      [], ['seyeon', 'seyeon'], ['attacker'], ['seyeon', 'attacker'],
      [' SEYEON'], ['seyeon', null],
    ]) {
      const { port } = testPort([{
        ...approvedRow, kind: 'premium_restricted', allowedReaderIds,
      }]);
      expect(await port.readApprovedRule(SOURCE)).toEqual({
        status: 'withheld', reason: 'invalid_policy',
      });
    }
  });

  it('accepts only a bounded canonical premium allowlist as policy data, not specialist permission', async () => {
    const { port } = testPort([{
      ...approvedRow, kind: 'premium_restricted', allowedReaderIds: ['seyeon', 'taegyeom'],
    }]);
    expect(await port.readApprovedRule(SOURCE)).toEqual({
      status: 'approved',
      rule: {
        productId: SOURCE.productId, productSpecVersion: SOURCE.productSpecVersion,
        sajuDomain: SOURCE.sajuDomain,
        ruleVersion: approvedRow.ruleVersion,
        approvedPolicyRevision: approvedRow.approvedPolicyRevision,
        kind: 'premium_restricted', allowedReaderIds: ['seyeon', 'taegyeom'],
      },
    });
    expect(await resolveProductReaderEligibilityV1({
      source: {
        productId: SOURCE.productId, productSpecVersion: SOURCE.productSpecVersion,
        sajuDomain: SOURCE.sajuDomain,
      },
      serverReaderId: 'baekheon',
      effectiveAt: SOURCE.effectiveAt,
      authorityPort: port,
    })).toEqual({ status: 'withheld', reason: 'reader_excluded' });
  });

  it('rejects malformed sources before any database call', async () => {
    const { port, query } = testPort([approvedRow]);
    for (const invalid of [
      { ...SOURCE, productId: ' bad' },
      { ...SOURCE, effectiveAt: '2026-10-12T04:00:00Z' },
      { ...SOURCE, effectiveAt: '2026-10-12T24:00:00.000Z' },
      { ...SOURCE, sajuDomain: 'arbitrary' },
    ]) {
      expect((await port.readApprovedRule(invalid as typeof SOURCE)).status).toBe('withheld');
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('does not equate policy data with effective Grant, sale or public Reader authority', async () => {
    const { port } = testPort([approvedRow]);
    const decision = await resolveProductReaderEligibilityV1({
      source: {
        productId: SOURCE.productId, productSpecVersion: SOURCE.productSpecVersion,
        sajuDomain: SOURCE.sajuDomain,
      },
      effectiveAt: SOURCE.effectiveAt,
      serverReaderId: 'seyeon',
      authorityPort: port,
    });
    expect(decision.status).toBe('eligible');
    expect(decision).not.toHaveProperty('entitlementGrantId');
    expect(decision).not.toHaveProperty('purchaseIntentId');
    expect(decision).not.toHaveProperty('canInitiate');
  });

  it('preserves transport failure as withheld, never an authorization', async () => {
    const port = createPostgresApprovedStandardReaderRuleAuthorityPortV1({
      query: async () => { throw new Error('PRIVATE_DATABASE_DETAILS'); },
    });
    expect(await resolveProductReaderEligibilityV1({
      source: {
        productId: SOURCE.productId, productSpecVersion: SOURCE.productSpecVersion,
        sajuDomain: SOURCE.sajuDomain,
      }, effectiveAt: SOURCE.effectiveAt, serverReaderId: 'seyeon',
      authorityPort: port,
    })).toEqual({ status: 'withheld', reason: 'policy_unavailable' });
  });
});
