import {describe,expect,it} from 'vitest';
import {
  ACK_SEYEON_PROVIDER_RECEIPT_SQL_V1,
  CLAIM_SEYEON_PROVIDER_RECEIPT_SQL_V1,
  createSeyeonPostgresProviderReceiptSourceV1,
} from '../apps/api/src/seyeon-postgres-provider-receipt-source-v1.js';
import {
  createSeyeonDetachedSettlementWorkerFromDriverV1,
  DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1,
  SEYEON_DETACHED_WORKER_LOGIN_V1,
  SEYEON_DETACHED_WORKER_ROLE_V1,
} from '../apps/api/src/seyeon-detached-settlement-worker-v1.js';
import {createSeyeonAiCostEventV1} from '../apps/api/src/seyeon-ai-usage-cost-v1.js';
import type {NodePostgresDriverPoolV1} from '../apps/api/src/node-postgres-subject-pool.js';

const subjectId='a0000000-0000-0000-0000-000000000001';
const turnId='a4000000-0000-0000-0000-000000000006';
const attemptId='a6000000-0000-0000-0000-000000000006';
const callId='d4c10000-0000-4000-8000-000000000011';
const token='d4c30000-0000-4000-8000-000000000022';
const providerKey='openai-responses';
const modelKey='d4-offline-no-network-model';
const price={
  priceVersion:'d4-rate-v1',providerKey,modelKey,
  inputMicroUsdPerMillion:1_000_000,
  cachedInputMicroUsdPerMillion:1_000_000,
  outputMicroUsdPerMillion:4_000_000,
};
function makeEvent(kind:'known'|'unknown'='known'){
  return createSeyeonAiCostEventV1({
    callId,purpose:'event_extraction',providerKey,modelKey,
    outcome:kind==='known'?'response_received':'timeout',
    httpStatus:kind==='known'?200:null,elapsedMs:8,
    usage:kind==='known' ?
      {inputTokens:100,cachedInputTokens:0,outputTokens:50,reasoningTokens:0} :
      {inputTokens:null,cachedInputTokens:null,outputTokens:null,reasoningTokens:null},
    price,
  });
}
function preflight(){
  return {
    sessionUser:SEYEON_DETACHED_WORKER_LOGIN_V1,
    currentUser:SEYEON_DETACHED_WORKER_LOGIN_V1,
    canLogin:true,canInherit:false,isSuper:false,canBypassRls:false,
    canCreateDb:false,canCreateRole:false,hasWorkerRole:true,otherMemberships:0,
    isApiMember:false,isGovernedMember:false,isCostOwnerMember:false,
    workerCanSettle:true,canDirectSettle:false,canStart:false,
    canReadLedger:false,canReadBudget:false,
  };
}
function queued(kind:'known'|'unknown'='known'){
  return {
    callId,subjectId,turnId,attemptId,phase:'post_turn',
    purpose:'event_extraction',providerKey,modelKey,priceVersion:price.priceVersion,
    inputRate:'1000000',cachedInputRate:'1000000',outputRate:'4000000',
    providerEvent:makeEvent(kind),claimToken:token,
  };
}
function mockPool(input:{
  row?:Record<string,unknown>|null;
  lostClaimCommit?:boolean;
  lostAckCommit?:boolean;
  badPreflight?:boolean;
  wrongRole?:boolean;
  errorOn?:string;
}={}){
  const calls:Array<{sql:string;params?:readonly unknown[]}>=[], releases:Array<Error|undefined>=[];
  let claims=0,acks=0,ends=0,settlements=0,commits=0;
  const pool:NodePostgresDriverPoolV1={
    async connect(){
      return {
        async query(sql,params){
          calls.push({sql,...(params===undefined?{}:{params})});
          if (sql===input.errorOn) throw new Error('synthetic db exception');
          if (sql==='COMMIT') {
            commits++;
            // Source claim COMMIT is first. ACK is third (claim -> settle -> ack).
            if (commits===1&&input.lostClaimCommit) throw new Error('lost claim COMMIT reply');
            if (commits===3&&input.lostAckCommit) throw new Error('lost ack COMMIT reply');
          }
          if (sql===DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1)
            return {rows:[{...preflight(),...(input.badPreflight?{canReadLedger:true}:{})}]};
          if (sql==='select current_user::text as "currentUser"')
            return {rows:[{currentUser:input.wrongRole?'myeongha_api_executor':SEYEON_DETACHED_WORKER_ROLE_V1}]};
          if (sql===CLAIM_SEYEON_PROVIDER_RECEIPT_SQL_V1) {
            claims++;
            return {rows:claims===1&&input.row!==null?[input.row??queued()]:[]};
          }
          if (sql.includes('cmd_settle_seyeon_ai_call_detached_v1')) {
            settlements++;
            const event=JSON.parse(String(params?.[4])) as Record<string,unknown>;
            expect(event).toEqual(input.row?.providerEvent??queued().providerEvent);
            return {rows:[{callId,replayed:false,
              occupiedMicroUsd:event.costStatus==='estimated'?'300':'3700',
              overCeiling:false}]};
          }
          if (sql===ACK_SEYEON_PROVIDER_RECEIPT_SQL_V1) {
            acks++;
            expect(params).toEqual([callId,token]);
            return {rows:[{acknowledged:true}]};
          }
          return {rows:[]};
        },
        release(error){releases.push(error);},
      };
    },
    async end(){ends++;},
  };
  return {pool,calls,releases,
    get claims(){return claims;},get acks(){return acks;},
    get settlements(){return settlements;},get ends(){return ends;}};
}

describe('D4B-10C3 private durable receipt source (synthetic PostgreSQL)',()=>{
  it('claims, settles and acknowledges an exact persisted event with private fencing',async()=>{
    const f=mockPool();
    const source=createSeyeonPostgresProviderReceiptSourceV1(f.pool);
    const worker=createSeyeonDetachedSettlementWorkerFromDriverV1({
      driverPool:f.pool,source,
    });
    expect(await worker.settleNext()).toEqual({
      callId,replayed:false,occupiedMicroUsd:300n,overCeiling:false,
    });
    expect(f.claims).toBe(1);
    expect(f.settlements).toBe(1);
    expect(f.acks).toBe(1);
    expect(f.calls.filter(c=>c.sql===DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1))
      .toHaveLength(3);
    expect(f.calls.filter(c=>c.sql==='SET LOCAL ROLE myeongha_seyeon_settlement_worker'))
      .toHaveLength(3);
    expect(f.calls.some(c=>c.sql!==DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1 &&
      /cmd_governed_start|begin_guest_subject_context/u.test(c.sql)))
      .toBe(false);
    expect(f.releases).toEqual([undefined,undefined,undefined]);
    expect(await worker.settleNext()).toBeNull();
    await worker.close();
    expect(f.ends).toBe(1);
  });

  it('preserves unknown token usage instead of treating a timeout as free',async()=>{
    const f=mockPool({row:queued('unknown')});
    const worker=createSeyeonDetachedSettlementWorkerFromDriverV1({
      driverPool:f.pool,source:createSeyeonPostgresProviderReceiptSourceV1(f.pool),
    });
    expect(await worker.settleNext()).toMatchObject({occupiedMicroUsd:3700n});
    const settled=f.calls.find(c=>c.params?.length===5 &&
      c.sql.includes('cmd_settle_seyeon_ai_call_detached_v1'));
    const event=JSON.parse(String(settled?.params?.[4]));
    expect(event).toMatchObject({
      costStatus:'usage_unknown',estimatedCostMicroUsd:null,
      inputTokens:null,outputTokens:null,
    });
  });

  it('rejects cross-call price tampering and untrusted/provider extra data before settlement',async()=>{
    const tampered=[
      {...queued(),inputRate:'2000000'},
      {...queued(),modelKey:'fake-model'},
      {...queued(),providerEvent:{...makeEvent(),inputTokens:999}},
      {...queued(),providerEvent:{...makeEvent(),prompt:'exfiltrate'}},
      {...queued(),subjectId:'fake'},
      {...queued(),claimToken:'wrong'},
      {...queued(),inputRate:'9007199254740992'},
    ];
    for (const row of tampered) {
      const f=mockPool({row});
      const source=createSeyeonPostgresProviderReceiptSourceV1(f.pool);
      await expect(source.loadNextStoredReceipt()).rejects.toThrow();
      expect(f.settlements).toBe(0);
      expect(f.acks).toBe(0);
      expect(f.releases[0]).toBeInstanceOf(Error);
      expect(f.calls.map(x=>x.sql)).toContain('ROLLBACK');
    }
  });

  it('does not publish a claim after a lost claim COMMIT reply',async()=>{
    const f=mockPool({lostClaimCommit:true});
    const source=createSeyeonPostgresProviderReceiptSourceV1(f.pool);
    await expect(source.loadNextStoredReceipt())
      .rejects.toThrow('lost claim COMMIT reply');
    expect(f.releases[0]).toBeInstanceOf(Error);
    expect(await source.loadNextStoredReceipt()).toBeNull();
    expect(f.acks).toBe(0);
  });

  it('does not assume an ACK succeeded if its COMMIT reply is lost',async()=>{
    const f=mockPool({lostAckCommit:true});
    const worker=createSeyeonDetachedSettlementWorkerFromDriverV1({
      driverPool:f.pool,source:createSeyeonPostgresProviderReceiptSourceV1(f.pool),
    });
    await expect(worker.settleNext()).rejects.toThrow('lost ack COMMIT reply');
    expect(f.settlements).toBe(1);
    expect(f.acks).toBe(1);
    expect(f.releases[2]).toBeInstanceOf(Error);
    // DB retains immutable lease fencing. A future poll may re-claim only
    // after its expiry; never retry model inference.
    expect(await worker.settleNext()).toBeNull();
  });

  it('rejects unauthorized login and wrong role before touching queue',async()=>{
    for(const options of [{badPreflight:true},{wrongRole:true}]) {
      const f=mockPool(options);
      const source=createSeyeonPostgresProviderReceiptSourceV1(f.pool);
      await expect(source.loadNextStoredReceipt()).rejects.toThrow();
      expect(f.claims).toBe(0);
      expect(f.acks).toBe(0);
    }
  });

  it('does not accept a mismatched acknowledgement',async()=>{
    const f=mockPool();
    const source=createSeyeonPostgresProviderReceiptSourceV1(f.pool);
    expect(await source.loadNextStoredReceipt()).not.toBeNull();
    await expect(source.acknowledgeSettled(
      '00000000-0000-4000-8000-000000000000',
      {replayed:false,occupiedMicroUsd:300n,overCeiling:false},
    )).rejects.toThrow();
    expect(f.acks).toBe(0);
    await expect(source.loadNextStoredReceipt()).rejects.toThrow();
  });
});
