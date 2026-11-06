import {describe,expect,it,vi} from 'vitest';
import type {PostgresSubjectPoolV1, PostgresTransactionQueryV1} from './postgres-subject-execution.js';
import {
  CURRENT_SAJU_OWNED_FIELDS_DB_READER_V1,
  SAJU_CURRENT_GRANT_FIELDS_SQL_V1,
  quoteSajuWithStoredCurrentGrantsV1,
} from './commerce-saju-current-grant-fields-v1.js';
import {
  COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1,
  COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1,
} from './commerce-saju-verified-ledger-source-v1.js';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const subjectId=id(9001),sajuRecordId=id(9002),natalVersion=id(9003);
const receiptId=id(9004),intentId=id(9005),offerId=id(9006);
const original={
  purchaseIntentId:intentId,subjectId,sajuRecordId,natalVersion,
  purchaseKind:'original',intentStatus:'verified',receiptId,
  receiptSubjectId:subjectId,receiptIntentId:intentId,
  receiptOfferId:offerId,intentOfferId:offerId,
  receiptStatus:'verified',receiptEnvironment:'production',
  verifiedPaidMinor:'9900',currency:'KRW',
  productKey:'standard.career',refundedMinor:'0',
  upgradeFromReceiptIds:[],unsettledCancellationCount:'0',
};
function evidence(field='career',grant=id(9007)) {
  return {
    subjectId,sajuRecordId,natalVersion,receiptId,grantId:grant,
    receiptOfferId:offerId,intentOfferId:offerId,
    receiptStatus:'verified',receiptEnvironment:'production',
    receiptVerifiedAt:true,verifiedPaidMinor:'9900',expectedPaidMinor:'9900',
    currency:'KRW',expectedCurrency:'KRW',
    grantSourceType:'purchase',grantKey:'receipt:'+receiptId,
    capabilityBound:true,effectiveCurrent:true,
    productKey:'standard.career',field,refundedMinor:'0',
    unsettledCancellationCount:'0',
  };
}
function setup(rows:readonly Record<string,unknown>[]=[], ledger:readonly Record<string,unknown>[]=[original]) {
  const query=vi.fn(async (sql:string,params?:readonly unknown[])=>{
    if(sql===SAJU_CURRENT_GRANT_FIELDS_SQL_V1){
      expect(params).toEqual([subjectId,sajuRecordId,natalVersion]);
      return {rows};
    }
    if(sql===COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1)
      return {rows:[{recordId:sajuRecordId,subjectId,birthRevisionId:natalVersion}]};
    if(sql===COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1)return {rows:ledger};
    return {rows:[]};
  });
  const release=vi.fn();
  const connection={query,release};
  const connect=vi.fn(async()=>connection);
  return {query,release,connect,connection,pool:{connect} as unknown as PostgresSubjectPoolV1};
}
async function quote(x:ReturnType<typeof setup>) {
  return quoteSajuWithStoredCurrentGrantsV1({
    pool:x.pool,subjectId,sajuRecordId,natalVersion,
    targetProductKey:'bundle.career_economy',
  });
}
describe('Saju current field Grant evidence — staged private-only read',()=>{
  it('joins one actual active pinned Receipt Grant and the net ledger in one snapshot',async()=>{
    const x=setup([evidence()]);
    const result=await quote(x);
    expect(result).toMatchObject({
      status:'quoted',recognizedNetPaymentMinor:9900,
      additionalPaymentMinor:15000,
      ownedFields:['career'],checkoutAuthorized:false,
    });
    expect(x.connect).toHaveBeenCalledTimes(1);
    expect(x.query.mock.calls.map(([sql])=>sql)).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'SET LOCAL ROLE myeongha_commerce_internal_executor',
      SAJU_CURRENT_GRANT_FIELDS_SQL_V1,
      COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1,
      COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1,
      'COMMIT',
    ]);
    expect(x.release).toHaveBeenCalledWith(undefined);
  });

  it('does not grant fields by looking at purchases when no current Grant exists',async()=>{
    const x=setup([]);
    const result=await quote(x);
    expect(result.ownedFields).toEqual([]);
    expect(result.checkoutAuthorized).toBe(false);
    expect(result.status).toBe('quoted');
    expect(result.additionalPaymentMinor).toBe(15000);
  });

  it('accepts separate real Grants for different policy fields without counting twice',async()=>{
    const x=setup([
      {...evidence(),productKey:'bundle.career_economy'},
      {...evidence('wealth',id(9008)),productKey:'bundle.career_economy'},
    ],[]);
    const proof=await CURRENT_SAJU_OWNED_FIELDS_DB_READER_V1.readOwnedFields({
      client:x.connection as unknown as PostgresTransactionQueryV1,subjectId,sajuRecordId,natalVersion,
    });
    expect(proof.fields).toEqual(['career','wealth']);
    expect(proof.subjectId).toBe(subjectId);
    expect(Object.isFrozen(proof.fields)).toBe(true);
  });

  it('rejects a cross Subject, Record, Birth revision, or foreign Product field',async()=>{
    const invalid=[
      {...evidence(),subjectId:id(9991)},
      {...evidence(),sajuRecordId:id(9992)},
      {...evidence(),natalVersion:id(9993)},
      {...evidence(),productKey:'standard.business'},
      {...evidence(),field:'custom_unapproved_field'},
      {...evidence(),grantId:'not-a-uuid'},
      {...evidence(),receiptId:'not-a-uuid'},
    ];
    for(const row of invalid){
      const x=setup([row]);
      await expect(quote(x)).rejects.toThrow('SAJU_CURRENT_GRANT_EVIDENCE_');
      expect(x.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    }
  });

  it('holds a still-active Grant after full refund, source revocation or a failed Capability join',async()=>{
    for(const row of [
      {...evidence(),receiptStatus:'revoked',refundedMinor:'9900'},
      {...evidence(),receiptEnvironment:'sandbox'},
      {...evidence(),receiptVerifiedAt:false},
      {...evidence(),receiptOfferId:id(9908)},
      {...evidence(),verifiedPaidMinor:'10000'},
      {...evidence(),grantSourceType:'promo'},
      {...evidence(),grantKey:'receipt:'+id(9909)},
      {...evidence(),capabilityBound:false,field:null},
      {...evidence(),effectiveCurrent:false},
      {...evidence(),field:null},
    ]){
      const x=setup([row]);
      await expect(quote(x)).rejects.toThrow('SAJU_CURRENT_GRANT_EVIDENCE_UNPROVEN');
      expect(x.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    }
  });

  it('blocks duplicated Grant source, duplicate receipt field, partial refunds and unsettled cancellations',async()=>{
    for(const rows of [
      [evidence(),evidence('career',id(9008))],
      [evidence(),evidence()],
      [{...evidence(),refundedMinor:'3000'}],
      [{...evidence(),unsettledCancellationCount:'1'}],
    ]){
      const x=setup(rows);
      await expect(quote(x)).rejects.toThrow('SAJU_CURRENT_GRANT_EVIDENCE_UNPROVEN');
      expect(x.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    }
  });

  it('uses only the pinned immutable Capability, exact source Receipt, and current active effective Grant',()=>{
    const sql=SAJU_CURRENT_GRANT_FIELDS_SQL_V1;
    for(const condition of [
      'origin.saju_record_id=$2::uuid',
      'origin.birth_revision_id=$3::uuid',
      'capability.id=offer.capability_set_id',
      'intent.capability_snapshot_jsonb=pg_catalog.jsonb_build_object',
      "receipt.product_offer_id=offer.id",
      "grant_row.source_receipt_id=receipt.id",
      "grant_row.status='active'",
      'left join public.product_capability_sets capability',
      'left join public.product_capability_items item',
      'left join public.entitlements effective',
      "effective.status='active'",
      'active_grant_count>0',
      'commerce_saju_verified_refund_effects_v1',
      'commerce_provider_events',
    ])expect(sql).toContain(condition);
    expect(sql.startsWith('select')).toBe(true);
    expect(sql).not.toMatch(/\b(insert|update|delete|grant)\s+(into|public|on)\b/iu);
  });
});
