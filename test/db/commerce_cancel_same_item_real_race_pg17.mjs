import assert from 'node:assert/strict';
import pg from 'pg';

// Two real PostgreSQL connections, same provider cancellation item, different
// signed webhook envelopes. No PortOne API, entitlement writer or refund POST.
const {Client}=pg;
const PURCHASE_B2='12192300-0000-0000-0000-000000000002';
const PURCHASE_B3='12192300-0000-0000-0000-000000000003';
const FIRST_WEBHOOK='synthetic-b2-concurrent-webhook-first';
const SECOND_WEBHOOK='synthetic-b2-concurrent-webhook-second';
const HMAC=letter=>'hmac-sha256:k1:'+letter.repeat(64);
const persistence=String.raw`select provider_event_id::text as "providerEventId",replayed
from public.internal_persist_portone_cancellation_event_v1(
 $1::text,$2::text,$3::text,$4::text,$5::text,
 $6::text,$7::text,$8::text,$9::bigint,$10::bigint)`;

if(process.env.GITHUB_ACTIONS!=='true'||
   process.env.DB_SUITE!=='postgres17'||
   process.env.PGHOST!=='localhost'||
   process.env.PGPORT!=='5432'||
   !/^myeongha_ci_case_[0-9]+$/u.test(process.env.PGDATABASE??'')){
 throw Error('DENY: cancellation same-item race requires disposable PG17 CI');
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function assertBlocking(observer,waiterPid,holderPid){
 for(let attempt=0;attempt<80;attempt++){
  const result=await observer.query(
   'select wait_event_type as waiting,pg_catalog.pg_blocking_pids(pid) as blockers '+
   'from pg_catalog.pg_stat_activity where pid=$1::integer',
   [waiterPid],
  );
  const row=result.rows[0];
  if(row?.waiting==='Lock'&&Array.isArray(row.blockers)&&
     row.blockers.includes(holderPid))return;
  await sleep(50);
 }
 throw Error('PG17_CONCURRENT_CANCELLATION_RECEIPT_LOCK_WAIT_NOT_OBSERVED');
}
async function snapshot(client){
 const r=await client.query(
  'select pi.id::text as purchase,cr.id::text as receipt,'+
  'cr.external_transaction_id as "originalTransaction",g.id::text as grant,'+
  'g.revision::text as revision,g.status as status,'+
  'cr.verified_amount_minor::text as paid '+
  'from public.purchase_intents pi '+
  'join public.commerce_receipts cr on cr.purchase_intent_id=pi.id '+
  'join public.entitlement_grants g on g.source_receipt_id=cr.id '+
  "where pi.id in ($1::uuid,$2::uuid) and cr.provider='portone_v2' "+
  "and cr.environment='production' and cr.verification_status='verified' "+
  "and g.grant_source_type='purchase' order by pi.id",
  [PURCHASE_B2,PURCHASE_B3],
 );
 assert.equal(r.rows.length,2,'independent B2 and B3 verified purchases required');
 const b2=r.rows.find(x=>x.purchase===PURCHASE_B2);
 const b3=r.rows.find(x=>x.purchase===PURCHASE_B3);
 assert.ok(b2&&b3&&b2.receipt!==b3.receipt&&b2.grant!==b3.grant);
 assert.equal(b2.paid,'1','official B2 fixture changed');
 return {b2,b3,rows:r.rows};
}
const a=new Client(),b=new Client(),observer=new Client();
let aOpen=false,bOpen=false,bPending=null;
try{
 await Promise.all([a.connect(),b.connect(),observer.connect()]);
 const guard=await observer.query(
  "select current_database() as db,current_setting('server_version_num') as version",
 );
 assert.equal(guard.rows[0].db,process.env.PGDATABASE);
 assert.match(guard.rows[0].version,/^17[0-9]{4}$/u);
 const baseline=await snapshot(observer);
 const params=webhook=>[
  'synthetic-hmac-b2-payment',webhook,'Transaction.Cancelled',
  baseline.b2.originalTransaction,'full_cancel_shape_observed',
  webhook===FIRST_WEBHOOK?HMAC('a'):HMAC('d'),
  webhook===FIRST_WEBHOOK?HMAC('b'):HMAC('e'),
  HMAC('c'),1,1,
 ];
 const initial=await observer.query(
  'select count(*)::integer as total from public.commerce_provider_events '+
  "where resolved_receipt_id=$1::uuid and event_type in "+
  "('Transaction.Cancelled','Transaction.PartialCancelled') "+
  "and verified_payload_jsonb->>'cancellationIdHmac'=$2",
  [baseline.b2.receipt,HMAC('c')],
 );
 assert.equal(initial.rows[0].total,0,'test HMAC item must be unused before race');

 const holderPid=Number((await a.query('select pg_backend_pid() as pid')).rows[0].pid);
 const waiterPid=Number((await b.query('select pg_backend_pid() as pid')).rows[0].pid);
 await a.query('begin isolation level serializable');
 aOpen=true;
 await a.query("set local statement_timeout='10000ms'");
 const first=await a.query(persistence,params(FIRST_WEBHOOK));
 assert.equal(first.rowCount,1);
 assert.equal(first.rows[0].replayed,false);
 assert.match(first.rows[0].providerEventId,/^[0-9a-f-]{36}$/u);

 await b.query('begin isolation level serializable');
 bOpen=true;
 await b.query("set local statement_timeout='10000ms'");
 await b.query("set local lock_timeout='7000ms'");
 bPending=b.query(persistence,params(SECOND_WEBHOOK));
 await assertBlocking(observer,waiterPid,holderPid);

 // Only after the second session is actually waiting on the same Receipt,
 // release the first transaction. The second must never create a new Event.
 await a.query('commit');
 aOpen=false;
 let rejected;
 try{
  await bPending;
 }catch(error){rejected=error;}
 bPending=null;
 assert.ok(rejected,'same cancellation item must not persist twice');
 assert.ok(['23505','40001'].includes(rejected.code),
  'concurrent duplicate must conflict or serialize-abort');
 if(rejected.code==='23505'){
  assert.equal(rejected.constraint,'cancellation_event_persist_same_item_webhook_conflict');
 }
 await b.query('rollback');
 bOpen=false;

 // The same signed webhook event is a replay, not a second Event.
 const replay=await observer.query(persistence,params(FIRST_WEBHOOK));
 assert.equal(replay.rowCount,1);
 assert.equal(replay.rows[0].replayed,true);
 assert.equal(replay.rows[0].providerEventId,first.rows[0].providerEventId);

 const events=await observer.query(
  'select id::text as id,external_event_id as webhook,'+
  'provider_ordering_key as ordering,verified_payload_jsonb as payload '+
  'from public.commerce_provider_events where resolved_receipt_id=$1::uuid '+
  "and event_type in ('Transaction.Cancelled','Transaction.PartialCancelled') "+
  "and verified_payload_jsonb->>'cancellationIdHmac'=$2",
  [baseline.b2.receipt,HMAC('c')],
 );
 assert.equal(events.rowCount,1);
 assert.equal(events.rows[0].id,first.rows[0].providerEventId);
 assert.equal(events.rows[0].webhook,FIRST_WEBHOOK);
 assert.equal(events.rows[0].ordering,null);
 assert.equal(events.rows[0].payload.orderingProven,false);
 assert.equal(events.rows[0].payload.entitlementRevocationAuthorized,false);
 assert.equal(events.rows[0].payload.refundExecutionAuthorized,false);
 const unchanged=await snapshot(observer);
 assert.deepEqual(unchanged.rows,baseline.rows,'both Reader Grants and Receipts must remain unchanged');
 const effects=await observer.query(
  'select count(*)::integer as total from public.entitlement_events '+
  'where source_provider_event_id=$1::uuid',
  [first.rows[0].providerEventId],
 );
 assert.equal(effects.rows[0].total,0);

 process.stdout.write('PASS: real PG17 concurrent distinct webhooks / one cancellation ID '+
  'serialized by original Receipt; one Event; B2/B3 Grants intact; no effects\n');
}catch(error){
 if(aOpen){await a.query('rollback').catch(()=>{});aOpen=false;}
 if(bPending)await bPending.catch(()=>{});
 if(bOpen){await b.query('rollback').catch(()=>{});bOpen=false;}
 throw error;
}finally{
 if(aOpen)await a.query('rollback').catch(()=>{});
 if(bOpen)await b.query('rollback').catch(()=>{});
 await Promise.allSettled([a.end(),b.end(),observer.end()]);
}
