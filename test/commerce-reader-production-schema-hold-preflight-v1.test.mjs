import {describe,it,expect,vi} from 'vitest';
import {
  COMMERCE_READER_SCHEMA_HOLD_QUERY_V1 as QUERY,
  inspectCommerceReaderProductionSchemaHoldV1 as inspect,
} from '../scripts/operations/commerce-reader-production-schema-hold-preflight-v1.mjs';

const row={
  protectedAnswerBody:true,privateDeliveryAttempt:true,
  scopedRefundDispatch:true,privateWithdrawalClaim:true,
  verifiedSajuSource:true,
};

function db({values=row,mode=true,queryError}={}){
  const calls=[];
  const client={query:vi.fn(async sql=>{
    calls.push(sql);
    if(sql.includes('transaction_read_only'))return {rows:[{readOnly:mode}]};
    if(sql===QUERY){
      if(queryError)throw Error('private DB connection details / password');
      return {rows:[values]};
    }
    return {rows:[]};
  })};
  return {client,calls};
}

describe('private Reader P3 P4 schema deployment hold preflight',()=>{
  it('matches five Reader private migration tables without reading customer data',()=>{
    expect(QUERY).toContain('to_regclass');
    for(const table of [
      'official_reader_paid_answer_bodies',
      'official_reader_paid_delivery_attempts_v1',
      'commerce_reader_full_refund_dispatches_v1',
      'digital_reading_withdrawal_claims_private_v1',
      'official_reader_s3_source_authority_receipts_v1',
    ])expect(QUERY).toContain(table);
    expect(QUERY).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|copy)\b/iu);
    expect(QUERY).not.toMatch(/\bfrom\s+public\./iu);
  });
  it('reports all five missing tables and maintains sale/delivery/refund hold',async()=>{
    const f=db({values:Object.fromEntries(Object.keys(row).map(k=>[k,false]))});
    const r=await inspect(f.client);
    expect(r).toMatchObject({
      state:'schema_incomplete',requiredTableCount:5,present:[],
      p2SaleAuthorized:false,p3ProductionDeliveryAuthorized:false,
      p4ProductionRefundAuthorized:false,p5LiveLaunchAuthorized:false,
      operationsDatabaseModified:false,
    });
    expect(r.missing).toHaveLength(5);
    expect(f.calls).toEqual([
      'begin isolation level repeatable read read only',
      "set local statement_timeout='10000ms'",
      expect.stringContaining('transaction_read_only'),
      QUERY,'rollback',
    ]);
  });
  it('does not mistake presence of all five tables for release authorization',async()=>{
    const r=await inspect(db().client);
    expect(r).toMatchObject({
      state:'schema_present_unverified',missing:[],requiredTableCount:5,
      p3ProductionDeliveryAuthorized:false,p4ProductionRefundAuthorized:false,
      p5LiveLaunchAuthorized:false,
    });
    expect(r.checksPerformed).toContain('no_rls_or_function_grant_proof');
  });
  it('does not infer all-or-nothing from a partially deployed set',async()=>{
    const r=await inspect(db({values:{...row,scopedRefundDispatch:false}}).client);
    expect(r).toMatchObject({
      state:'schema_incomplete',missing:['scopedRefundDispatch'],
      p4ProductionRefundAuthorized:false,
    });
  });
  it.each([
    { ...row,verifiedSajuSource:null },
    { ...row,protectedAnswerBody:'true' },
    { ...row,extraSecret:'do not copy' },
    {...row,privateDeliveryAttempt:0},
  ])('rejects invalid/extra result fields without leaking data',async values=>{
    const f=db({values});
    await expect(inspect(f.client)).rejects.toThrow('COMMERCE_READER_SCHEMA_PRESENCE_UNTRUSTED');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('fails before schema query if read-only transaction mode is missing',async()=>{
    const f=db({mode:false});
    await expect(inspect(f.client)).rejects.toThrow('COMMERCE_READER_SCHEMA_READ_ONLY_REQUIRED');
    expect(f.calls).not.toContain(QUERY);
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('rolls back when the schema check fails',async()=>{
    const f=db({queryError:true});
    await expect(inspect(f.client)).rejects.toThrow();
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('requires an explicit client rather than discovering DB credentials',async()=>{
    await expect(inspect(null)).rejects.toThrow('COMMERCE_READER_SCHEMA_PRIVATE_CLIENT_REQUIRED');
  });
});
