import {describe,it,expect,vi} from 'vitest';
import {
  buildCommerceP2AuditDbTargetV1 as target,
  runCommerceP2ReadOnlyAuditOperatorV1 as run,
} from '../scripts/operations/run-commerce-p2-readonly-audit-v1.mjs';
import {COMMERCE_P2_CATALOG_HOLD_SQL_V1 as CATALOG} from
  '../scripts/operations/commerce-p2-catalog-hold-inspection-v1.mjs';
import {COMMERCE_P2_OFFER_TERMS_SQL_V1 as TERMS} from
  '../scripts/operations/commerce-p2-offer-charge-terms-evidence-v1.mjs';
const hostname='db.example.org';
const env=Object.freeze({
  MYEONGHA_COMMERCE_P2_AUDIT_DATABASE_URL:
    'postgresql://audit-reader:super-private@db.example.org:5432/postgres?sslmode=verify-full',
  MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_HOST:hostname,
  MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_PORT:'5432',
  MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_ROLE:'audit-reader',
  MYEONGHA_COMMERCE_P2_AUDIT_CA_PEM:'test-public-root-ca',
  MYEONGHA_COMMERCE_P2_AUDIT_CA_FINGERPRINT256:'AA:'.repeat(31)+'BB',
});
const trusted=()=>true;
const counts={
  productRows:'1',inactiveProductRows:'1',specRows:'1',capabilityRows:'1',
  offerRows:'0',activeOfferRows:'0',chargeTermsRows:'0',
  retiredLegacyRows:'1',legacyActiveOfferRows:'0',
};
const offer={
  offerId:'11111111-1111-4111-8111-111111111111',platform:'web',
  offerEnabled:false,offerCurrent:true,
  termsId:null,termsVersion:null,amountMinor:null,currency:null,termsCurrent:null,
};
function fake({catalog=counts,terms=[],failQuery,authority={
  readOnly:true,completeVisibility:true,
}}={}){
  const calls=[];
  const client={
    connect:vi.fn(async()=>{}),
    end:vi.fn(async()=>{}),
    query:vi.fn(async sql=>{
      calls.push(sql);
      if(sql===failQuery)throw Error('private database error, password=leak');
      if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
      if(sql===CATALOG)return {rows:[catalog]};
      if(sql===TERMS)return {rows:terms};
      return {rows:[]};
    }),
  };
  return {client,calls};
}
describe('owner initiated P2 READ ONLY single-snapshot operator',()=>{
  it('refuses to connect without explicit trusted host/role/CA and verify-full',async()=>{
    for(const [k,v] of [
      ['MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_HOST','other.example.org'],
      ['MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_ROLE','operator'],
      ['MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_PORT','6543'],
      ['MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_PORT','-1'],
      ['MYEONGHA_COMMERCE_P2_AUDIT_DATABASE_URL',
        'postgresql://audit-reader:password@db.example.org:5432/postgres?sslmode=require'],
      ['MYEONGHA_COMMERCE_P2_AUDIT_DATABASE_URL',
        'postgresql://audit-reader:password@db.example.org:5432/postgres?sslmode=verify-full&options=-c%20default_transaction_read_only=off'],
      ['MYEONGHA_COMMERCE_P2_AUDIT_DATABASE_URL',
        'postgresql://audit-reader:password@localhost/postgres?sslmode=verify-full'],
      ['MYEONGHA_COMMERCE_P2_AUDIT_DATABASE_URL',
        'postgresql://audit-reader:password@db.example.org/postgres?sslmode=disable'],
    ]){
      const val=target({...env,[k]:v},{validateCa:trusted});
      expect(val).toBeNull();
    }
    expect(target(env)).toBeNull(); // synthetic root CA is never trusted by production
    const factory=vi.fn();
    const r=await run({}, {clientFactory:factory});
    expect(r).toMatchObject({exitCode:2,output:{status:'HOLD'}});
    expect(factory).not.toHaveBeenCalled();
  });
  it('connects only with pinned TLS peer and server-enforced default read only',()=>{
    const x=target(env,{validateCa:trusted});
    expect(x).toMatchObject({
      options:'-c default_transaction_read_only=on',
      ssl:{servername:hostname,rejectUnauthorized:true},
      statement_timeout:10000,connectionTimeoutMillis:8000,
    });
    expect(x.connectionString).not.toContain('sslmode=');
    expect(x.ssl.ca).toBe('test-public-root-ca');
    expect(target({...env,MYEONGHA_COMMERCE_P2_AUDIT_CA_PEM:'test-public-root-ca\\n'},
      {validateCa:trusted})).not.toBeNull();
    expect(JSON.stringify(x)).not.toContain('default_transaction_read_only=off');
  });
  it('reports expected HOLD after one bounded read-only snapshot and closes DB',async()=>{
    const f=fake();
    let options;
    const r=await run(env,{
      validateCa:trusted,
      clientFactory:async o=>{options=o;return f.client;},
    });
    expect(options.ssl.servername).toBe(hostname);
    expect(r).toMatchObject({
      exitCode:0,output:{
        status:'HOLD_OBSERVED',productKey:'standard.love_relationship',
        saleActivationAuthorized:false,checkoutAuthorized:false,
        productionReaderFulfillmentAuthorized:false,writesPerformed:false,
      },
    });
    expect(f.calls).toEqual([
      'begin isolation level repeatable read read only',
      "set local statement_timeout='10000ms'",
      expect.stringContaining('pg_catalog.pg_roles'),CATALOG,TERMS,'rollback',
    ]);
    expect(f.client.connect).toHaveBeenCalledOnce();
    expect(f.client.end).toHaveBeenCalledOnce();
    expect(JSON.stringify(r)).not.toContain('super-private');
  });
  it('reports investigation-needed without a purchase authorization even on valid modified catalog',async()=>{
    const f=fake({catalog:{...counts,offerRows:'1'},terms:[offer]});
    const r=await run(env,{validateCa:trusted,clientFactory:async()=>f.client});
    expect(r).toMatchObject({
      exitCode:2,output:{
        status:'INVESTIGATION_REQUIRED',saleActivationAuthorized:false,
        checkoutAuthorized:false,productionReaderFulfillmentAuthorized:false,
      },
    });
    expect(r.output.driftKeys).toContain('offerRows');
    expect(f.client.end).toHaveBeenCalledOnce();
    expect(JSON.stringify(r)).not.toContain(offer.offerId);
  });
  it('sanitizes failed private SQL queries and always closes the connection',async()=>{
    const f=fake({failQuery:TERMS});
    const r=await run(env,{validateCa:trusted,clientFactory:async()=>f.client});
    expect(r).toMatchObject({
      exitCode:2,output:{status:'HOLD',code:'P2_AUDIT_EXECUTION_UNVERIFIED'},
    });
    expect(JSON.stringify(r)).not.toContain('password=leak');
    expect(JSON.stringify(r)).not.toContain('super-private');
    expect(f.calls.at(-1)).toBe('rollback');
    expect(f.client.end).toHaveBeenCalledOnce();
  });
  it('rejects incorrect privileged catalog role without exposing product details',async()=>{
    const f=fake({authority:{readOnly:true,completeVisibility:false}});
    const r=await run(env,{validateCa:trusted,clientFactory:async()=>f.client});
    expect(r.output.code).toBe('P2_AUDIT_EXECUTION_UNVERIFIED');
    expect(f.calls).not.toContain(CATALOG);
    expect(f.client.end).toHaveBeenCalledOnce();
  });
  it('closes connection even on connect error; no SQL or provider call',async()=>{
    const f=fake();
    f.client.connect.mockRejectedValue(Error('private DSN, secret credential'));
    const r=await run(env,{validateCa:trusted,clientFactory:async()=>f.client});
    expect(r.output).toMatchObject({code:'P2_AUDIT_EXECUTION_UNVERIFIED'});
    expect(f.calls).toEqual([]);
    expect(f.client.end).toHaveBeenCalledOnce();
    expect(JSON.stringify(r)).not.toContain('secret credential');
  });
});
