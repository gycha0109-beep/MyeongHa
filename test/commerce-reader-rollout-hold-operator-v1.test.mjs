import {describe,it,expect,vi} from 'vitest';
import {runCommerceReaderRolloutHoldAuditV1 as run} from
  '../scripts/operations/run-commerce-reader-rollout-hold-audit-v1.mjs';
import {COMMERCE_P2_CATALOG_HOLD_SQL_V1 as P2CAT} from
  '../scripts/operations/commerce-p2-catalog-hold-inspection-v1.mjs';
import {COMMERCE_P2_OFFER_TERMS_SQL_V1 as P2OFFERS} from
  '../scripts/operations/commerce-p2-offer-charge-terms-evidence-v1.mjs';
import {COMMERCE_READER_SCHEMA_HOLD_QUERY_V1 as SCHEMA} from
  '../scripts/operations/commerce-reader-production-schema-hold-preflight-v1.mjs';
import {
  COMMERCE_READER_STAGED_HISTORY_QUERY_V1 as HISTORY,
  COMMERCE_READER_PRIVATE_ACL_QUERY_V1 as ACL,
  COMMERCE_READER_PRIVATE_FUNCTION_ACL_QUERY_V1 as FUNCTION_ACL,
  COMMERCE_READER_EXPECTED_STAGED_VERSIONS_V1 as ALL,
} from '../scripts/operations/commerce-reader-production-rollout-evidence-v1.mjs';

const env=Object.freeze({
  MYEONGHA_COMMERCE_P2_AUDIT_DATABASE_URL:
    'postgresql://audit-reader:do-not-log@db.example.org:5432/postgres?sslmode=verify-full',
  MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_HOST:'db.example.org',
  MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_PORT:'5432',
  MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_ROLE:'audit-reader',
  MYEONGHA_COMMERCE_P2_AUDIT_CA_PEM:'local-synthetic-public-ca',
  MYEONGHA_COMMERCE_P2_AUDIT_CA_FINGERPRINT256:'AA:'.repeat(31)+'BB',
});
const counts={
  productRows:'1',inactiveProductRows:'1',specRows:'1',capabilityRows:'1',
  offerRows:'0',activeOfferRows:'0',chargeTermsRows:'0',
  retiredLegacyRows:'1',legacyActiveOfferRows:'0',
};
const order=[
  'protectedAnswerBody','verifiedSajuSource','privateDeliveryAttempt',
  'scopedRefundDispatch','privateWithdrawalClaim',
];
const absent=Object.fromEntries(order.map(k=>[k,false]));
function row(k,present=false){
  return {
    schemaKey:k,tablePresent:present,ordinaryTable:present,
    rlsEnabled:present,rlsForced:present,
    anonDml:present?false:null,memberDml:present?false:null,
  };
}
function fake({p2=counts,versions=[],present={},force=false,failSql,
  unsafeAcl=false,offerRows=[],schemaOverride}={}){
  const queries=[];
  const client={
    connect:vi.fn(async()=>{}),
    end:vi.fn(async()=>{}),
    query:vi.fn(async text=>{
      queries.push(text);
      if(text===failSql)throw Error('PRIVATE_SECRET_DB_EXCEPTION');
      if(text.includes('pg_catalog.pg_roles'))return {
        rows:[{readOnly:true,completeVisibility:true}],
      };
      if(text.includes('transaction_read_only'))return {rows:[{readOnly:true}]};
      if(text===P2CAT)return {rows:[p2]};
      if(text===P2OFFERS)return {rows:offerRows};
      if(text===SCHEMA)return {rows:[schemaOverride??{...absent,...present}]};
      if(text===HISTORY)return {rows:versions.map(version=>({version}))};
      if(text===FUNCTION_ACL)return {rows:[
        'preparePaidDelivery','ackPaidDelivery','reserveRefundDispatch',
        'recordRefundResponse','confirmRefundDispatch',
      ].map((k,i)=>{
        const present=versions.includes(i<2?'2140':'2310');
        return {functionKey:k,functionPresent:present,
          anonExecute:present?false:null,memberExecute:present?false:null};
      })};
      if(text===ACL)return {rows:order.map(k=>{
        const v=row(k,!!present[k]);
        // Refund and withdrawal migrations do not FORCE row security.
        if(k==='scopedRefundDispatch'||k==='privateWithdrawalClaim'){
          v.rlsForced=false;
        }
        if(unsafeAcl&&k==='protectedAnswerBody'){
          v.anonDml=true;
        }
        return v;
      })};
      return {rows:[]};
    }),
  };
  return {client,queries};
}
async function execute(f,extra={}){
  return run(env,{
    validateCa:()=>true,clientFactory:async()=>f.client,...extra,
  });
}
describe('Owner-only combined P2/P3/P4 staged rollout audit',()=>{
  it('checks all source SQL and three independent DB read-only snapshots, then remains HOLD',async()=>{
    const f=fake();
    const r=await execute(f);
    expect(r).toMatchObject({
      exitCode:0,output:{
        state:'CURRENT_STAGED_HOLD_OBSERVED',
        catalog:{status:'hold_observed'},
        readerSchema:{state:'schema_incomplete'},
        stagedReader:{
          state:'staged_unmounted_hold',
          localReviewedSqlCount:59,deployedMigrationCount:0,
          missingMigrationCount:59,
        },
        saleAuthorized:false,readerDeliveryAuthorized:false,
        refundAuthorized:false,migrationAuthorized:false,
        liveAuthorized:false,writesPerformed:false,
      },
    });
    expect(r.output.readerSchema.missing).toHaveLength(5);
    expect(f.queries.filter(q=>q==='begin isolation level repeatable read read only'))
      .toHaveLength(3);
    expect(f.queries.filter(q=>q==='rollback')).toHaveLength(3);
    expect(f.client.end).toHaveBeenCalledOnce();
    expect(JSON.stringify(r)).not.toContain('do-not-log');
  });
  it('does not promote 59 fully installed private tables to production authority',async()=>{
    const present=Object.fromEntries(order.map(k=>[k,true]));
    const f=fake({versions:[...ALL],present});
    const r=await execute(f);
    expect(r.output).toMatchObject({
      state:'RELEASE_PRECONDITIONS_UNVERIFIED',
      readerSchema:{state:'schema_present_unverified'},
      stagedReader:{
        state:'schema_present_unverified',deployedMigrationCount:59,
        missingMigrationCount:0,missingTables:[],
      },
      saleAuthorized:false,readerDeliveryAuthorized:false,
      refundAuthorized:false,migrationAuthorized:false,liveAuthorized:false,
    });
    expect(r.exitCode).toBe(2);
    expect(f.client.end).toHaveBeenCalledOnce();
  });
  it('separates P2 unexpected sale Offer from P3/P4 staging status',async()=>{
    const uuid='11111111-1111-4111-8111-111111111111';
    const f=fake({p2:{...counts,offerRows:'1'},offerRows:[{
      offerId:uuid,platform:'web',offerEnabled:false,
      offerCurrent:true,termsId:null,termsVersion:null,
      amountMinor:null,currency:null,termsCurrent:null,
    }]});
    const r=await execute(f);
    expect(r).toMatchObject({
      exitCode:2,output:{
        state:'RELEASE_PRECONDITIONS_UNVERIFIED',
        catalog:{status:'investigation_required'},
        liveAuthorized:false,
      },
    });
    expect(JSON.stringify(r)).not.toContain(uuid);
  });
  it('fails closed if the basic presence and ACL/history DB snapshots disagree',async()=>{
    const f=fake({schemaOverride:{...absent,protectedAnswerBody:true}});
    const r=await execute(f);
    expect(r.output).toMatchObject({
      state:'HOLD_UNVERIFIED',code:'READER_ROLLOUT_SCHEMA_SNAPSHOTS_CHANGED',
    });
    expect(r.exitCode).toBe(2);
    expect(f.client.end).toHaveBeenCalledOnce();
  });
  it('flags private ACL leak as unverified even if other staging is absent',async()=>{
    const f=fake({
      versions:['1950'],present:{protectedAnswerBody:true},unsafeAcl:true,
    });
    const r=await execute(f);
    expect(r.output).toMatchObject({
      state:'RELEASE_PRECONDITIONS_UNVERIFIED',
      stagedReader:{unsafeAclTables:['protectedAnswerBody']},
      liveAuthorized:false,refundAuthorized:false,
    });
  });
  it('refuses a missing independent trusted TLS config before reading 59 files or DB',async()=>{
    const factory=vi.fn(),readFile=vi.fn();
    const r=await run({}, {clientFactory:factory,readFile});
    expect(r).toMatchObject({
      exitCode:2,output:{
        state:'HOLD_UNVERIFIED',code:'READER_ROLLOUT_AUDIT_CONFIGURATION_NOT_TRUSTED',
      },
    });
    expect(factory).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });
  it('refuses an untrusted staged manifest before opening a DB connection',async()=>{
    const factory=vi.fn();
    const r=await run(env,{
      validateCa:()=>true,
      clientFactory:factory,
      readFile:async()=>{throw Error('PRIVATE path and credentials');},
    });
    expect(r.output).toMatchObject({
      state:'HOLD_UNVERIFIED',code:'READER_ROLLOUT_STAGED_SOURCE_UNVERIFIED',
    });
    expect(factory).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain('PRIVATE');
  });
  it.each([P2CAT,SCHEMA,HISTORY,ACL,FUNCTION_ACL])(
    'redacts sensitive SQL failures and closes DB',async sql=>{
      const f=fake({failSql:sql});
      const r=await execute(f);
      expect(r).toMatchObject({
        exitCode:2,output:{
          state:'HOLD_UNVERIFIED',code:'READER_ROLLOUT_AUDIT_EXECUTION_UNVERIFIED',
          liveAuthorized:false,refundAuthorized:false,writesPerformed:false,
        },
      });
      expect(f.client.end).toHaveBeenCalledOnce();
      expect(JSON.stringify(r)).not.toContain('PRIVATE_SECRET');
      expect(JSON.stringify(r)).not.toContain('do-not-log');
    });
  it('closes client after connection fails without any SQL',async()=>{
    const f=fake();
    f.client.connect.mockRejectedValue(Error('DB_SECRET_MUST_NOT_LEAK'));
    const r=await execute(f);
    expect(r.output.code).toBe('READER_ROLLOUT_AUDIT_EXECUTION_UNVERIFIED');
    expect(f.queries).toEqual([]);
    expect(f.client.end).toHaveBeenCalledOnce();
    expect(JSON.stringify(r)).not.toContain('DB_SECRET');
  });
});
