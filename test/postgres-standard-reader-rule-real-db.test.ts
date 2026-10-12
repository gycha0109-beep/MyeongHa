import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createPostgresDbApprovedStandardReaderSelectionPortV1 } from '../apps/api/src/postgres-standard-reader-approved-rule-v1.js';
import { createPostgresStandardReaderV2PolicyPreflightV1 } from '../apps/api/src/postgres-standard-reader-v2-bind-policy-preflight-v1.js';

const enabled = process.env.MYEONGHA_D01_REAL_PG === '1';
const PRODUCT = '11392000-0000-0000-0000-000000000001';
const DISABLED = '11300000-0000-0000-0000-000000000001';
const SUBJECT = '11390000-0000-0000-0000-000000000001';

describe.runIf(enabled)('D-01 Product-approved rule source / disposable PostgreSQL', () => {
  const pg = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 2,
  });
  afterAll(() => pg.end());

  async function executor<T>(cb: (client: PostgresTransactionQueryV1) => Promise<T>): Promise<T> {
    const connection: PoolClient = await pg.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('SET LOCAL ROLE myeongha_api_executor');
      await connection.query(
        'select set_config($1::text, $2::text, true)',
        ['myeongha.subject_id', SUBJECT],
      );
      const client: PostgresTransactionQueryV1 = {
        async query<Row = Record<string, unknown>>(sql: string, args: readonly unknown[] = []) {
          const result = await connection.query(sql, [...args]);
          return { rows: result.rows as readonly Row[] };
        },
      };
      const value = await cb(client);
      await connection.query('ROLLBACK');
      return value;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }

  it('reads an exact synthetic revision with actual PostgreSQL authority', async () => {
    const result = await executor(async (client) => {
      const catalog = createPostgresDbApprovedStandardReaderSelectionPortV1(client);
      return catalog.resolveEligibleReaderSelection({
        subjectId: SUBJECT, productId: PRODUCT, readerCharacterId: 'seyeon',
      });
    });
    expect(result).toMatchObject({
      productId: PRODUCT, specVersion: 'v1',
      readerCharacterId: 'seyeon',
      readerContentBundleId: '11391000-0000-0000-0000-000000000001',
    });
  });

  it('denies disabled Product, unpublished Reader and forged Subject', async () => {
    const results = await executor(async (client) => {
      const catalog = createPostgresDbApprovedStandardReaderSelectionPortV1(client);
      return Promise.all([
        catalog.resolveEligibleReaderSelection({
          subjectId: SUBJECT, productId: DISABLED, readerCharacterId: 'seyeon',
        }),
        catalog.resolveEligibleReaderSelection({
          subjectId: SUBJECT, productId: PRODUCT, readerCharacterId: 'yeoul',
        }),
        catalog.resolveEligibleReaderSelection({
          subjectId: '11390000-0000-0000-0000-000000000099',
          productId: PRODUCT, readerCharacterId: 'baekheon',
        }),
      ]);
    });
    expect(results).toEqual([null, null, null]);
  });

  it('classifies an unlocked Standard Reader without specialist can_initiate', async () => {
    const specialist = await pg.query(
      "select count(*)::integer as n from public.character_capabilities " +
      "where character_id = 'baekheon' " +
      "and content_bundle_id = '11391000-0000-0000-0000-000000000001'::uuid " +
      "and saju_domain = 'relationship'",
    );
    expect(specialist.rows[0]?.n).toBe(0);

    const decision = await executor((client) =>
      createPostgresStandardReaderV2PolicyPreflightV1(client).assess({
        resolvedSubjectId: SUBJECT,
        productId: PRODUCT,
        readerCharacterId: 'baekheon',
      }));
    expect(decision).toMatchObject({
      status: 'standard_candidate',
      productId: PRODUCT,
      readerCharacterId: 'baekheon',
      approvedPolicyRevision: 'synthetic-d01-real-db-test-only',
    });
    expect(decision).not.toHaveProperty('entitlementGrantId');
    expect(decision).not.toHaveProperty('readingId');
    expect(decision).not.toHaveProperty('canInitiate');
  });

  it('withholds disabled Product, unpublished Reader, forged Subject and unknown IDs', async () => {
    const decisions = await executor(async (client) => {
      const port = createPostgresStandardReaderV2PolicyPreflightV1(client);
      return Promise.all([
        port.assess({
          resolvedSubjectId: SUBJECT, productId: DISABLED, readerCharacterId: 'seyeon',
        }),
        port.assess({
          resolvedSubjectId: SUBJECT, productId: PRODUCT, readerCharacterId: 'yeoul',
        }),
        port.assess({
          resolvedSubjectId: '11390000-0000-0000-0000-000000000099',
          productId: PRODUCT, readerCharacterId: 'baekheon',
        }),
        port.assess({
          resolvedSubjectId: SUBJECT, productId: PRODUCT, readerCharacterId: 'unregistered',
        }),
      ]);
    });
    expect(decisions.every((decision) => decision.status === 'withheld')).toBe(true);
  });

  it('never creates any receipt, Reader Grant or paid output', async () => {
    const before = await pg.query(
      'select (select count(*) from public.commerce_receipts)::text as receipts,' +
      ' (select count(*) from public.standard_reading_reader_access_grants)::text as grants',
    );
    expect(before.rows[0]).toMatchObject({ receipts: '0', grants: '0' });
  });
});
