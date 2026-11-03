import {describe,it,expect,vi} from 'vitest';
import {inspectCommerceP2SingleSnapshotHoldV1 as inspect} from
  '../scripts/operations/commerce-p2-single-snapshot-readiness-hold-v1.mjs';
import {COMMERCE_P2_CATALOG_HOLD_SQL_V1 as CATALOG} from
  '../scripts/operations/commerce-p2-catalog-hold-inspection-v1.mjs';
import {COMMERCE_P2_OFFER_TERMS_SQL_V1 as TERMS} from
  '../scripts/operations/commerce-p2-offer-charge-terms-evidence-v1.mjs';

const expected={
  productRows:'1',inactiveProductRows:'1',specRows:'1',capabilityRows:'1',
  offerRows:'0',activeOfferRows:'0',chargeTermsRows:'0',
  retiredLegacyRows:'1',legacyActiveOfferRows:'0',
};
const offerId='11111111-1111-4111-8111-111111111111';
const termsId='22222222-2222-4222-8222-222222222222';
const offer={
  offerId,platform:'web',offerEnabled:false,offerCurrent:true,
  termsId:null,termsVersion:null,amountMinor:null,currency:null,
  termsCurrent:null,
};
function stub({counts=expected,rows=[],authority={readOnly:true,completeVisibility:true},
  fail}={}){
  const calls=[];
  const client={query:vi.fn(async sql=>{
    calls.push(sql);
    if(fail===sql)throw Error('database read refused');
    if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
    if(sql===CATALOG)return {rows:[counts]};
    if(sql===TERMS)return {rows};
    return {rows:[]};
  })};
  return {client,calls};
}

describe('Commerce P2 single-snapshot hold and authority gate',()=>{
  it('joins both existing audits in exactly one read-only Repeatable Read transaction',async()=>{
    const f=stub();
    const result=await inspect(f.client);
    expect(result).toMatchObject({
      schemaVersion:'commerce-p2-single-snapshot-readiness-hold-v1',
      status:'hold_observed',decisionAuthority:'P0-CM-03',
      productKey:'standard.love_relationship',
      saleActivationAuthorized:false,checkoutAuthorized:false,
      productionReaderFulfillmentAuthorized:false,writesPerformed:false,
      listPrice:{currency:'KRW',amountMinor:8900,executableChargeAuthority:false},
    });
    expect(result.driftKeys).toEqual([]);
    expect(result.blockers).toContain('SAJU_PRODUCTION_READING_AUTHORITY_NOT_CONFIRMED');
    expect(f.calls).toEqual([
      'begin isolation level repeatable read read only',
      "set local statement_timeout='10000ms'",
      expect.stringContaining('pg_catalog.pg_roles'),
      CATALOG,TERMS,'rollback',
    ]);
  });
  it('flags a consistent unexpected Offer while preserving the sale HOLD',async()=>{
    const r=await inspect(stub({counts:{...expected,offerRows:'1'},rows:[offer]}).client);
    expect(r.status).toBe('investigation_required');
    expect(r.counts.offerRows).toBe(1);
    expect(r.driftKeys).toEqual(['offerRows']);
    expect(r.saleActivationAuthorized).toBe(false);
    expect(JSON.stringify(r)).not.toContain(offerId);
  });
  it('flags a consistent active Offer with exact 8,900 KRW terms without authorization',async()=>{
    const row={...offer,offerEnabled:true,
      termsId,termsVersion:'v1',amountMinor:'8900',currency:'KRW',
      termsCurrent:true};
    const r=await inspect(stub({
      counts:{...expected,offerRows:'1',activeOfferRows:'1',chargeTermsRows:'1'},
      rows:[row],
    }).client);
    expect(r.status).toBe('investigation_required');
    expect(r.counts).toMatchObject({offerRows:1,activeOfferRows:1,chargeTermsRows:1});
    expect(r.checkoutAuthorized).toBe(false);
  });
  it.each([
    {counts:{...expected,offerRows:'1'},rows:[]},
    {counts:expected,rows:[offer]},
    {counts:{...expected,offerRows:'1',chargeTermsRows:'1'},rows:[offer]},
  ])('fails closed if catalog totals and offer details disagree',async x=>{
    const f=stub(x);
    await expect(inspect(f.client)).rejects.toThrow('P2_SNAPSHOT_INCONSISTENT_OFFER_COUNTS');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('rejects private DB role without full visibility before any catalog query',async()=>{
    const f=stub({authority:{readOnly:true,completeVisibility:false}});
    await expect(inspect(f.client)).rejects.toThrow('P2_SNAPSHOT_FULL_DB_AUTHORITY_REQUIRED');
    expect(f.calls).not.toContain(CATALOG);
    expect(f.calls).not.toContain(TERMS);
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it.each(['9007199254740993','-1','01',null])(
    'rejects invalid count %s rather than treating it as reliable',async v=>{
    const f=stub({counts:{...expected,productRows:v}});
    await expect(inspect(f.client)).rejects.toThrow('P2_SNAPSHOT_UNTRUSTED_CATALOG');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('rejects more than 25 detailed rows without silently truncating a drift',async()=>{
    const f=stub({rows:Array(26).fill(offer)});
    await expect(inspect(f.client)).rejects.toThrow('P2_SNAPSHOT_OFFER_BOUND_EXCEEDED');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('rejects duplicate charge-term identities and contradictory Offer states',async()=>{
    const full={...offer,termsId,termsVersion:'v1',amountMinor:'8900',
      currency:'KRW',termsCurrent:true};
    const duplicate=stub({rows:[full,full]});
    await expect(inspect(duplicate.client)).rejects.toThrow('P2_SNAPSHOT_DUPLICATE_TERMS');
    expect(duplicate.calls.at(-1)).toBe('rollback');
    const contradictory=stub({rows:[offer,{...offer,offerEnabled:true}]});
    await expect(inspect(contradictory.client)).rejects.toThrow('P2_SNAPSHOT_OFFER_CONFLICT');
    expect(contradictory.calls.at(-1)).toBe('rollback');
  });
  it('rejects missing LEFT JOIN NULL terms, malformed UUIDs and price',async()=>{
    for(const rows of [
      [{...offer,termsCurrent:true}],
      [{...offer,offerId:'not-uuid'}],
      [{...offer,termsId,termsVersion:'v1',amountMinor:'0',currency:'KRW',termsCurrent:true}],
    ]){
      const f=stub({rows});
      await expect(inspect(f.client)).rejects.toThrow('P2_SNAPSHOT_UNTRUSTED_OFFER');
      expect(f.calls.at(-1)).toBe('rollback');
    }
  });
  it('rolls back on either SQL failure; no partial evidence returned',async()=>{
    for(const query of [CATALOG,TERMS]){
      const f=stub({fail:query});
      await expect(inspect(f.client)).rejects.toThrow('database read refused');
      expect(f.calls.at(-1)).toBe('rollback');
    }
  });
});
