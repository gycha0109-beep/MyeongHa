import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  ORIGINAL_CHECKOUT_UNIT_SQL_V1,
  createCommerceReaderPostgresCheckoutNoticeAuthorityV1,
} from '../apps/api/src/commerce-reader-postgres-checkout-notice-authority-v1.js';
import type {
  PostgresSubjectExecutionScopeV1,
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

/**
 * Actual migrated PostgreSQL relational test, NOT a simulated S7
 * authorization or real Checkout Notice record. The real 2250 S7 gate cannot
 * yield rows without an Owner-approved S5 protected body. Substitute ONLY
 * its authorized_original CTE with one known synthetic fixture row so that
 * the remaining SQL is identical to Production's immutable ledger joins.
 *
 * The private S7 gate and revocation requirements are tested separately.
 */
const enabled = process.env.CI === 'true' &&
  process.env.PGHOST === 'localhost' &&
  process.env.PGDATABASE === 'myeongha_reader_checkout_original_ledger_test';

const SUBJECT = 'f7720000-0000-4000-8000-000000000001';
const PURCHASE = 'f7760000-0000-4000-8000-000000000001';
const RECEIPT = 'f7780000-0000-4000-8000-000000000001';
const SIBLING_PURCHASE = 'f7760000-0000-4000-8000-000000000002';
const SIBLING_RECEIPT = 'f7780000-0000-4000-8000-000000000002';
const BODY = 'f7790000-0000-4000-8000-000000000001';
const DIFFERENT = 'f7790000-0000-4000-8000-000000000002';

const cteEnd = ORIGINAL_CHECKOUT_UNIT_SQL_V1.indexOf('\nselect\n  intent.id::text');
if (cteEnd < 0) throw new Error('Original Commerce Checkout ledger query shape changed.');

const relationalSql = `with authorized_original as materialized (
  select $2::uuid as purchase_intent_id, $3::uuid as unit_id,
         '2026-09-01T00:05:00Z'::timestamptz as s5_committed_at
  where $4::uuid = '${BODY}'::uuid
)` + ORIGINAL_CHECKOUT_UNIT_SQL_V1.slice(cteEnd);

describe.runIf(enabled)('S7 actual PG original Receipt -> Grant -> pinned Checkout item', () => {
  const pg = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 2,
  });
  afterAll(() => pg.end());

  async function originalGrant(receipt=RECEIPT): Promise<string> {
    const res = await pg.query<{ id: string }>(
      `select g.id::text as id
       from public.entitlement_grants g
       join public.commerce_receipts r on r.id=g.source_receipt_id
       where r.id=$1::uuid and g.grant_key='receipt:' || r.id::text`,
      [receipt],
    );
    expect(res.rows).toHaveLength(1);
    return res.rows[0]!.id;
  }
  async function read(subject: string, purchase: string, grant: string, body=BODY) {
    const result = await pg.query<{
      purchaseIntentId: string;
      originatingGrantId: string;
      pinnedCapabilityItemKey: string;
      originalPaymentAttemptCreatedAt: string;
      originalPurchaseIntentCreatedAt: string;
      s5CommittedAt: string;
    }>(relationalSql, [subject, purchase, grant, body]);
    return result.rows;
  }

  it('binds a REAL issued Receipt-backed Grant to exactly one prepayment Capability Item and original attempt', async () => {
    const grant = await originalGrant();
    const rows = await read(SUBJECT, PURCHASE, grant);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      purchaseIntentId: PURCHASE,
      originatingGrantId: grant,
      pinnedCapabilityItemKey: 'original-reader-item',
    });
    expect(Date.parse(rows[0]!.originalPaymentAttemptCreatedAt))
      .toBe(Date.parse('2026-09-01T00:02:00Z'));
    expect(Date.parse(rows[0]!.originalPurchaseIntentCreatedAt))
      .toBe(Date.parse('2026-09-01T00:01:00Z'));
    expect(Date.parse(rows[0]!.s5CommittedAt))
      .toBe(Date.parse('2026-09-01T00:05:00Z'));
    const count = await pg.query<{ count: string }>(
      'select count(*)::text as count from public.commerce_payment_attempts where purchase_intent_id=$1::uuid',
      [PURCHASE],
    );
    expect(count.rows[0]?.count).toBe('2');
  });

  it('denies foreign Subject, other Purchase Intent, other Grant and untrusted body selectors', async () => {
    const grant = await originalGrant();
    expect(await read(DIFFERENT, PURCHASE, grant)).toEqual([]);
    expect(await read(SUBJECT, DIFFERENT, grant)).toEqual([]);
    expect(await read(SUBJECT, PURCHASE, DIFFERENT)).toEqual([]);
    expect(await read(SUBJECT, PURCHASE, grant, DIFFERENT)).toEqual([]);
    expect(await read(SUBJECT, PURCHASE, grant)).toHaveLength(1);
  });

  it('keeps two independently verified sibling purchases isolated under the same member and Item', async () => {
    const original=await originalGrant();
    const sibling=await originalGrant(SIBLING_RECEIPT);
    expect(sibling).not.toBe(original);

    // Both purchases legitimately bind the same immutable product, but a
    // notice from one Purchase Intent must NEVER be borrowed by the other.
    expect(await read(SUBJECT,PURCHASE,original)).toHaveLength(1);
    const siblingRows=await read(SUBJECT,SIBLING_PURCHASE,sibling);
    expect(siblingRows).toHaveLength(1);
    expect(siblingRows[0]).toMatchObject({
      purchaseIntentId:SIBLING_PURCHASE,
      originatingGrantId:sibling,
      pinnedCapabilityItemKey:'original-reader-item',
    });
    expect(Date.parse(siblingRows[0]!.originalPaymentAttemptCreatedAt))
      .toBe(Date.parse('2026-09-01T00:02:45Z'));
    expect(await read(SUBJECT,PURCHASE,sibling)).toEqual([]);
    expect(await read(SUBJECT,SIBLING_PURCHASE,original)).toEqual([]);
    expect(await read(DIFFERENT,SIBLING_PURCHASE,sibling)).toEqual([]);
  });

  it('keeps the ORIGINAL attempt timestamp across same-intent payment retries', async () => {
    const original=await originalGrant();
    const attempts=await pg.query<{attemptNo:number;createdAt:string}>(
      `select attempt_no as "attemptNo",created_at::text as "createdAt"
       from public.commerce_payment_attempts where purchase_intent_id=$1::uuid
       order by attempt_no`,
      [PURCHASE],
    );
    expect(attempts.rows.map(x=>x.attemptNo)).toEqual([1,2]);
    expect(Date.parse(attempts.rows[0]!.createdAt))
      .toBeLessThan(Date.parse(attempts.rows[1]!.createdAt));
    const originalRows=await read(SUBJECT,PURCHASE,original);
    expect(originalRows).toHaveLength(1);
    expect(Date.parse(originalRows[0]!.originalPaymentAttemptCreatedAt))
      .toBe(Date.parse(attempts.rows[0]!.createdAt));
    expect(Date.parse(originalRows[0]!.originalPaymentAttemptCreatedAt))
      .not.toBe(Date.parse(attempts.rows[1]!.createdAt));
  });

  it('does NOT bypass the real S7 protected-body/S1 gate when no paid answer was committed', async () => {
    const grant=await originalGrant();
    const session=await pg.connect();
    try {
      await session.query('begin isolation level read committed');
      await session.query("select pg_catalog.set_config('myeongha.subject_id',$1,true)",[SUBJECT]);

      // Unlike relationalSql (which isolates ONLY real Commerce joins),
      // this runs Production's unchanged S7 gate against actual migrated DB.
      const source=await session.query(
        'select * from public.internal_qry_official_reader_withdrawal_delivery_state_v2($1::uuid,$2::uuid,$3::uuid,$4::uuid)',
        [SUBJECT,PURCHASE,grant,BODY],
      );
      expect(source.rows).toEqual([]);

      // Even an injected test-only Checkout store must never be consulted
      // when the real protected S5 body/original delivery authorization is absent.
      let storeCalls=0;
      const scope={
        resolvedSubject:{subjectId:SUBJECT,subjectKind:'member'},
        client:{
          query:async <Row=Record<string,unknown>>(sql:string,args:readonly unknown[]=[])=>({
            rows:(await session.query(sql,[...args])).rows as Row[],
          }),
        } as PostgresTransactionQueryV1,
      } as PostgresSubjectExecutionScopeV1;
      const authority=createCommerceReaderPostgresCheckoutNoticeAuthorityV1({
        scope,bodyId:BODY,
        immutableCheckoutNoticeStore:{
          readOriginalNotice:async()=>{storeCalls+=1;return null;},
        },
      });
      expect(await authority.readExactServerCheckoutNotice({
        purchaseIntentId:PURCHASE,unitId:grant,productSpecVersion:'reader-reading-v1',
      })).toBeNull();
      expect(storeCalls).toBe(0);
      await session.query('rollback');
    } finally {
      await session.query('rollback').catch(()=>undefined);
      session.release();
    }
  });

  it('requires the real trusted Subject context, not bare SQL or browser flags', async () => {
    const grant=await originalGrant();
    await expect(pg.query(
      'select * from public.internal_qry_official_reader_withdrawal_delivery_state_v2($1::uuid,$2::uuid,$3::uuid,$4::uuid)',
      [SUBJECT,PURCHASE,grant,BODY],
    )).rejects.toMatchObject({ code:'28000' });
  });

  it('keeps payment attempts as prior provenance rather than post-payment invented notice', async () => {
    const grant = await originalGrant();
    const rows = await read(SUBJECT, PURCHASE, grant);
    expect(rows).toHaveLength(1);
    const sources = await pg.query<{ firstAttempt: string; intentAt: string; grantAt: string }>(
      `select a.created_at::text as "firstAttempt",
         pi.created_at::text as "intentAt",
         g.created_at::text as "grantAt"
       from public.commerce_payment_attempts a
       join public.purchase_intents pi on pi.id=a.purchase_intent_id
       join public.commerce_receipts r on r.purchase_intent_id=pi.id
       join public.entitlement_grants g on g.source_receipt_id=r.id
       where a.attempt_no=1 and a.purchase_intent_id=$1::uuid`,
      [PURCHASE],
    );
    expect(sources.rows).toHaveLength(1);
    expect(Date.parse(sources.rows[0]!.intentAt))
      .toBeLessThan(Date.parse(sources.rows[0]!.firstAttempt));
    // The original Gift/Grant is assigned only AFTER the Payment Attempt;
    // it cannot serve as the identity of the pre-checkout notice snapshot.
    expect(Date.parse(sources.rows[0]!.grantAt))
      .toBeGreaterThan(Date.parse(sources.rows[0]!.firstAttempt));
  });
});
