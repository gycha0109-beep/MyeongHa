// Watchtower-Track: commerce-payment
import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_P2_CATALOG_HOLD_SQL_V1,inspectCommerceP2CatalogHoldV1,
} from '../scripts/operations/commerce-p2-catalog-hold-inspection-v1.mjs';

const held=Object.freeze({
 productRows:'1',inactiveProductRows:'1',specRows:'1',capabilityRows:'1',
 offerRows:'0',activeOfferRows:'0',chargeTermsRows:'0',
 retiredLegacyRows:'1',legacyActiveOfferRows:'0',
});
function db({row=held,authority={readOnly:true,completeVisibility:true},error}={}){
 return {query:vi.fn(async sql=>{
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===COMMERCE_P2_CATALOG_HOLD_SQL_V1){
   if(error)throw error;
   return {rows:[row]};
  }
  return {rows:[]};
 })};
}
describe('Commerce P2 inactive Product / Reader catalog inspection',()=>{
 it('observes decided Product authority without authorizing an Offer, Charge Terms or fulfillment',async()=>{
  const c=db({row:{...held,untrustedSecret:'must-not-leak'}});
  const r=await inspectCommerceP2CatalogHoldV1(c);
  expect(r).toMatchObject({
   decisionAuthority:'P0-CM-03',status:'observed_hold',
   saleActivationAuthorized:false,chargeTermsAuthorized:false,
   productionFulfillmentAuthorized:false,writesPerformed:false,
  });
  expect(r.counts).toEqual(held);
  expect(JSON.stringify(r)).not.toContain('must-not-leak');
  expect(c.query.mock.calls[0][0]).toContain('repeatable read read only');
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it.each([
  {offerRows:'1'},{activeOfferRows:'1'},{chargeTermsRows:'1'},
  {inactiveProductRows:'0'},{specRows:'0'},{capabilityRows:'0'},
  {retiredLegacyRows:'0'},{legacyActiveOfferRows:'1'},
 ])('flags a P2 catalog drift without activating a sale: %j',async deviation=>{
  const report=await inspectCommerceP2CatalogHoldV1(db({row:{...held,...deviation}}));
  expect(report.status).toBe('findings');
  expect(report.saleActivationAuthorized).toBe(false);
  expect(report.writesPerformed).toBe(false);
 });
 it('rejects incomplete DB visibility before reading catalog facts',async()=>{
  const c=db({authority:{readOnly:true,completeVisibility:false}});
  await expect(inspectCommerceP2CatalogHoldV1(c))
   .rejects.toThrow('P2_CATALOG_AUDIT_AUTHORITY_REQUIRED');
  expect(c.query.mock.calls.some(([sql])=>sql===COMMERCE_P2_CATALOG_HOLD_SQL_V1)).toBe(false);
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('rolls back and never fabricates a HOLD result after invalid rows or SQL failures',async()=>{
  const invalid=db({row:{...held,offerRows:null}});
  await expect(inspectCommerceP2CatalogHoldV1(invalid))
   .rejects.toThrow('INVALID_P2_CATALOG_AUDIT_RESULT');
  expect(invalid.query.mock.calls.at(-1)[0]).toBe('rollback');
  const failed=db({error:Error('private database error')});
  await expect(inspectCommerceP2CatalogHoldV1(failed)).rejects.toThrow();
  expect(failed.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
});
