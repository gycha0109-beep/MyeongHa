import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import {
  createPostgresPolicyGuardedStandardReaderSelectionPortV1,
  createPostgresStandardReaderProductScopeAuthorityPortV1,
} from '../apps/api/src/postgres-standard-reader-product-scope-v1.js';
import type { ProductReaderEligibilitySourceV1 } from '../apps/api/src/product-reader-eligibility-policy-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import { READER_RUNTIME_PUBLIC_ACTIVATED_V1 } from '../apps/api/src/reader-production-rollout-policy-v1.js';

const enabled = process.env.MYEONGHA_D01_REAL_PG === '1';
const SUBJECT = '11390000-0000-0000-0000-000000000001';
const PRODUCT = '11392000-0000-0000-0000-000000000001';
const DISABLED_PRODUCT = '11300000-0000-0000-0000-000000000001';
const BUNDLE = '11391000-0000-0000-0000-000000000001';

describe.runIf(enabled)('D-01 actual TypeScript + disposable PostgreSQL Product Reader scope', () => {
  const pg = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 3,
  });
  afterAll(() => pg.end());

  async function withExecutor<T>(
    test: (client: PostgresTransactionQueryV1) => T | Promise<T>,
    subjectId: string | null = SUBJECT,
  ): Promise<T> {
    const connection: PoolClient = await pg.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('SET LOCAL ROLE myeongha_api_executor');
      if (subjectId !== null) {
        await connection.query('select set_config($1::text, $2::text, true)', [
          'myeongha.subject_id', subjectId,
        ]);
      }
      const adapter: PostgresTransactionQueryV1 = {
        async query<Row = Record<string, unknown>>(sql: string, args: readonly unknown[] = []) {
          const result = await connection.query(sql, [...args]);
          return { rows: result.rows as readonly Row[] };
        },
      };
      const result = await test(adapter);
      await connection.query('ROLLBACK'); // Strict read-only fixture.
      return result;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }

  const approved = () => ({
    async readApprovedRule(source: ProductReaderEligibilitySourceV1 & { effectiveAt: string }) {
      expect(source.productId).toBe(PRODUCT);
      expect(source.productSpecVersion).toBe('v1');
      expect(source.sajuDomain).toBe('relationship');
      expect(Date.parse(source.effectiveAt)).not.toBeNaN();
      return {
        status: 'approved' as const,
        rule: {
          kind: 'standard_all_readers' as const,
          productId: source.productId,
          productSpecVersion: source.productSpecVersion,
          sajuDomain: source.sajuDomain,
          ruleVersion: 'synthetic-approval-rule-not-production',
          approvedPolicyRevision: 'synthetic-approved-revision-not-production',
        },
      };
    },
  });

  it('queries the actual server-only PostgreSQL Product source, not a client hint', async () => {
    const value = await withExecutor((client) =>
      createPostgresStandardReaderProductScopeAuthorityPortV1(client)
        .readCurrentScope({ productId: PRODUCT, productSpecVersion: 'v1' }));
    expect(value).toMatchObject({
      productId: PRODUCT, productSpecVersion: 'v1', sajuDomain: 'relationship',
    });
    expect(value?.effectiveAt).toMatch(/Z$/);
    expect(Object.isFrozen(value)).toBe(true);
    expect(READER_RUNTIME_PUBLIC_ACTIVATED_V1).toBe(false);
  });

  it('combines real Catalog, Product, DB clock with a synthetic-only approved rule', async () => {
    const found = await withExecutor(async client => {
      const port = createPostgresPolicyGuardedStandardReaderSelectionPortV1(
        client, approved(),
      );
      return port.resolveEligibleReaderSelection({
        subjectId: SUBJECT, productId: PRODUCT,
        readerCharacterId: 'seyeon',
      });
    });
    expect(found).toEqual({
      productId: PRODUCT, topicKey: 'test_reader_topic',
      specVersion: 'v1', readerCharacterId: 'seyeon',
      readerContentBundleId: BUNDLE,
    });
    expect(Object.isFrozen(found)).toBe(true);
  });

  it('requires stored subject-specific unlock on the actual DB authority', async () => {
    const selection = await withExecutor(client =>
      createPostgresPolicyGuardedStandardReaderSelectionPortV1(client, approved())
        .resolveEligibleReaderSelection({
          subjectId: SUBJECT, productId: PRODUCT,
          readerCharacterId: 'baekheon',
        }));
    expect(selection).toMatchObject({
      readerCharacterId: 'baekheon',
      readerContentBundleId: BUNDLE,
    });
    const forgedSubject = await withExecutor(client =>
      createPostgresPolicyGuardedStandardReaderSelectionPortV1(client, approved())
        .resolveEligibleReaderSelection({
          subjectId: '11390000-0000-0000-0000-000000000099',
          productId: PRODUCT, readerCharacterId: 'baekheon',
        }));
    expect(forgedSubject).toBeNull();
  });

  it('withheld policy never becomes an approved Standard Reader, even with catalog authority', async () => {
    let readRuleCount = 0;
    const result = await withExecutor(client =>
      createPostgresPolicyGuardedStandardReaderSelectionPortV1(client, {
        async readApprovedRule() {
          readRuleCount += 1;
          return { status: 'withheld' as const, reason: 'disabled' as const };
        },
      }).resolveEligibleReaderSelection({
        subjectId: SUBJECT, productId: PRODUCT,
        readerCharacterId: 'seyeon',
      }));
    expect(result).toBeNull();
    expect(readRuleCount).toBe(1);
  });

  it('disabled launch SKU and unreleased Reader fail before Product approval', async () => {
    let called = 0;
    const guard = {
      async readApprovedRule(source: ProductReaderEligibilitySourceV1 & { effectiveAt: string }) {
        called += 1;
        return approved().readApprovedRule(source);
      },
    };
    const disabled = await withExecutor(client =>
      createPostgresPolicyGuardedStandardReaderSelectionPortV1(client, guard)
        .resolveEligibleReaderSelection({
          subjectId: SUBJECT, productId: DISABLED_PRODUCT,
          readerCharacterId: 'seyeon',
        }));
    expect(disabled).toBeNull();
    const comingSoon = await withExecutor(client =>
      createPostgresPolicyGuardedStandardReaderSelectionPortV1(client, guard)
        .resolveEligibleReaderSelection({
          subjectId: SUBJECT, productId: PRODUCT,
          readerCharacterId: 'yeoul',
        }));
    expect(comingSoon).toBeNull();
    expect(called).toBe(0);
  });

  it('does not create any new receipts, purchases, grants, or paid Reader content', async () => {
    const rows = await pg.query<{ intents: string; receipts: string; grants: string }>(`
      select
        (select count(*)::text from public.purchase_intents) as intents,
        (select count(*)::text from public.commerce_receipts) as receipts,
        (select count(*)::text from public.standard_reading_reader_access_grants) as grants
    `);
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0]?.intents)).toBeGreaterThan(0);
    expect(Number(rows.rows[0]?.receipts)).toBe(0);
    expect(Number(rows.rows[0]?.grants)).toBe(0);
  });
});
