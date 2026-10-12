import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  createSeyeonDetachedSettlementWorkerFromDriverV1,
} from '../apps/api/src/seyeon-detached-settlement-worker-v1.js';
import {
  createSeyeonPostgresProviderReceiptSourceV1,
} from '../apps/api/src/seyeon-postgres-provider-receipt-source-v1.js';
import type {
  NodePostgresDriverPoolV1,
} from '../apps/api/src/node-postgres-subject-pool.js';

/**
 * Real PostgreSQL (disposable CI database only). No Production connection
 * builder, no Provider request and no private user data.
 */
const ENABLED=process.env.CI==='true' &&
  process.env.SEYEON_DETACHED_REAL_DB_TEST==='1' &&
  process.env.PGDATABASE==='myeongha_seyeon_d4b10g_test';
const callKnown='d4f00000-0000-4000-8000-000000000011';
const callUnknown='d4f00000-0000-4000-8000-000000000012';
const callInterrupted='d4f00000-0000-4000-8000-000000000013';
const callClaimLost='d4f00000-0000-4000-8000-000000000014';
const callAckLost='d4f00000-0000-4000-8000-000000000015';
const DATE_QUERY=`select occupied_micro_usd::text as "occupied"
from public.seyeon_ai_governor_daily_budgets_v1
where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date`;

function guardedPool(fault?:{loseCommitReplyAt:1|2|3}):
  NodePostgresDriverPoolV1 {
  if(!ENABLED) throw new Error('D4B-10G refuses external PostgreSQL target');
  const pool=new Pool({
    max:2,
    connectionTimeoutMillis:5000,
    idleTimeoutMillis:1000,
    statement_timeout:5000,
    allowExitOnIdle:true,
  });
  let commits=0;
  return {
    async connect(){
      const client=await pool.connect();
      try {
        // Disposable CI bootstrap user must be superuser. The very first
        // statement restricts the session to the actual minimal LOGIN role.
        await client.query('SET SESSION AUTHORIZATION myeongha_seyeon_settlement_login');
      } catch(error) {
        client.release(true);
        throw error;
      }
      return {
        async query(sql,values){
          const result=await client.query(sql,values as unknown[]|undefined);
          if(sql==='COMMIT' && ++commits===fault?.loseCommitReplyAt) {
            // DB commit *really happened*. Only the reply is lost.
            // First: claim. Second: settlement. Third: acknowledgement.
            throw new Error('Synthetic lost '+(['','claim','settlement','acknowledgement'][commits])+' COMMIT reply');
          }
          return {rows:result.rows as Record<string,unknown>[]};
        },
        release(){client.release(true);},
      };
    },
    end(){return pool.end();},
  };
}

describe.skipIf(!ENABLED)(
  'D4B-10G actual PostgreSQL driver round-trip (CI synthetic records only)',
  ()=>{
    const admin=new Pool({max:1,connectionTimeoutMillis:5000});
    afterAll(async()=>{await admin.end();});

    it('uses the strict LOGIN, claims, settles, ACKs known and unknown evidence',async()=>{
      const driver=guardedPool();
      const worker=createSeyeonDetachedSettlementWorkerFromDriverV1({
        driverPool:driver,
        source:createSeyeonPostgresProviderReceiptSourceV1(driver),
      });
      try {
        const known=await worker.settleNext();
        expect(known).toEqual({
          callId:callKnown,replayed:false,occupiedMicroUsd:300n,overCeiling:false,
        });
        const unknown=await worker.settleNext();
        expect(unknown).toEqual({
          callId:callUnknown,replayed:false,occupiedMicroUsd:3700n,overCeiling:false,
        });
        const evidence=await admin.query(`
          select call_id::text as "callId",ack_ed.acked_at is not null as "acked"
          from public.seyeon_ai_provider_receipt_queue_v1 ack_ed
          where call_id in ($1::uuid,$2::uuid)
          order by call_id
        `,[callKnown,callUnknown]);
        expect(evidence.rows).toEqual([
          {callId:callKnown,acked:true},
          {callId:callUnknown,acked:true},
        ]);
        const money=await admin.query(DATE_QUERY);
        expect(money.rows[0]?.occupied).toBe('7700');
      } finally {await worker.close();}
    });

    it('never ACKs an ambiguous settled COMMIT, then replays without a second charge',async()=>{
      const faultedDriver=guardedPool({loseCommitReplyAt:2});
      const crashedWorker=createSeyeonDetachedSettlementWorkerFromDriverV1({
        driverPool:faultedDriver,
        source:createSeyeonPostgresProviderReceiptSourceV1(faultedDriver),
      });
      try {
        await expect(crashedWorker.settleNext())
          .rejects.toThrow('Synthetic lost settlement COMMIT reply');
      } finally {await crashedWorker.close();}

      const afterCrash=await admin.query(`
        select q.acked_at is null as "pending",
               q.claim_count as "claims",e.lifecycle_state as "lifecycle"
        from public.seyeon_ai_provider_receipt_queue_v1 q
        join public.seyeon_ai_call_cost_events e using(call_id)
        where q.call_id=$1::uuid
      `,[callInterrupted]);
      expect(afterCrash.rows).toEqual([{
        pending:true,claims:1,lifecycle:'settled',
      }]);
      const moneyAfterCrash=await admin.query(DATE_QUERY);
      expect(moneyAfterCrash.rows[0]?.occupied).toBe('4300');

      // Only the *disposable test database* accelerates the 90s lease expiry.
      await admin.query(`
        update public.seyeon_ai_provider_receipt_queue_v1
        set claimed_until=clock_timestamp()-interval '1 second'
        where call_id=$1::uuid
      `,[callInterrupted]);
      const replayDriver=guardedPool();
      const replayWorker=createSeyeonDetachedSettlementWorkerFromDriverV1({
        driverPool:replayDriver,
        source:createSeyeonPostgresProviderReceiptSourceV1(replayDriver),
      });
      try {
        expect(await replayWorker.settleNext()).toEqual({
          callId:callInterrupted,replayed:true,
          occupiedMicroUsd:300n,overCeiling:false,
        });
        expect(await replayWorker.settleNext()).toBeNull();
      } finally {await replayWorker.close();}
      const afterReplay=await admin.query(`
        select acked_at is not null as "acked",claim_count as "claims"
        from public.seyeon_ai_provider_receipt_queue_v1
        where call_id=$1::uuid
      `,[callInterrupted]);
      expect(afterReplay.rows).toEqual([{acked:true,claims:2}]);
      expect((await admin.query(DATE_QUERY)).rows[0]?.occupied).toBe('4300');
    });
    it('does not treat a committed claim with a lost reply as a completed settlement',async()=>{
      const lostClaimDriver=guardedPool({loseCommitReplyAt:1});
      const lostClaimWorker=createSeyeonDetachedSettlementWorkerFromDriverV1({
        driverPool:lostClaimDriver,
        source:createSeyeonPostgresProviderReceiptSourceV1(lostClaimDriver),
      });
      try {
        await expect(lostClaimWorker.settleNext())
          .rejects.toThrow('Synthetic lost claim COMMIT reply');
      } finally {await lostClaimWorker.close();}
      const claimed=await admin.query(`
        select claim_count as "claims",acked_at is null as "pending",
               claimed_until > clock_timestamp() as "leased",
               e.lifecycle_state as "lifecycle"
        from public.seyeon_ai_provider_receipt_queue_v1 q
        join public.seyeon_ai_call_cost_events e using(call_id)
        where q.call_id=$1::uuid
      `,[callClaimLost]);
      expect(claimed.rows).toEqual([{
        claims:1,pending:true,leased:true,lifecycle:'started',
      }]);
      expect((await admin.query(DATE_QUERY)).rows[0]?.occupied).toBe('11700');

      // Only a disposable CI test can accelerate the real DB lease.
      await admin.query(`
        update public.seyeon_ai_provider_receipt_queue_v1
        set claimed_until=clock_timestamp()-interval '1 second'
        where call_id=$1::uuid
      `,[callClaimLost]);
      const retryDriver=guardedPool();
      const retryWorker=createSeyeonDetachedSettlementWorkerFromDriverV1({
        driverPool:retryDriver,
        source:createSeyeonPostgresProviderReceiptSourceV1(retryDriver),
      });
      try {
        expect(await retryWorker.settleNext()).toEqual({
          callId:callClaimLost,replayed:false,
          occupiedMicroUsd:300n,overCeiling:false,
        });
      } finally {await retryWorker.close();}
      expect((await admin.query(`
        select claim_count as "claims",acked_at is not null as "acked"
        from public.seyeon_ai_provider_receipt_queue_v1 where call_id=$1::uuid
      `,[callClaimLost])).rows).toEqual([{claims:2,acked:true}]);
      expect((await admin.query(DATE_QUERY)).rows[0]?.occupied).toBe('8300');
    });

    it('does not retry an already ACKed receipt after its COMMIT reply is lost',async()=>{
      const lostAckDriver=guardedPool({loseCommitReplyAt:3});
      const lostAckWorker=createSeyeonDetachedSettlementWorkerFromDriverV1({
        driverPool:lostAckDriver,
        source:createSeyeonPostgresProviderReceiptSourceV1(lostAckDriver),
      });
      try {
        await expect(lostAckWorker.settleNext())
          .rejects.toThrow('Synthetic lost acknowledgement COMMIT reply');
      } finally {await lostAckWorker.close();}
      expect((await admin.query(`
        select claim_count as "claims",acked_at is not null as "acked",
               e.lifecycle_state as "lifecycle"
        from public.seyeon_ai_provider_receipt_queue_v1 q
        join public.seyeon_ai_call_cost_events e using(call_id)
        where q.call_id=$1::uuid
      `,[callAckLost])).rows).toEqual([{
        claims:1,acked:true,lifecycle:'settled',
      }]);
      expect((await admin.query(DATE_QUERY)).rows[0]?.occupied).toBe('4900');

      const freshDriver=guardedPool();
      const freshWorker=createSeyeonDetachedSettlementWorkerFromDriverV1({
        driverPool:freshDriver,
        source:createSeyeonPostgresProviderReceiptSourceV1(freshDriver),
      });
      try {
        expect(await freshWorker.settleNext()).toBeNull();
      } finally {await freshWorker.close();}
      expect((await admin.query(DATE_QUERY)).rows[0]?.occupied).toBe('4900');
    });

  },
);
