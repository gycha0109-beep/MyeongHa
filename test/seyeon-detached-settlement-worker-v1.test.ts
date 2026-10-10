import { describe, expect, it } from 'vitest';
import {
  createSeyeonDetachedSettlementWorkerFromDriverV1,
  DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1,
  SEYEON_DETACHED_WORKER_LOGIN_V1,
  SEYEON_DETACHED_WORKER_ROLE_V1,
  verifySeyeonDetachedWorkerLoginV1,
  type SeyeonServerStoredProviderReceiptV1,
} from '../apps/api/src/seyeon-detached-settlement-worker-v1.js';
import type { NodePostgresDriverPoolV1 } from '../apps/api/src/node-postgres-subject-pool.js';

const subjectId='a0000000-0000-0000-0000-000000000001';
const turnId='a4000000-0000-0000-0000-000000000006';
const attemptId='a6000000-0000-0000-0000-000000000006';
const callId='d4b90000-0000-4000-8000-000000000011';
const receipt: SeyeonServerStoredProviderReceiptV1={
  subjectId,turnId,attemptId,phase:'post_turn',callId,
  purpose:'event_extraction',providerKey:'openai-responses',
  modelKey:'d4-offline-no-network-model',
  reservedPrice:{
    providerKey:'openai-responses',modelKey:'d4-offline-no-network-model',
    priceVersion:'d4-rate-v1',inputMicroUsdPerMillion:1_000_000,
    cachedInputMicroUsdPerMillion:1_000_000,
    outputMicroUsdPerMillion:4_000_000,
  },
  providerResult:{
    outcome:'response_received',httpStatus:200,elapsedMs:8,
    usage:{inputTokens:100,cachedInputTokens:0,outputTokens:50,reasoningTokens:0},
  },
};
function goodPreflight(){
  return {
    sessionUser:SEYEON_DETACHED_WORKER_LOGIN_V1,
    currentUser:SEYEON_DETACHED_WORKER_LOGIN_V1,
    canLogin:true,canInherit:false,isSuper:false,canBypassRls:false,
    canCreateDb:false,canCreateRole:false,
    hasWorkerRole:true,otherMemberships:0,
    isApiMember:false,isGovernedMember:false,isCostOwnerMember:false,
    workerCanSettle:true,canDirectSettle:false,
    canStart:false,canReadLedger:false,canReadBudget:false,
  };
}
function fixture(options:{
  readonly given?:SeyeonServerStoredProviderReceiptV1|null;
  readonly preflight?:Record<string,unknown>;
  readonly roleName?:string;
  readonly failSql?:string;
  readonly commitReplyLost?:boolean;
  readonly replayed?:boolean;
}={}){
  const calls:Array<{sql:string;args?:readonly unknown[]}>=[], releases:Array<Error|undefined>=[];
  const acknowledgements:string[]=[];
  let ended=false;
  const pool:NodePostgresDriverPoolV1={
    async connect(){
      return {
        async query(sql,args){
          calls.push({sql,...(args===undefined?{}:{args})});
          if(sql===options.failSql) throw new Error('Synthetic PostgreSQL failure');
          if(sql==='COMMIT' && options.commitReplyLost){
            throw new Error('Commit reply was lost');
          }
          if(sql===DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1)
            return {rows:[options.preflight??goodPreflight()]};
          if(sql==='select current_user::text as "currentUser"')
            return {rows:[{currentUser:options.roleName??SEYEON_DETACHED_WORKER_ROLE_V1}]};
          if(sql.includes('cmd_settle_seyeon_ai_call_detached_v1'))
            return {rows:[{
              callId,replayed:options.replayed??false,
              occupiedMicroUsd:'300',overCeiling:false,
            }]};
          return {rows:[]};
        },
        release(error){releases.push(error);},
      };
    },
    async end(){ended=true;},
  };
  let pending=options.given===undefined?receipt:options.given;
  const worker=createSeyeonDetachedSettlementWorkerFromDriverV1({
    driverPool:pool,
    source:{
      async loadNextStoredReceipt(){return pending;},
      async acknowledgeSettled(id){acknowledgements.push(id);pending=null;},
    },
  });
  return {worker,calls,releases,acknowledgements,get ended(){return ended;}};
}

describe('D4B-10A detached server-only binding (synthetic, no Production source)',()=>{
  it('rejects every elevated login, role, or direct ledger permission',()=>{
    verifySeyeonDetachedWorkerLoginV1([goodPreflight()]);
    for(const [field,value] of [
      ['sessionUser','myeongha_api_login'],
      ['currentUser','myeongha_api_login'],
      ['canLogin',false],['canInherit',true],['isSuper',true],
      ['canBypassRls',true],['canCreateDb',true],['canCreateRole',true],
      ['hasWorkerRole',false],['otherMemberships',1],['isApiMember',true],
      ['isGovernedMember',true],['isCostOwnerMember',true],
      ['workerCanSettle',false],['canDirectSettle',true],
      ['canStart',true],['canReadLedger',true],
      ['canReadBudget',true],
    ] as const){
      expect(()=>verifySeyeonDetachedWorkerLoginV1([
        {...goodPreflight(),[field]:value},
      ]),field).toThrow();
    }
    expect(()=>verifySeyeonDetachedWorkerLoginV1([])).toThrow();
    expect(()=>verifySeyeonDetachedWorkerLoginV1([
      goodPreflight(),goodPreflight(),
    ])).toThrow();
  });

  it('loads server-stored receipt, builds the event from pinned pricing, settles once',async()=>{
    const f=fixture();
    const result=await f.worker.settleNext();
    expect(result).toEqual({callId,replayed:false,occupiedMicroUsd:300n,overCeiling:false});
    expect(f.acknowledgements).toEqual([callId]);
    expect(f.releases).toEqual([undefined]);
    expect(f.calls.map(x=>x.sql)).toEqual([
      DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1,'BEGIN',
      'SET LOCAL ROLE myeongha_seyeon_settlement_worker',
      'select current_user::text as "currentUser"',
      expect.stringContaining('cmd_settle_seyeon_ai_call_detached_v1'),
      'COMMIT',
    ]);
    const parameters=f.calls[4]?.args;
    expect(parameters?.slice(0,4)).toEqual([subjectId,turnId,attemptId,'post_turn']);
    const event=JSON.parse(String(parameters?.[4])) as Record<string,unknown>;
    expect(event).toMatchObject({
      callId,providerKey:'openai-responses',
      modelKey:'d4-offline-no-network-model',
      priceVersion:'d4-rate-v1',costStatus:'estimated',
      estimatedCostMicroUsd:300,invoiceReconciled:false,
    });
    expect(f.calls.some(c=>c.sql!==DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1 &&
      /cmd_governed_start|begin_guest_subject_context/u.test(c.sql)))
      .toBe(false);
    expect(await f.worker.settleNext()).toBeNull();
    await f.worker.close();expect(f.ended).toBe(true);
  });

  it('never acknowledges a lost COMMIT reply; an identical receipt is replayable',async()=>{
    const lost=fixture({commitReplyLost:true});
    await expect(lost.worker.settleNext()).rejects.toThrow('Commit reply was lost');
    expect(lost.acknowledgements).toEqual([]);
    expect(lost.releases[0]).toBeInstanceOf(Error);
    const retry=fixture({replayed:true});
    const result=await retry.worker.settleNext();
    expect(result?.replayed).toBe(true);
    expect(retry.acknowledgements).toEqual([callId]);
  });

  it('rolls back and does not acknowledge failed SQL or unsafe role switches',async()=>{
    const sqlFixture=fixture();
    const rpc=sqlFixture.worker;
    // A synthetic driver whose query fails at COMMIT keeps the receipt pending.
    const fail=fixture({failSql:'SET LOCAL ROLE myeongha_seyeon_settlement_worker'});
    await expect(fail.worker.settleNext()).rejects.toThrow();
    expect(fail.calls.map(c=>c.sql).at(-1)).toBe('ROLLBACK');
    expect(fail.acknowledgements).toEqual([]);
    expect(fail.releases[0]).toBeInstanceOf(Error);
    const bad=fixture({roleName:'myeongha_api_executor'});
    await expect(bad.worker.settleNext()).rejects.toThrow();
    expect(bad.acknowledgements).toEqual([]);
    expect(bad.calls.map(c=>c.sql).at(-1)).toBe('ROLLBACK');
    const elevated=fixture({preflight:{...goodPreflight(),canReadLedger:true}});
    await expect(elevated.worker.settleNext()).rejects.toThrow();
    expect(elevated.calls).toHaveLength(1);
    expect(elevated.acknowledgements).toEqual([]);
    expect(rpc).toBeDefined();
  });

  it('refuses invented price and mismatched server receipt before any connection',async()=>{
    const mismatch=fixture({given:{...receipt,
      reservedPrice:{...receipt.reservedPrice,providerKey:'other-provider'},
    }});
    await expect(mismatch.worker.settleNext()).rejects.toThrow();
    expect(mismatch.calls).toHaveLength(0);
    const invalid=fixture({given:{...receipt,
      subjectId:'not-a-uuid',
    }});
    await expect(invalid.worker.settleNext()).rejects.toThrow();
    expect(invalid.calls).toHaveLength(0);
  });

  it('preserves unknown provider usage instead of fabricating zero cost',async()=>{
    const unknown=fixture({given:{...receipt,
      providerResult:{
        outcome:'timeout',httpStatus:null,elapsedMs:8,
        usage:{
          inputTokens:null,cachedInputTokens:null,
          outputTokens:null,reasoningTokens:null,
        },
      },
    }});
    await unknown.worker.settleNext();
    const event=JSON.parse(String(unknown.calls[4]?.args?.[4])) as Record<string,unknown>;
    expect(event).toMatchObject({
      outcome:'timeout',costStatus:'usage_unknown',
      estimatedCostMicroUsd:null,invoiceReconciled:false,
    });
  });

  it('does nothing when private receipt source has no pending item',async()=>{
    const empty=fixture({given:null});
    expect(await empty.worker.settleNext()).toBeNull();
    expect(empty.calls).toEqual([]);
  });
});
