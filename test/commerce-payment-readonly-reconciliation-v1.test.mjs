// Watchtower-Track: commerce-payment
import {describe,it,expect,vi} from 'vitest';
import {reconcileCommercePaymentReadOnlyV1,COMMERCE_RECONCILIATION_SQL_V1}
 from '../scripts/operations/commerce-payment-readonly-reconciliation-v1.mjs';

const zero={sandboxReceipts:'0',productionReceipts:'0',verifiedReceiptBindingMismatches:'0',
 duplicateReceiptTransactions:'0',invalidActiveReceiptGrants:'0',invalidPaidCreditLots:'0',
 sandboxPaidCreditLots:'0',productionReceiptsWithoutRights:'0'};
function db({row=zero,authority={readOnly:true,completeVisibility:true},error}={}){
 return {query:vi.fn(async sql=>{
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===COMMERCE_RECONCILIATION_SQL_V1){if(error)throw error;return {rows:[row]};}
  return {rows:[]};
 })};
}
describe('Commerce read-only reconciliation operations boundary',()=>{
 it('rejects incomplete RLS visibility before reading financial evidence',async()=>{
  const c=db({authority:{readOnly:true,completeVisibility:false}});
  await expect(reconcileCommercePaymentReadOnlyV1(c)).rejects.toThrow('AUTHORITY_REQUIRED');
  expect(c.query.mock.calls.some(([sql])=>sql===COMMERCE_RECONCILIATION_SQL_V1)).toBe(false);
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('reports HOLD-compatible missing rights without granting or claiming provider parity',async()=>{
  const c=db({row:{...zero,productionReceipts:'2',productionReceiptsWithoutRights:'2',private:'hidden'}});
  const r=await reconcileCommercePaymentReadOnlyV1(c);
  expect(r.status).toBe('observed');expect(r.providerReconciled).toBe(false);
  expect(r.writesPerformed).toBe(false);expect(r.counts).not.toHaveProperty('private');
  expect(c.query.mock.calls[0][0]).toContain('repeatable read read only');
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it.each(['verifiedReceiptBindingMismatches','duplicateReceiptTransactions','invalidActiveReceiptGrants',
  'invalidPaidCreditLots','sandboxPaidCreditLots'])('flags %s without mutation',async key=>{
  expect((await reconcileCommercePaymentReadOnlyV1(db({row:{...zero,[key]:'1'}}))).status).toBe('findings');
 });
 it('does not report success after a DB failure and always rolls back',async()=>{
  const c=db({error:Error('private DB failure')});
  await expect(reconcileCommercePaymentReadOnlyV1(c)).rejects.toThrow();
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('rejects malformed counts instead of silently converting them to zero',async()=>{
  await expect(reconcileCommercePaymentReadOnlyV1(db({row:{...zero,sandboxPaidCreditLots:null}})))
   .rejects.toThrow('INVALID_RECONCILIATION_RESULT');
 });
});
