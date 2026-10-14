/**
 * D3e5 actual TS -> isolated PostgreSQL -> 1860 integration.
 * Enabled only inside the disposable CI-only D3e5 database.
 * All PortOne responses are local Response objects; never real network.
 */
import { createHmac } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import type { PostgresSubjectPoolV1, PostgresSubjectConnectionV1 } from '../apps/api/src/postgres-subject-execution.js';
import { stageSignedPortOneV2CancellationInboxV1 } from '../apps/api/src/official-reader-portone-cancel-inbox-private-v1.js';
import { processOnePrivatePortOneCancelWorkV1 } from '../apps/api/src/official-reader-portone-cancel-durable-worker-private-v1.js';
import { createPrivateOfficialReaderCancelInboxRecorderTestV1 } from './support/private-official-reader-cancel-inbox-recorder-v1.js';
import { createPrivateCancelDurableWorkerStoreTestV1 } from './support/private-official-reader-cancel-durable-worker-store-v1.js';

const ENABLED = process.env.MYEONGHA_D3E5_REAL_PG === '1'
  && process.env.CI === 'true'
  && process.env.PGHOST === 'localhost'
  && process.env.PGDATABASE === 'myeongha_reader_d3e5_real_driver_pg_test';
const AT = '2026-10-14T00:00:00.000Z';
const KEY = Buffer.alloc(32, 4);
const WHSEC = 'whsec_' + KEY.toString('base64');
const HMAC_KEY = 'isolated-ci-only-keyed-evidence-secret-0123456789';
const WEBHOOK = 'd3e5-real-pg-webhook-1';

describe.runIf(ENABLED)('D3e5 real DB signed ingress and fenced private worker',()=>{
  const pg = new Pool({
    host:process.env.PGHOST,port:process.env.PGPORT?Number(process.env.PGPORT):undefined,
    database:process.env.PGDATABASE,user:process.env.PGUSER,
    password:process.env.PGPASSWORD,max:4,
  });
  afterAll(()=>pg.end());
  const pool:PostgresSubjectPoolV1 = {
    connect:async():Promise<PostgresSubjectConnectionV1>=>{
      const client=await pg.connect();
      return {
        query:async<Row=Record<string,unknown>>(text:string,values:readonly unknown[]=[])=>({
          rows:(await client.query(text,[...values])).rows as Row[],
        }),
        release:(error?:unknown)=>client.release(error instanceof Error?error:undefined),
      };
    },
  };
  const store=createPrivateCancelDurableWorkerStoreTestV1(pool);
  const fetchImpl=vi.fn(async(url:string)=>{
    expect(url).toBe('https://api.portone.io/payments/d3e5-payment-1');
    return new Response(JSON.stringify({
      id:'d3e5-payment-1',transactionId:'d3e5-transaction-1',
      storeId:'d3e5-store-1',channel:{type:'TEST'},status:'CANCELLED',
      statusChangedAt:'2026-10-14T00:01:00.000Z',
      amount:{paid:8900,cancelled:8900},currency:'KRW',
      cancellations:[{id:'d3e5-cancel-1',status:'SUCCEEDED',totalAmount:8900}],
    }),{headers:{'content-type':'application/json'}});
  });
  it('commits signed inbox -> GET mock -> same-TX 1860 observation + completed state; next tick idle',async()=>{
    const body=Buffer.from(JSON.stringify({
      type:'Transaction.Cancelled',timestamp:AT,
      data:{paymentId:'d3e5-payment-1',transactionId:'d3e5-transaction-1',
        storeId:'d3e5-store-1',cancellationId:'d3e5-cancel-1'},
    }));
    const seconds=String(Date.parse(AT)/1000);
    const sig=createHmac('sha256',KEY).update(WEBHOOK+'.'+seconds+'.').update(body).digest('base64');
    const client=await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      expect((await stageSignedPortOneV2CancellationInboxV1({
        request:{rawBody:body,headers:{
          'content-type':'application/json','webhook-id':WEBHOOK,
          'webhook-timestamp':seconds,'webhook-signature':'v1,'+sig,
        }},
        webhookConfig:{environment:'sandbox',webhookSecrets:[WHSEC],now:()=>new Date(AT)},
        evidenceHmacSecret:HMAC_KEY,
        recorder:createPrivateOfficialReaderCancelInboxRecorderTestV1(client),
      })).kind).toBe('queued');
      await client.query('COMMIT');
    } catch(error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }

    const tick=()=>processOnePrivatePortOneCancelWorkV1({
      store,workerId:'ci_worker_d3e5',leaseSeconds:90,lookupTimeoutMs:30000,
      evidenceHmacSecret:HMAC_KEY,portOneApiSecret:'synthetic-no-network',
      fetchImpl,
    });
    expect(await tick()).toMatchObject({
      kind:'completed',attemptCount:1,failureCode:null,
      effectAuthorized:false,providerRefundAuthorized:false,entitlementMutationAuthorized:false,
    });
    const row=await pg.query<{
      inbox_state:string; attempt_count:number; shadow_observation_id:string|null;
    }>('select inbox_state,attempt_count,shadow_observation_id::text from public.official_reader_portone_cancel_ingress_inbox_v1 where webhook_id=$1',[WEBHOOK]);
    expect(row.rows[0]).toMatchObject({inbox_state:'completed',attempt_count:1});
    expect(row.rows[0]?.shadow_observation_id).toMatch(/^[a-f0-9-]{36}$/u);
    expect((await pg.query<{n:string}>(
      'select count(*)::text as n from public.official_reader_portone_cancel_observation_shadow_v1 where webhook_id=$1',[WEBHOOK],
    )).rows[0]?.n).toBe('1');
    expect(await tick()).toEqual({kind:'idle',effectAuthorized:false});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await pg.query<{n:string}>('select count(*)::text as n from public.entitlement_events')).rows[0]?.n).toBe('0');
  });
});
