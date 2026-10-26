import {describe,expect,it,vi} from 'vitest';
import {readOperatorChatCapabilityV1} from './commerce-operator-chat-capability-v1.js';

const subject='11111111-1111-4111-8111-111111111111';
function fixture(reply:readonly unknown[]) {
 const query=vi.fn(async(_:string,values?:readonly unknown[])=>({rows:reply}));
 return {query,client:{query:async<Row>(sql:string,values?:readonly unknown[])=>({rows:(await query(sql,values)).rows as readonly Row[]})}};
}
describe('single-account operator chat privileges',()=>{
 it('allows only the database-approved scope for a verified Subject',async()=>{
  const f=fixture([{freeChat:true,sandboxCheckout:true}]);
  expect(await readOperatorChatCapabilityV1(f.client,subject)).toEqual({
    freeChat:true,sandboxCheckout:true,
  });
  expect(f.query).toHaveBeenCalledOnce();
  expect(f.query.mock.calls[0]?.[1]).toEqual([subject]);
 });
 it('does not equate ordinary membership with a free-chat grant',async()=>{
  const f=fixture([{freeChat:false,sandboxCheckout:false}]);
  expect((await readOperatorChatCapabilityV1(f.client,subject)).freeChat).toBe(false);
 });
 it('fails closed on missing or malformed authority',async()=>{
  for(const rows of [[],[{freeChat:'true',sandboxCheckout:true}],[
    {freeChat:true,sandboxCheckout:true},{freeChat:true,sandboxCheckout:true},
  ]]) {
   await expect(readOperatorChatCapabilityV1(fixture(rows).client,subject)).rejects.toThrow();
  }
 });
 it('rejects caller-controlled or invalid subject values without accessing SQL',async()=>{
  const f=fixture([{freeChat:true,sandboxCheckout:true}]);
  await expect(readOperatorChatCapabilityV1(f.client,'gycha0109@gmail.com')).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
 });
});
