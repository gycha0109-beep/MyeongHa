// Watchtower-Track: commerce-payment
import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1,
 inspectUnresolvedPortOneAttemptsReadOnlyV1,
} from '../scripts/operations/commerce-unresolved-attempt-inspection-v1.mjs';

const zero=Object.freeze({
 sandboxHandedOffWithoutReceipt:'0',
 productionHandedOffWithoutReceipt:'0',
 sandboxResponseReceivedWithoutReceipt:'0',
 productionResponseReceivedWithoutReceipt:'0',
 unknownEnvironmentWithoutReceipt:'0',
});
function db({row=zero,authority={readOnly:true,completeVisibility:true},error}={}){
 return {query:vi.fn(async sql=>{
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1){
   if(error)throw error;
   return {rows:[row]};
  }
  return {rows:[]};
 })};
}
describe('Commerce unresolved PortOne Attempt operational inspection',()=>{
 it('reports unresolved handoffs as review candidates, never PAID/refund/mint',async()=>{
  const client=db({row:{...zero,sandboxHandedOffWithoutReceipt:'14',
   rawCard:'private-should-never-leak'}});
  const result=await inspectUnresolvedPortOneAttemptsReadOnlyV1(client);
  expect(result.status).toBe('review_candidates');
  expect(result.counts.sandboxHandedOffWithoutReceipt).toBe('14');
  expect(result).toMatchObject({
   providerReconciled:false,paymentAuthorized:false,
   refundAuthorized:false,fulfillmentAuthorized:false,
   pspCallsPerformed:false,writesPerformed:false,
  });
  expect(JSON.stringify(result)).not.toContain('private-should-never-leak');
  expect(client.query.mock.calls[0][0]).toContain('repeatable read read only');
  expect(client.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('reports zero observations without claiming provider truth',async()=>{
  const result=await inspectUnresolvedPortOneAttemptsReadOnlyV1(db());
  expect(result.status).toBe('clear_observation');
  expect(result.providerReconciled).toBe(false);
  expect(result.counts).toEqual(zero);
 });
 it.each([
  'productionHandedOffWithoutReceipt',
  'sandboxResponseReceivedWithoutReceipt',
  'productionResponseReceivedWithoutReceipt',
  'unknownEnvironmentWithoutReceipt',
 ])('flags %s separately without creating money effects',async key=>{
  const result=await inspectUnresolvedPortOneAttemptsReadOnlyV1(
   db({row:{...zero,[key]:'1'}}));
  expect(result.status).toBe('review_candidates');
  expect(result.writesPerformed).toBe(false);
  expect(result.pspCallsPerformed).toBe(false);
 });
 it('never treats a limited-visibility connection as a clean reconciliation',async()=>{
  const client=db({authority:{readOnly:true,completeVisibility:false}});
  await expect(inspectUnresolvedPortOneAttemptsReadOnlyV1(client))
   .rejects.toThrow('UNRESOLVED_ATTEMPT_AUDIT_AUTHORITY_REQUIRED');
  expect(client.query.mock.calls.some(
   ([sql])=>sql===COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1)).toBe(false);
  expect(client.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('rejects malformed counts and rolls back',async()=>{
  const client=db({row:{...zero,productionHandedOffWithoutReceipt:null}});
  await expect(inspectUnresolvedPortOneAttemptsReadOnlyV1(client))
   .rejects.toThrow('INVALID_UNRESOLVED_ATTEMPT_AUDIT_RESULT');
  expect(client.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('never claims a successful inspection when a query fails',async()=>{
  const client=db({error:Error('private database driver error')});
  await expect(inspectUnresolvedPortOneAttemptsReadOnlyV1(client)).rejects.toThrow();
  expect(client.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('keeps Payment Attempt ids and provider facts out of aggregate SQL output',()=>{
  expect(COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1).toContain('commerce_payment_attempts');
  expect(COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1).toContain('commerce_receipts');
  expect(COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1).toContain("r.verification_status='verified'");
  expect(COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1).toContain(
   'r.external_transaction_id=a.provider_transaction_id');
  expect(COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1).not.toMatch(/select\s+a\.id\b/iu);
  expect(COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1).not.toMatch(/\bupdate\s+public\./iu);
  expect(COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1).not.toMatch(/\binsert\s+into\b/iu);
 });
});
