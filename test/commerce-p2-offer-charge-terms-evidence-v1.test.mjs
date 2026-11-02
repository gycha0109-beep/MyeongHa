import {describe,it,expect,vi} from 'vitest';
import {
  COMMERCE_P2_OFFER_TERMS_SQL_V1 as SQL,
  inspectCommerceP2OfferChargeTermsEvidenceV1 as inspect,
} from '../scripts/operations/commerce-p2-offer-charge-terms-evidence-v1.mjs';

const offerId='11111111-1111-4111-8111-111111111111';
const termsId='22222222-2222-4222-8222-222222222222';
const row={
  offerId,platform:'web',provider:'portone_v2',
  offerEnabled:false,offerCurrent:true,
  termsId:null,termsVersion:null,amountMinor:null,
  currency:null,termsCurrent:null,
};
function fixture({rows=[],authority={readOnly:true,completeVisibility:true},failure}={}){
  const calls=[];
  const client={query:vi.fn(async sql=>{
    calls.push(sql);
    if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
    if(sql===SQL){
      if(failure)throw failure;
      return {rows};
    }
    return {rows:[]};
  })};
  return {client,calls};
}
describe('P2 Reader Product Offer and versioned charge terms operational inspection',()=>{
  it('reports expected inactive Product and retains explicit no-sale guard',async()=>{
    const f=fixture();
    const r=await inspect(f.client);
    expect(r).toMatchObject({
      status:'expected_inactive_catalog',productKey:'standard.love_relationship',
      decisionAuthority:'P0-CM-03',decidedListPriceMinor:8900,currency:'KRW',
      saleActivationAuthorized:false,executableChargeAuthorized:false,
      productionFulfillmentAuthorized:false,writesPerformed:false,offers:[],
    });
    expect(r.blockers).toContain('P0_CM_03_INDIVIDUAL_SALE_ACTIVATION_NOT_APPROVED');
    expect(f.calls[0]).toContain('repeatable read read only');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('shows dormant unexpected Offer without approving a checkout',async()=>{
    const r=await inspect(fixture({rows:[row]}).client);
    expect(r.status).toBe('investigation_required');
    expect(r.offers).toEqual([{
      offerId,platform:'web',enabled:false,current:true,
      termCount:0,currentTermCount:0,currentTermPriceMatchesList:false,
    }]);
    expect(r.blockers).toContain('UNEXPECTED_P2_OFFER_OR_CHARGE_TERMS');
    expect(r.saleActivationAuthorized).toBe(false);
  });
  it('does not mistake matching 8,900 KRW current Terms for sale approval',async()=>{
    const r=await inspect(fixture({rows:[{
      ...row,offerEnabled:true,termsId,termsVersion:'v1',
      amountMinor:'8900',currency:'KRW',termsCurrent:true,
    }]}).client);
    expect(r.offers[0]).toMatchObject({
      enabled:true,termCount:1,currentTermCount:1,currentTermPriceMatchesList:true,
    });
    expect(r.blockers).toContain('OFFER_ENABLED_WITHOUT_SALE_AUTHORITY');
    expect(r.blockers).toContain('EXECUTABLE_CHARGE_TERMS_WITHOUT_APPROVAL');
    expect(r.saleActivationAuthorized).toBe(false);
  });
  it.each([{amountMinor:'9900',currency:'KRW'},{amountMinor:'8900',currency:'USD'}])(
    'flags unexpected executable price %j as list-price difference without authorizing it',async x=>{
      const r=await inspect(fixture({rows:[{
        ...row,...x,termsId,termsVersion:'v1',termsCurrent:true,
      }]}).client);
      expect(r.blockers).toContain(
        'CURRENT_CHARGE_TERMS_DIFFER_FROM_DECIDED_LIST_PRICE');
      expect(r.executableChargeAuthorized).toBe(false);
    });
  it('rejects >25 rows instead of truncating a large offer catalog silently',async()=>{
    const f=fixture({rows:Array.from({length:26},()=>row)});
    await expect(inspect(f.client)).rejects.toThrow(
      'P2_OFFER_TERMS_BOUNDED_INSPECTION_REQUIRED');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('rejects incomplete full visibility before inspecting confidential Offer rows',async()=>{
    const f=fixture({authority:{readOnly:true,completeVisibility:false}});
    await expect(inspect(f.client)).rejects.toThrow(
      'P2_OFFER_TERMS_FULL_VISIBILITY_REQUIRED');
    expect(f.calls).not.toContain(SQL);
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it.each([
    {...row,termsId,termsVersion:'v1',amountMinor:'0',currency:'KRW',termsCurrent:true},
    {...row,termsId,termsVersion:'v1',amountMinor:'9007199254740993',currency:'KRW',termsCurrent:true},
    {...row,termsId:null,termsVersion:'forged',amountMinor:null,currency:null,termsCurrent:null},
    {...row,offerEnabled:'true'},
  ])('fails closed for inconsistent or untrusted DB row shape',async bad=>{
    const f=fixture({rows:[bad]});
    await expect(inspect(f.client)).rejects.toThrow(
      'P2_OFFER_TERMS_EVIDENCE_UNTRUSTED');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('rolls back on SQL failure and never invents a healthy sale readiness',async()=>{
    const f=fixture({failure:Error('private failure')});
    await expect(inspect(f.client)).rejects.toThrow('private failure');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('issues no DML, writes, provider requests or customer HTTP',async()=>{
    const f=fixture();
    await inspect(f.client);
    expect(f.calls).toEqual([
      'begin isolation level repeatable read read only',
      "set local statement_timeout='10000ms'",
      expect.stringContaining('pg_catalog.pg_roles'),
      SQL,
      'rollback',
    ]);
    expect(SQL).toContain('case when ct.id is null then null else ct.retired_at is null end');
    expect(SQL).not.toMatch(/external_product_id|\bupdate\b|\binsert\b|\bdelete\b/iu);
  });
});
