import { describe, expect, it, vi } from 'vitest';
import {
  createPostgresStandardReaderProductScopeAuthorityPortV1,
  createPostgresPolicyGuardedStandardReaderSelectionPortV1,
  POSTGRES_STANDARD_READER_PRODUCT_SCOPE_BINDING_V1,
} from '../apps/api/src/postgres-standard-reader-product-scope-v1.js';
import type {
  PostgresTransactionQueryV1, PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
import { READER_RUNTIME_PUBLIC_ACTIVATED_V1 } from '../apps/api/src/reader-production-rollout-policy-v1.js';

const productId = '11392000-0000-0000-0000-000000000001';
const bundleId = '11391000-0000-4000-8000-000000000001';
const scope = {
  productId, productSpecVersion: 'v1', sajuDomain: 'relationship',
  effectiveAt: '2026-10-12T02:00:00.000Z',
};
const catalog = {
  productId, topicKey: 'test_reader_topic', specVersion: 'v1',
  readerSelectionMode: 'required', purchaseUnitMode: 'topic_reader_reading',
  readerCharacterId: 'seyeon', readerContentBundleId: bundleId,
  catalogAvailability: 'available', catalogEnabled: true,
};
const request = { subjectId: 'synthetic-member', productId, readerCharacterId: 'seyeon' };

class Fixture implements PostgresTransactionQueryV1 {
  calls: { sql: string; args: readonly unknown[] }[] = [];
  scopeRows: readonly Record<string, unknown>[] = [scope];
  catalogRows: readonly Record<string, unknown>[] = [catalog];
  async query<Row = Record<string, unknown>>(sql: string, args: readonly unknown[] = []):
    Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({ sql, args });
    if (sql.includes(POSTGRES_STANDARD_READER_PRODUCT_SCOPE_BINDING_V1)) {
      return { rows: this.scopeRows as readonly Row[] };
    }
    if (sql.includes('public.qry_standard_reading_reader_catalog_v4')) {
      return { rows: this.catalogRows as readonly Row[] };
    }
    throw Error('unapproved query path');
  }
}

function approved() {
  return {
    status: 'approved' as const,
    rule: {
      kind: 'standard_all_readers' as const,
      productId, productSpecVersion: 'v1',
      sajuDomain: 'relationship' as const,
      ruleVersion: 'synthetic-rule-v1',
      approvedPolicyRevision: 'synthetic-not-production',
    },
  };
}

describe('D-01 inactive Product scope bridge (real SQL contract, no paid activation)', () => {
  it('looks up exact active Product source and database clock by server parameters', async () => {
    const pg = new Fixture();
    const result = await createPostgresStandardReaderProductScopeAuthorityPortV1(pg)
      .readCurrentScope({ productId, productSpecVersion: 'v1' });
    expect(result).toEqual(scope);
    expect(Object.isFrozen(result)).toBe(true);
    expect(pg.calls).toHaveLength(1);
    expect(pg.calls[0]?.sql).toContain(
      'from public.qry_standard_reading_product_scope_v1($1::uuid,$2::text)',
    );
    expect(pg.calls[0]?.args).toEqual([productId, 'v1']);
  });

  it('composes catalog + DB Product source + injected approved rule on one transaction client', async () => {
    const pg = new Fixture();
    const readApprovedRule = vi.fn(async () => approved());
    const adapter = createPostgresPolicyGuardedStandardReaderSelectionPortV1(
      pg, { readApprovedRule },
    );
    await expect(adapter.resolveEligibleReaderSelection(request)).resolves.toEqual({
      productId, topicKey: catalog.topicKey, specVersion: 'v1',
      readerCharacterId: 'seyeon', readerContentBundleId: bundleId,
    });
    expect(pg.calls.map(x => x.sql.includes(POSTGRES_STANDARD_READER_PRODUCT_SCOPE_BINDING_V1)))
      .toEqual([false, true]);
    expect(readApprovedRule).toHaveBeenCalledWith(scope);
    expect(READER_RUNTIME_PUBLIC_ACTIVATED_V1).toBe(false);
  });

  it('stops with no policy lookup for disabled/missing or retired Product source', async () => {
    const pg = new Fixture();
    pg.scopeRows = [];
    const readApprovedRule = vi.fn(async () => approved());
    const adapter = createPostgresPolicyGuardedStandardReaderSelectionPortV1(
      pg, { readApprovedRule },
    );
    await expect(adapter.resolveEligibleReaderSelection(request)).resolves.toBeNull();
    expect(readApprovedRule).not.toHaveBeenCalled();
  });

  it.each([
    [null],
    [{ ...scope, productId: 'another-product' }],
    [{ ...scope, productSpecVersion: 'v0' }],
    [{ ...scope, sajuDomain: 'not-a-domain' }],
    [{ ...scope, effectiveAt: 'yesterday' }],
    [{ ...scope, effectiveAt: '2026-02-30T00:00:00.000Z' }],
    [{ ...scope, effectiveAt: '2026-10-12T02:00:00Z' }],
  ])('rejects invalid or drifted server Product scope %s', async (invalid) => {
    const pg = new Fixture();
    pg.scopeRows = invalid === null ? [] : [invalid];
    const readApprovedRule = vi.fn(async () => approved());
    const adapter = createPostgresPolicyGuardedStandardReaderSelectionPortV1(
      pg, { readApprovedRule },
    );
    if (invalid === null) {
      await expect(adapter.resolveEligibleReaderSelection(request)).resolves.toBeNull();
    } else {
      await expect(adapter.resolveEligibleReaderSelection(request)).resolves.toBeNull();
    }
  });

  it('rejects duplicate Product rows, without picking an arbitrary policy revision', async () => {
    const pg = new Fixture();
    pg.scopeRows = [scope, scope];
    const readApprovedRule = vi.fn(async () => approved());
    await expect(createPostgresPolicyGuardedStandardReaderSelectionPortV1(
      pg, { readApprovedRule },
    ).resolveEligibleReaderSelection(request)).resolves.toBeNull();
    expect(readApprovedRule).not.toHaveBeenCalled();
  });

  it('requires explicitly approved Product policy even after matching PostgreSQL source', async () => {
    const pg = new Fixture();
    const readApprovedRule = vi.fn(async () =>
      ({ status: 'withheld' as const, reason: 'disabled' as const }));
    await expect(createPostgresPolicyGuardedStandardReaderSelectionPortV1(
      pg, { readApprovedRule },
    ).resolveEligibleReaderSelection(request)).resolves.toBeNull();
  });

  it('does not query PostgreSQL for malformed caller scope', async () => {
    const pg = new Fixture();
    await expect(createPostgresStandardReaderProductScopeAuthorityPortV1(pg)
      .readCurrentScope({ productId: '', productSpecVersion: 'v1' })).resolves.toBeNull();
    expect(pg.calls).toHaveLength(0);
  });
});
