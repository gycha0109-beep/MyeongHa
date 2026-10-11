import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { openPostgresOfficialReadingReaderFirstThreadV1 } from '../apps/api/src/postgres-official-reading-reader-first-thread-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { ProductReaderEligibilitySourceV1 } from '../apps/api/src/product-reader-eligibility-policy-v1.js';

const enabled = process.env.MYEONGHA_D05_REAL_PG === '1';
const SUBJECT = '11390000-0000-0000-0000-000000000001';
const AUTH = 'c1990000-0000-4000-8000-000000000009';
const READING = '12103100-0000-4000-8000-000000000001';
const BUNDLE_A = '11391000-0000-4000-8000-000000000001';
const READER = 'seyeon';
const initialIntent = '11392300-0000-0000-0000-000000000001';

describe.runIf(enabled)('D-05-C actual TypeScript and disposable PostgreSQL purchased Reader', () => {
  const pg = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 4,
  });
  afterAll(() => pg.end());

  const pool: PostgresSubjectPoolV1 = {
    connect: async () => {
      const connection = await pg.connect();
      return {
        query: async <Row = Record<string, unknown>>(
          sql: string, args: readonly unknown[] = [],
        ) => ({
          rows: (await connection.query(sql, [...args])).rows as Row[],
        }),
        release: (error?: unknown) => connection.release(error instanceof Error ? error : undefined),
      };
    },
  };

  let sequence = 0;
  function input(withhold = false) {
    return {
      pool,
      verifiedEvidence: { kind: 'member' as const, verifiedAuthUserId: AUTH },
      readingId: READING,
      readerCharacterId: READER,
      createUuid: () => {
        sequence += 1;
        return 'b5500000-0000-4000-8000-' + sequence.toString(16).padStart(12, '0');
      },
      // Synthetic Product policy for testing only: NEVER Owner approval.
      createProductReaderPolicyAuthorityPort() {
        return {
          async readApprovedRule(source: ProductReaderEligibilitySourceV1 & { effectiveAt: string }) {
            if (withhold) return { status: 'withheld' as const, reason: 'disabled' as const };
            return {
              status: 'approved' as const,
              rule: {
                kind: 'standard_all_readers' as const,
                productId: source.productId,
                productSpecVersion: source.productSpecVersion,
                sajuDomain: source.sajuDomain,
                ruleVersion: 'synthetic-test-only-v1',
                approvedPolicyRevision: 'synthetic-revision-v1',
              },
            };
          },
        };
      },
    };
  }

  async function threadCount() {
    const result = await pg.query<{ count: string }>(
      'select count(*)::text as count from public.conversation_threads where subject_id=$1::uuid and status=$2',
      [SUBJECT, 'active'],
    );
    return Number(result.rows[0]?.count);
  }

  it('withheld policy, purchased Bundle mismatch, first create/reuse, and revoke', async () => {
    expect((await pg.query<{ kind: string }>(
      'select kind from public.subjects where id=$1::uuid', [SUBJECT],
    )).rows[0]?.kind).toBe('member');

    await expect(openPostgresOfficialReadingReaderFirstThreadV1(input(true)))
      .rejects.toMatchObject({ code: 'POLICY_HOLD' });
    expect(await threadCount()).toBe(0);

    // Test default C is valid for general Chat but differs from purchased A;
    // the real opener can insert provisionally but must ROLLBACK.
    await expect(openPostgresOfficialReadingReaderFirstThreadV1(input()))
      .rejects.toMatchObject({ code: 'THREAD_INCOMPATIBLE' });
    expect(await threadCount()).toBe(0);
    const none = await pg.query<{ count: string }>(
      'select count(*)::text as count from public.conversation_thread_characters where character_id=$1',
      [READER],
    );
    expect(Number(none.rows[0]?.count)).toBe(0);

    await pg.query('update public.content_releases set is_default=false where is_default');
    await pg.query(
      'insert into public.content_releases(' +
        'id,release_key,content_bundle_id,status,is_default,rollout_jsonb,' +
        'rollout_policy_version,rollout_seed,activated_at,retired_at,created_at' +
      ') values (' +
        "'b4400000-0000-4000-8000-000000000010'::uuid," +
        "'d05-app-default-a',$1::uuid,'active',true,null," +
        "'uniform-default-v1','uniform',clock_timestamp(),null,clock_timestamp())",
      [BUNDLE_A],
    );

    const created = await openPostgresOfficialReadingReaderFirstThreadV1(input());
    expect(created.created).toBe(true);
    expect(created.resolved).toMatchObject({
      subjectId: SUBJECT, readingId: READING,
      readerCharacterId: READER, activeContentBundleId: BUNDLE_A,
    });
    expect(await threadCount()).toBe(1);

    const repeated = await openPostgresOfficialReadingReaderFirstThreadV1(input());
    expect(repeated.created).toBe(false);
    expect(repeated.resolved.threadId).toBe(created.resolved.threadId);
    expect(await threadCount()).toBe(1);

    await pg.query(
      'update public.entitlement_grants g ' +
      "set status='revoked',revision=revision+1," +
      'last_effective_at=clock_timestamp(),updated_at=clock_timestamp() ' +
      'from public.standard_reading_reader_access_grants a ' +
      'where g.id=a.entitlement_grant_id and a.purchase_intent_id=$1::uuid',
      [initialIntent],
    );
    await expect(openPostgresOfficialReadingReaderFirstThreadV1(input()))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(await threadCount()).toBe(1);
    // The DB query is additionally protected by a trusted subject context:
    // an unauthenticated/raw connection must NOT read paid Reader metadata.
    await expect(pg.query(
      'select count(*)::text as count ' +
      'from public.qry_character_standard_reading_access_runtime_v2($1::uuid,$2,clock_timestamp()) ' +
      'where reading_id=$3::uuid',
      [SUBJECT, READER, READING],
    )).rejects.toMatchObject({
      code: '28000', constraint: 'myeongha_subject_context_required',
    });
  });
});
