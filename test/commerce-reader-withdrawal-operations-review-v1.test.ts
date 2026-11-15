import {describe,it,expect,vi} from 'vitest';
import {readPrivilegedReaderWithdrawalCaseV1 as review,
  READER_WITHDRAWAL_PRIVATE_REVIEW_V1 as policy,
} from '../apps/api/src/commerce-reader-withdrawal-operations-review-v1.js';
import type {PostgresSubjectPoolV1} from '../apps/api/src/postgres-subject-execution.js';

const claim='11111111-1111-4111-8111-111111111111';
const subject='22222222-2222-4222-8222-222222222222';
const intent='33333333-3333-4333-8333-333333333333';
const unit='44444444-4444-4444-8444-444444444444';
const receipt='55555555-5555-4555-8555-555555555555';
type Options={general?:boolean;privileged?:boolean;readOnly?:boolean;
  missing?:boolean;many?:boolean;conflict?:boolean;roleName?:string|null};
function fixture(options:Options={}){
  const statements:{sql:string;args:readonly unknown[]|undefined}[]=[];
  // Vitest generic SQL mock is runtime-valid; its generic return cannot be inferred by TS.
  const pool={
    connect:vi.fn(async()=>({
      query:vi.fn(async<T=Record<string,unknown>>(sql:string,args?:readonly unknown[])=>{
        statements.push({sql,args});
        if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK')
          return {rows:[] as T[]};
        if(sql.includes('rolsuper or rolbypassrls'))
          return {rows:[{fullVisibility:options.privileged!==false,
            readOnly:options.readOnly!==false,
            currentUser:options.roleName===undefined?'postgres':options.roleName} as T]};
        if(sql.includes('from public.digital_reading_withdrawal_claims_private_v1'))
          return {rows:options.missing?[] as T[]:[{
            claimId:claim,subjectId:subject,
            purchaseIntentId:options.general?null:intent,
            unitId:options.general?null:unit,reasonCode:'not_provided',
            state:'received',receivedAt:'2026-11-01T00:00:00Z',
          } as T]};
        if(sql.includes('from public.commerce_receipts cr')){
          const row={receiptId:receipt,purchaseIntentId:intent,
            currency:'KRW',amountMinor:'8900',verificationStatus:'verified'};
          return {rows:options.many?
            Array.from({length:26},(_,i)=>({
              ...row,receiptId:(i+1).toString().padStart(8,'0')+'-1111-4111-8111-111111111111',
            }) as T):[{...row,...(options.conflict?{purchaseIntentId:unit}:{})} as T]};
        }
        throw Error('unexpected SQL');
      }),
      release:vi.fn(),
    })),
  };
  return {pool:pool as unknown as PostgresSubjectPoolV1,statements};
}
describe('operations-only Reader withdrawal review / exact refund handoff',()=>{
  it('is never a public, automated legal or money event',()=>{
    expect(policy).toMatchObject({
      publicRouteMounted:false,providerCancellationAuthorized:false,
      legalDecisionAutomatic:false,databaseWrites:false,
    });
  });
  it('reads exact claim and scoped verified Reader receipt, requiring explicit approval',async()=>{
    const f=fixture();
    const r=await review({pool:f.pool,claimId:claim});
    expect(r).toMatchObject({
      claimId:claim,subjectId:subject,hasExactPurchasedUnit:true,
      requiresExplicitReceiptSelection:true,refundApproved:false,
      providerRefundCompleted:false,candidateLimitExceeded:false,
    });
    expect(r?.receipts).toEqual([{
      receiptId:receipt,purchaseIntentId:intent,
      currency:'KRW',amountMinor:8900,verificationStatus:'verified',
    }]);
    const sql=f.statements.find(s=>s.sql.includes('from public.commerce_receipts cr'))!;
    expect(sql.args).toEqual([subject,intent,unit]);
    expect(sql.sql).toContain('cr.subject_id=$1::uuid');
    expect(sql.sql).toContain("cr.environment='production'");
    expect(f.statements[0]?.sql).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(f.statements.at(-1)?.sql).toBe('COMMIT');
  });
  it('keeps a general unlinked claim as manual receipt selection',async()=>{
    const f=fixture({general:true});
    const r=await review({pool:f.pool,claimId:claim});
    expect(r?.hasExactPurchasedUnit).toBe(false);
    expect(r?.requiresExplicitReceiptSelection).toBe(true);
    expect(f.statements.find(s=>s.sql.includes('from public.commerce_receipts cr'))?.args)
      .toEqual([subject,null,null]);
  });
  it('does not invent missing claim or payment evidence',async()=>{
    const f=fixture({missing:true});
    expect(await review({pool:f.pool,claimId:claim})).toBeNull();
    expect(f.statements.some(s=>s.sql.includes('from public.commerce_receipts cr')))
      .toBe(false);
  });
  it.each([{privileged:false},{readOnly:false}])('rejects non-owner or writable scope',async opts=>{
    const f=fixture(opts);
    await expect(review({pool:f.pool,claimId:claim}))
      .rejects.toThrow('PRIVATE_REVIEW_FULL_VISIBILITY_REQUIRED');
    expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
  });
  it.each([
    'anon','authenticated','service_role','myeongha_api_executor',
    'myeongha_worker_runtime','myeongha_commerce_internal_executor',
    null,' postgres ',
  ])('denies non-owner %s before reading private customer Claims',async roleName=>{
    const f=fixture({roleName});
    await expect(review({pool:f.pool,claimId:claim}))
      .rejects.toThrow('PRIVATE_REVIEW_FULL_VISIBILITY_REQUIRED');
    expect(f.statements.map(s=>s.sql)).toHaveLength(3);
    expect(f.statements.some(s=>s.sql.includes(
      'from public.digital_reading_withdrawal_claims_private_v1'))).toBe(false);
    expect(f.statements.some(s=>s.sql.includes('from public.commerce_receipts cr')))
      .toBe(false);
    expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
  });
  it('rejects receipt from a different purchase unit',async()=>{
    const f=fixture({conflict:true});
    await expect(review({pool:f.pool,claimId:claim}))
      .rejects.toThrow('PRIVATE_REVIEW_RECEIPT_MISMATCH');
    expect(f.statements.at(-1)?.sql).toBe('ROLLBACK');
  });
  it('reports uncertainty when over 25 receipts are found',async()=>{
    const f=fixture({general:true,many:true});
    const r=await review({pool:f.pool,claimId:claim});
    expect(r?.candidateLimitExceeded).toBe(true);
    expect(r?.receipts).toHaveLength(25);
    expect(r?.requiresExplicitReceiptSelection).toBe(true);
  });
  it('rejects an invalid claim ID before DB access',async()=>{
    const f=fixture();
    await expect(review({pool:f.pool,claimId:'hijack'})).rejects.toThrow(
      'PRIVATE_REVIEW_REQUEST_INVALID');
    expect(f.statements).toHaveLength(0);
  });
});
