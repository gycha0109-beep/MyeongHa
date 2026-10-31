import {createHmac,randomBytes} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {authenticatePortOneV2CancellationWebhookCandidateV1 as authenticate}
 from '../apps/api/src/portone-v2-cancellation-webhook-candidate-v1.js';
import {inspectPortOneV2CancellationViaGetCandidateV1 as inspect}
 from '../apps/api/src/portone-v2-cancellation-readback-get-v1.js';
import {COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1 as RECEIPT_LOOKUP}
 from '../scripts/operations/commerce-cancellation-payment-receipt-link-v1.mjs';
import {
 COMMERCE_PORTONE_CANCELLATION_EVENT_PRIVATE_PERSIST_V1 as CONFIG,
 COMMERCE_PORTONE_CANCELLATION_EVENT_PERSIST_SQL_V1 as PERSIST_SQL,
 persistVerifiedPortOneCancellationEventPrivateV1 as persist,
} from '../scripts/operations/commerce-portone-cancellation-event-private-persist-v1.mjs';

const now=new Date('2026-10-31T07:00:00.000Z');
const ts=String(Math.floor(now.getTime()/1000));
const webhookBytes=Buffer.from('0123456789abcdef0123456789abcdef');
const webhookSecret='whsec_'+webhookBytes.toString('base64');
const sourceHmacSecret='a-32-character-internal-source-key-for-tests';
const cfg={environment:'production',webhookSecrets:[webhookSecret],now:()=>now};
const PAYMENT_ID='pmt-123',TX='tx-123',CANCEL_ID='cancel-123';
const UUID='00000000-0000-4000-8000-000000000001';
const originalRow=Object.freeze({
 paymentAttemptId:UUID,
 verifiedReceiptId:'00000000-0000-4000-8000-000000000002',
 purchaseIntentId:'00000000-0000-4000-8000-000000000003',
 subjectId:'00000000-0000-4000-8000-000000000004',
 readerCharacterId:'seyeon',
 verifiedTransactionId:TX,verifiedAmountMinor:'8900',verifiedCurrency:'KRW',
});
function signed(type='Transaction.Cancelled',data={
 paymentId:PAYMENT_ID,transactionId:TX,cancellationId:CANCEL_ID,
}){
 const rawBody=JSON.stringify({
  type,timestamp:'2026-10-31T06:59:59.000Z',data,
 });
 const id='webhook-id-123';
 const signature=createHmac('sha256',webhookBytes)
  .update(id).update('.').update(ts).update('.').update(rawBody).digest('base64');
 return {rawBody,headers:{
  'content-type':'application/json','webhook-id':id,'webhook-timestamp':ts,
  'webhook-signature':'v1,'+signature,
 }};
}
function readback({kind='full',status=200}={}){
 let payment;
 if(kind==='full'){
  payment={
   id:PAYMENT_ID,transactionId:TX,status:'CANCELLED',version:'V2',
   currency:'KRW',channel:{type:'LIVE'},amount:{paid:8900,cancelled:8900},
   cancellations:[{id:CANCEL_ID,status:'SUCCEEDED',totalAmount:8900}],
  };
 }else if(kind==='partial'){
  payment={
   id:PAYMENT_ID,transactionId:TX,status:'PARTIAL_CANCELLED',version:'V2',
   currency:'KRW',channel:{type:'LIVE'},amount:{paid:8900,cancelled:3000},
   cancellations:[{id:CANCEL_ID,status:'SUCCEEDED',totalAmount:3000}],
  };
 }else if(kind==='laterFull'){
  payment={
   id:PAYMENT_ID,transactionId:TX,status:'CANCELLED',version:'V2',
   currency:'KRW',channel:{type:'LIVE'},amount:{paid:8900,cancelled:8900},
   cancellations:[{id:CANCEL_ID,status:'SUCCEEDED',totalAmount:3000},
    {id:'later-cancel',status:'SUCCEEDED',totalAmount:5900}],
  };
 }else if(kind==='pending'){
  payment={
   id:PAYMENT_ID,transactionId:TX,status:'PAID',version:'V2',
   currency:'KRW',channel:{type:'LIVE'},amount:{paid:8900,cancelled:0},
   cancellations:[{id:CANCEL_ID,status:'REQUESTED',totalAmount:8900}],
  };
 }else if(kind==='wrong'){
  payment={
   id:PAYMENT_ID,transactionId:'other',status:'CANCELLED',version:'V2',
   currency:'KRW',channel:{type:'LIVE'},amount:{paid:8900,cancelled:8900},
   cancellations:[{id:CANCEL_ID,status:'SUCCEEDED',totalAmount:8900}],
  };
 }else if(kind==='otherCancellation'){
  payment={
   id:PAYMENT_ID,transactionId:TX,status:'CANCELLED',version:'V2',
   currency:'KRW',channel:{type:'LIVE'},amount:{paid:8900,cancelled:8900},
   cancellations:[{id:'different-cancellation',status:'SUCCEEDED',totalAmount:8900}],
  };
 }
 return vi.fn(async(url,options)=>{
  expect(url).toBe('https://api.portone.io/payments/'+PAYMENT_ID);
  expect(options.method).toBe('GET');
  expect(options.redirect).toBe('manual');
  return new Response(JSON.stringify(payment??{message:'unavailable'}),{
   status,headers:{'content-type':'application/json'},
  });
 });
}
function db({
 rows=[originalRow],persistRows=[{providerEventId:UUID,replayed:false}],
 authority={writable:true,completeVisibility:true,currentUser:'postgres'},
 onCommit,dbError,
}={}){
 const queries=[];
 let txMode='none';
 const query=vi.fn(async(sql,args)=>{
  if(sql==='begin isolation level repeatable read read only')txMode='read';
  if(sql==='begin isolation level serializable')txMode='write';
  queries.push({sql,args});
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[
   txMode==='read'?{
    readOnly:true,completeVisibility:authority.completeVisibility,
   }:authority,
  ]};
  if(sql===RECEIPT_LOOKUP){
   expect(args[0]).toBe(PAYMENT_ID);
   return {rows:args[1]===TX?rows:[]};
  }
  if(sql===PERSIST_SQL){
   if(dbError)throw dbError;
   return {rows:persistRows};
  }
  if(sql==='commit'&&onCommit)throw onCommit;
  expect(sql).not.toMatch(/\b(insert into|update public|delete from)\b/iu);
  return {rows:[]};
 });
 return {query,queries};
}
const execute=(client,override={})=>persist({
 dbClient:client,request:signed(),webhookConfig:cfg,
 apiSecret:'private-test-portone-token-123456789',
 sourceHmacSecret,fetchImpl:readback(),
 authenticator:authenticate,providerInspector:inspect,...override,
});
const dbMutations=client=>client.queries.filter(({sql})=>sql===PERSIST_SQL);
describe('P4 PortOne cancellation canonical Provider Event private persistence candidate',()=>{
 it('is not mounted/deployed and exposes no grant or provider cancellation capability',()=>{
  expect(CONFIG).toEqual({
   schemaVersion:'commerce-portone-cancellation-event-private-persist-v1',
   publicRouteMounted:false,productionPersistenceMounted:false,
   sqlDeployed:false,refundExecutionEnabled:false,entitlementMutationEnabled:false,
  });
  const sqlPath='docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql';
  expect(existsSync(resolve(sqlPath))).toBe(true);
  expect(existsSync(resolve('supabase/migrations/20261031170000_commerce_portone_cancellation_event_persistence_v1.sql'))).toBe(false);
  const sql=readFileSync(resolve(sqlPath),'utf8');
  expect(sql).toContain('security invoker');
  expect(sql).toContain('for update of cr');
  expect(sql).toContain('p_signed_event_hmac');
  expect(sql).toContain('p_readback_shape_hmac');
  expect(sql).toContain("v_event.provider_ordering_key is not null");
  expect(sql).toContain("p_event_type='Transaction.PartialCancelled'");
  expect(sql).toContain('exactSucceededCancellationAmountMinor');
  expect(sql).toContain('cancellationIdHmac');
  expect(sql).toContain('revoke all on function');
  expect(sql).not.toMatch(/update public\.entitlement_grants|insert into public\.entitlement_events|http_post/u);
 });
 it('persists exact signed final cancellation once, stores fingerprints not raw body',async()=>{
  const c=db(),http=readback();
  const r=await execute(c,{fetchImpl:http});
  expect(r).toMatchObject({
   kind:'canonical_event_recorded',canonicalEventStored:true,replayed:false,
   providerOrderingProven:false,refunded:false,grantRevoked:false,
   entitlementMutationAuthorized:false,refundExecutionAuthorized:false,
  });
  expect(http).toHaveBeenCalledTimes(1);
  expect(dbMutations(c)).toHaveLength(1);
  expect(dbMutations(c)[0].args.slice(0,5)).toEqual([
   PAYMENT_ID,'webhook-id-123','Transaction.Cancelled',TX,'full_cancel_shape_observed',
  ]);
  for(const arg of dbMutations(c)[0].args.slice(5,8)){
   expect(arg).toMatch(/^hmac-sha256:k1:[0-9a-f]{64}$/u);
   expect(arg).not.toContain('seyeon');
   expect(arg).not.toContain('rawBody');
  }
  expect(dbMutations(c)[0].args.slice(8)).toEqual([8900,8900]);
  expect(c.queries.at(-1).sql).toBe('commit');
  expect(JSON.stringify(r)).not.toContain(PAYMENT_ID);
  expect(JSON.stringify(r)).not.toContain(TX);
 });
 it('replayed identical event is reported without a new entitlement mutation',async()=>{
  const c=db({persistRows:[{providerEventId:UUID,replayed:true}]});
  const r=await execute(c);
  expect(r).toMatchObject({
   kind:'canonical_event_replayed',canonicalEventStored:true,replayed:true,
   refunded:false,grantRevoked:false,
  });
 });
 it('partial cancellation can only persist as partial evidence, never full refund',async()=>{
  const c=db();
  const r=await execute(c,{
   request:signed('Transaction.PartialCancelled'),fetchImpl:readback({kind:'partial'}),
  });
  expect(r.kind).toBe('canonical_event_recorded');
  expect(dbMutations(c)[0].args[2]).toBe('Transaction.PartialCancelled');
  expect(dbMutations(c)[0].args[4]).toBe('partial_cancel_shape_observed');
  expect(r.refunded).toBe(false);
 });
 it('pending cancellation cannot enter durable VERIFIED event writer',async()=>{
  const c=db(),http=readback();
  const r=await execute(c,{request:signed('Transaction.CancelPending'),fetchImpl:http});
  expect(r.kind).toBe('pending_or_unsupported_cancellation_event');
  expect(c.query).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
 });
 it('invalid signature fails before database or PG network',async()=>{
  const c=db(),http=readback();
  const request=signed();
  const r=await execute(c,{
   request:{...request,rawBody:request.rawBody.replace('pmt-123','attacker')},
   fetchImpl:http,
  });
  expect(r.kind).toBe('authentication_rejected');
  expect(c.query).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
 });
 it('non-production event fails before signature/network/DB',async()=>{
  const c=db(),http=readback();
  const r=await execute(c,{webhookConfig:{...cfg,environment:'sandbox'},fetchImpl:http});
  expect(r.kind).toBe('production_only_hold');
  expect(c.query).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
 });
 it('missing exact verified original Reader Receipt never invokes GET',async()=>{
  const c=db({rows:[]}),http=readback();
  const r=await execute(c,{fetchImpl:http});
  expect(r.kind).toBe('no_exact_original_reading_receipt');
  expect(dbMutations(c)).toHaveLength(0);
  expect(http).not.toHaveBeenCalled();
 });
 it('PortOne GET failure cannot persist or mutate',async()=>{
  const c=db(),r=await execute(c,{fetchImpl:readback({status:503})});
  expect(r.kind).toBe('provider_readback_unavailable');
  expect(dbMutations(c)).toHaveLength(0);
 });
 it('mismatched signed event type and provider final state cannot be persisted',async()=>{
  const c=db();
  const r=await execute(c,{request:signed('Transaction.PartialCancelled')});
  expect(r.kind).toBe('unverified_exact_cancellation_amount');
  expect(dbMutations(c)).toHaveLength(0);
 });
 it('pending provider cancellation does not become finality from a signed final tag',async()=>{
  const c=db(),r=await execute(c,{fetchImpl:readback({kind:'pending'})});
  expect(r.kind).toBe('unverified_exact_cancellation_amount');
  expect(dbMutations(c)).toHaveLength(0);
 });
 it('other provider cancellation ID cannot be substituted',async()=>{
  const c=db(),r=await execute(c,{fetchImpl:readback({kind:'otherCancellation'})});
  expect(r.kind).toBe('unverified_exact_cancellation_amount');
  expect(dbMutations(c)).toHaveLength(0);
 });
 it('tampered signed provider transaction cannot use a different paid receipt',async()=>{
  const c=db({rows:[]});
  const r=await execute(c,{request:signed('Transaction.Cancelled',{
   paymentId:PAYMENT_ID,transactionId:'other-transaction',cancellationId:CANCEL_ID,
  })});
  expect(r.kind).toBe('no_exact_original_reading_receipt');
  expect(dbMutations(c)).toHaveLength(0);
 });
 it('incomplete visibility refuses writable persistence',async()=>{
  const c=db({authority:{
   writable:true,completeVisibility:false,currentUser:'member',
  }});
  const r=await execute(c);
  expect(r.kind).toBe('original_receipt_unavailable');
  expect(dbMutations(c)).toHaveLength(0);
  expect(c.queries.at(-1).sql).toBe('rollback');
 });
 it('service-role is never an authorized private executor',async()=>{
  const c=db({authority:{
   writable:true,completeVisibility:true,currentUser:'service_role',
  }});
  const r=await execute(c);
  expect(r.kind).toBe('persistence_unavailable');
  expect(dbMutations(c)).toHaveLength(0);
 });
 it('read-only transaction cannot persist',async()=>{
  const c=db({authority:{
   writable:false,completeVisibility:true,currentUser:'postgres',
  }});
  expect((await execute(c)).kind).toBe('persistence_unavailable');
  expect(dbMutations(c)).toHaveLength(0);
 });
 it('DB conflict or errors remain unacknowledged and rollback',async()=>{
  const c=db({dbError:Error('sensitive database conflict')});
  const r=await execute(c);
  expect(r.kind).toBe('persistence_unavailable');
  expect(c.queries.at(-1).sql).toBe('rollback');
  expect(JSON.stringify(r)).not.toContain('sensitive');
 });
 it('unknown COMMIT outcome is never reported as absent or successfully written',async()=>{
  const c=db({onCommit:Error('network dropped after commit')});
  const r=await execute(c);
  expect(r.kind).toBe('persistence_outcome_unknown');
  expect(r.canonicalEventStored).toBe(false);
  expect(r.refundExecutionAuthorized).toBe(false);
 });
 it('malformed DB output always fails closed',async()=>{
  const c=db({persistRows:[{providerEventId:'not-a-uuid',replayed:false}]});
  const r=await execute(c);
  expect(r.kind).toBe('persistence_unavailable');
  expect(c.queries.at(-1).sql).toBe('rollback');
 });
 it('weak/missing HMAC secret refuses signature processing and database access',async()=>{
  const c=db(),http=readback();
  const r=await execute(c,{sourceHmacSecret:'too-short',fetchImpl:http});
  expect(r.kind).toBe('source_fingerprint_authority_unavailable');
  expect(c.query).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
 });
});

describe('canonical cancellation exact-amount source invariants',()=>{
 it('requires a signed exact cancellation ID before Receipt lookup or PG GET',async()=>{
  const c=db(),http=readback();
  const r=await execute(c,{
   request:signed('Transaction.Cancelled',{paymentId:PAYMENT_ID,transactionId:TX}),
   fetchImpl:http,
  });
  expect(r.kind).toBe('exact_cancellation_id_required');
  expect(c.query).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
 });
 it('partial webhook replay after a later successful cancellation preserves exact amount/HMAC',async()=>{
  const first=db(),later=db({persistRows:[{providerEventId:UUID,replayed:true}]});
  const request=signed('Transaction.PartialCancelled');
  const a=await execute(first,{request,fetchImpl:readback({kind:'partial'})});
  const b=await execute(later,{request,fetchImpl:readback({kind:'laterFull'})});
  expect(a.kind).toBe('canonical_event_recorded');
  expect(b.kind).toBe('canonical_event_replayed');
  const oldArgs=dbMutations(first)[0].args, newArgs=dbMutations(later)[0].args;
  expect(oldArgs.slice(5,9)).toEqual(newArgs.slice(5,9));
  expect(oldArgs.slice(8)).toEqual([3000,3000]);
  expect(newArgs.slice(8)).toEqual([3000,8900]);
  expect(a.refunded).toBe(false);
  expect(b.grantRevoked).toBe(false);
 });
 it('full payment cancellation does not mislabel one individual 3000 refund as 8900',async()=>{
  const c=db();
  const r=await execute(c,{fetchImpl:readback({kind:'laterFull'})});
  expect(r.kind).toBe('canonical_event_recorded');
  expect(dbMutations(c)[0].args.slice(8)).toEqual([3000,8900]);
  expect(r.refundExecutionAuthorized).toBe(false);
 });
 it('a forged provider adapter without a verified exact success amount cannot persist',async()=>{
  const c=db();
  const r=await execute(c,{
   providerInspector:async input=>({
    ...await inspect(input),
    observedMatchingSucceededCancellationMinor:null,
   }),
  });
  expect(r.kind).toBe('unverified_exact_cancellation_amount');
  expect(dbMutations(c)).toHaveLength(0);
 });
 it('a signed partial event cannot treat a single full-payment cancellation as partial',async()=>{
  const c=db();
  const r=await execute(c,{
   request:signed('Transaction.PartialCancelled'),
   fetchImpl:readback({kind:'full'}),
  });
  expect(r.kind).toBe('unverified_exact_cancellation_amount');
  expect(dbMutations(c)).toHaveLength(0);
 });
});
