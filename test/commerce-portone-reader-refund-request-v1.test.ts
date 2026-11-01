import {beforeEach, describe,expect,it,vi} from 'vitest';
import {
  executePrivatelyAuthorizedReaderFullRefundV1,
  READER_FULL_REFUND_PRIVATE_V1,
  type ReaderPrivateRefundFetchV1,
} from '../apps/api/src/commerce-portone-reader-refund-request-v1.js';
import {applyVerifiedPortOneV2ReaderFullCancellationV1} from
  '../apps/api/src/commerce-portone-verified-reader-full-cancellation.js';
import type {PostgresSubjectPoolV1} from '../apps/api/src/postgres-subject-execution.js';
import {readFileSync} from 'node:fs';

vi.mock('../apps/api/src/commerce-portone-verified-reader-full-cancellation.js', () => ({
  applyVerifiedPortOneV2ReaderFullCancellationV1:vi.fn(async()=>({
    kind:'revoked',receiptId:'11111111-1111-4111-8111-111111111111',
    providerEventId:'22222222-2222-4222-8222-222222222222',grantCount:1,
  })),
}));

const auth='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const cancellation='portone-cancel-001';
const proof={
  paymentId:'read-payment-001',transactionId:'read-tx-001',
  cancellationId:cancellation,environment:'production' as const,
  verifiedAmountMinor:8900,verifiedCurrency:'KRW',
  cancelledAt:'2026-11-01T00:00:00Z',
  evidenceFingerprint:'hmac-sha256:k1:'+'f'.repeat(64),
  verifierRevision:'portone-v2-payment-full-cancel-lookup-v1',
};
function fixture(){
  let state:'approved'|'dispatching'|'submitted'|'confirmed'='approved';
  let savedCancellation: string|null=null;
  let recordCount=0;
  let confirmCount=0;
  const statements: string[]=[];
  const pool:PostgresSubjectPoolV1={
    connect:vi.fn(async()=>({
      query:vi.fn(async(sql:string, args?:unknown[])=>{
        statements.push(sql);
        if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'
          ||sql==='SET LOCAL ROLE myeongha_commerce_internal_executor')
          return {rows:[]};
        if(sql.includes('internal_reserve_reader_full_refund_dispatch_v1')){
          const decision=state==='approved'?'dispatch':
            state==='confirmed'?'completed':'reconcile_only';
          if(state==='approved')state='dispatching';
          return {rows:[{
            decision,paymentId:proof.paymentId,transactionId:proof.transactionId,
            originalAmountMinor:'8900',originalCurrency:'KRW',
            refundReason:'Customer-approved full withdrawal',
            knownCancellationId:savedCancellation,
          }]};
        }
        if(sql.includes('internal_record_reader_full_refund_response_v1')){
          expect(args?.[0]).toBe(auth);
          savedCancellation=String(args?.[1]);
          recordCount++;
          state='submitted';
          return {rows:[{recorded:true}]};
        }
        if(sql.includes('internal_confirm_reader_full_refund_dispatch_v1')){
          expect(args?.[1]).toBe(savedCancellation);
          confirmCount++;
          state='confirmed';
          return {rows:[{confirmed:true}]};
        }
        throw Error('UNEXPECTED_SQL:'+sql);
      }),
      release:vi.fn(),
    })),
  };
  const fetchImpl=vi.fn<ReaderPrivateRefundFetchV1>(async()=>{
    return {
      status:200,headers:{get:(key)=>key==='content-type'?'application/json':null},
      text:async()=>JSON.stringify({cancellation:{id:cancellation,status:'SUCCEEDED'}}),
    };
  });
  const verifier={verifyFullCancellation:vi.fn(async()=>proof)};
  const run=()=>executePrivatelyAuthorizedReaderFullRefundV1({
    pool,authorizationId:auth,apiSecret:'private-service-api-secret-12345',
    fetchImpl,verifier,
  });
  return {pool,fetchImpl,verifier,run,statements,
    get state(){return state},
    get recordCount(){return recordCount},
    get confirmCount(){return confirmCount},
  };
}

describe('exact manually authorized PortOne V2 Reader full refund dispatch',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('does not expose a public route or automatic authorization',()=>{
    expect(READER_FULL_REFUND_PRIVATE_V1).toMatchObject({
      publicRouteMounted:false,productionAutomaticallyEnabled:false,
      supportedEnvironment:'production',
    });
  });
  it('reserves before POST; POST full amount, GET verifies, DB revokes exactly once',async()=>{
    const f=fixture();
    const result=await f.run();
    expect(result).toEqual({
      kind:'confirmed_revoked',providerRefundConfirmed:true,readerGrantRevoked:true,
    });
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    const [url,init]=f.fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.portone.io/payments/read-payment-001/cancel');
    expect(init).toMatchObject({
      method:'POST',redirect:'manual',
      headers:{
        'idempotency-key':'"'+auth+'"',
        'content-type':'application/json',
      },
    });
    expect(JSON.parse(init.body)).toEqual({
      reason:'Customer-approved full withdrawal',currentCancellableAmount:8900,
    });
    expect(f.verifier.verifyFullCancellation).toHaveBeenCalledWith({
      paymentId:proof.paymentId,transactionId:proof.transactionId,
      cancellationId:cancellation,environment:'production',
    });
    expect(applyVerifiedPortOneV2ReaderFullCancellationV1).toHaveBeenCalledTimes(1);
    expect(f.recordCount).toBe(1);
    expect(f.confirmCount).toBe(1);
    const second=await f.run();
    expect(second.kind).toBe('already_confirmed');
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('keeps REQUESTED pending and later GET reconciles without second POST',async()=>{
    const f=fixture();
    f.fetchImpl.mockResolvedValue({
      status:200,headers:{get:key=>key==='content-type'?'application/json':null},
      text:async()=>JSON.stringify({cancellation:{id:cancellation,status:'REQUESTED'}}),
    });
    f.verifier.verifyFullCancellation.mockRejectedValueOnce(Error('still pending'));
    const result=await f.run();
    expect(result).toMatchObject({kind:'submitted_pending_provider',
      providerRefundConfirmed:false,readerGrantRevoked:false});
    expect(applyVerifiedPortOneV2ReaderFullCancellationV1).not.toHaveBeenCalled();
    expect(f.state).toBe('submitted');
    expect((await f.run()).kind).toBe('confirmed_revoked');
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('never resends uncertain provider POST, even on worker restart',async()=>{
    const f=fixture();
    f.fetchImpl.mockRejectedValue(Error('network response lost'));
    expect((await f.run()).kind).toBe('reconciliation_required');
    expect(f.state).toBe('dispatching');
    expect((await f.run()).kind).toBe('reconciliation_required');
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    expect(f.recordCount).toBe(0);
    expect(f.confirmCount).toBe(0);
  });
  it.each([
    {status:302,contentType:'application/json',body:{cancellation:{id:cancellation,status:'SUCCEEDED'}}},
    {status:200,contentType:'text/html',body:{cancellation:{id:cancellation,status:'SUCCEEDED'}}},
    {status:200,contentType:'application/json',body:{cancellation:{id:cancellation,status:'FAILED'}}},
    {status:200,contentType:'application/json',body:{cancellation:{id:cancellation,status:'UNKNOWN'}}},
  ])('never assumes POST response authorizes refund: %j',async(data)=>{
    const f=fixture();
    f.fetchImpl.mockResolvedValue({
      status:data.status,
      headers:{get:key=>key==='content-type'?data.contentType:null},
      text:async()=>JSON.stringify(data.body),
    });
    expect((await f.run()).kind).toBe('reconciliation_required');
    expect(f.state).toBe('dispatching');
    expect(applyVerifiedPortOneV2ReaderFullCancellationV1).not.toHaveBeenCalled();
  });
  it('blocks a provider GET that changes transaction or verified money',async()=>{
    const f=fixture();
    f.verifier.verifyFullCancellation.mockResolvedValue({...proof,verifiedAmountMinor:200});
    await expect(f.run()).rejects.toThrow('REFUND_VERIFIED_SCOPE_MISMATCH');
    expect(f.confirmCount).toBe(0);
    expect(applyVerifiedPortOneV2ReaderFullCancellationV1).not.toHaveBeenCalled();
  });
  it('recovers a lost POST response through provider GET without a second cancellation POST',async()=>{
    const f=fixture();
    f.fetchImpl.mockRejectedValue(Error('response lost after provider acceptance'));
    expect((await f.run()).kind).toBe('reconciliation_required');
    const lookupFetchImpl=vi.fn(async()=>({
      status:200,
      headers:{get:(key:string)=>key==='content-type'?'application/json':null},
      text:async()=>JSON.stringify({
        id:proof.paymentId,transactionId:proof.transactionId,
        status:'CANCELLED',currency:'KRW',amount:{total:8900},
        cancellations:[{id:cancellation,status:'SUCCEEDED'}],
      }),
    }));
    const result=await executePrivatelyAuthorizedReaderFullRefundV1({
      pool:f.pool,authorizationId:auth,apiSecret:'private-service-api-secret-12345',
      fetchImpl:f.fetchImpl,lookupFetchImpl,
      verifier:f.verifier,
    });
    expect(result.kind).toBe('confirmed_revoked');
    expect(lookupFetchImpl).toHaveBeenCalledTimes(1);
    const [url,init]=lookupFetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.portone.io/payments/read-payment-001');
    expect(init).toMatchObject({method:'GET',redirect:'manual'});
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    expect(f.recordCount).toBe(1);
    expect(f.confirmCount).toBe(1);
  });
  it('rejects ambiguous cancellation recovery rather than revoking the grant',async()=>{
    const f=fixture();
    f.fetchImpl.mockRejectedValue(Error('POST lost'));
    await f.run();
    const lookupFetchImpl=vi.fn(async()=>({
      status:200,
      headers:{get:(key:string)=>key==='content-type'?'application/json':null},
      text:async()=>JSON.stringify({
        id:proof.paymentId,transactionId:proof.transactionId,
        status:'CANCELLED',currency:'KRW',amount:{total:8900},
        cancellations:[
          {id:cancellation,status:'SUCCEEDED'},
          {id:'other-cancel',status:'SUCCEEDED'},
        ],
      }),
    }));
    const result=await executePrivatelyAuthorizedReaderFullRefundV1({
      pool:f.pool,authorizationId:auth,apiSecret:'private-service-api-secret-12345',
      fetchImpl:f.fetchImpl,lookupFetchImpl,verifier:f.verifier,
    });
    expect(result.kind).toBe('reconciliation_required');
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    expect(f.recordCount).toBe(0);
    expect(f.confirmCount).toBe(0);
  });
  it('does not call a revoked grant when provider cancelled before any grant issued',async()=>{
    const f=fixture();
    vi.mocked(applyVerifiedPortOneV2ReaderFullCancellationV1).mockResolvedValueOnce({
      kind:'cancelled_before_grant',
      receiptId:'11111111-1111-4111-8111-111111111111',
      providerEventId:'22222222-2222-4222-8222-222222222222',
      grantCount:0,
    });
    const result=await f.run();
    expect(result).toEqual({
      kind:'confirmed_no_grant',
      providerRefundConfirmed:true,
      readerGrantRevoked:false,
    });
    expect(f.confirmCount).toBe(1);
  });
  it('refuses invalid provider configuration BEFORE marking a refund dispatch',async()=>{
    const f=fixture();
    await expect(executePrivatelyAuthorizedReaderFullRefundV1({
      pool:f.pool,authorizationId:auth,apiSecret:'invalid',
      verifier:f.verifier,fetchImpl:f.fetchImpl,
    })).rejects.toThrow('REFUND_PROVIDER_NOT_CONFIGURED');
    expect(f.statements).toEqual([]);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('fails before DB/PSP on invalid decision ID',async()=>{
    const f=fixture();
    await expect(executePrivatelyAuthorizedReaderFullRefundV1({
      pool:f.pool,authorizationId:'attacker',apiSecret:'secret',
      verifier:f.verifier,fetchImpl:f.fetchImpl,
    })).rejects.toThrow('INVALID_REFUND_AUTHORIZATION_ID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.statements).toEqual([]);
  });
  it('migration only grants the internal executor private commands, never auto-approves',()=>{
    const sql=readFileSync(new URL(
      '../supabase/migrations/2310_official_reader_private_refund_dispatch_v1.sql',
      import.meta.url),'utf8');
    expect(sql).toContain('receipt_id uuid not null unique');
    expect(sql).toContain('legal_decision_ref text not null');
    expect(sql).toContain("status='dispatching'");
    expect(sql).toContain("verification_status='revoked'");
    expect(sql).toContain('grant execute on function public.internal_reserve_reader_full_refund_dispatch_v1(uuid)');
    expect(sql).toContain('to myeongha_commerce_internal_executor;');
    expect(sql).not.toContain('grant insert');
  });
});
