import assert from 'node:assert/strict';
import pg from 'pg';
import {
  inspectLockedReaderRevokeCasPreflightV1 as inspect,
  COMMERCE_REVOKE_READER_S1_SCOPES_SQL_V1 as scopeSql,
  COMMERCE_ACQUIRE_READER_S1_SCOPE_SQL_V1 as acquireSql,
} from '../../scripts/operations/commerce-exact-reader-revoke-cas-locked-preflight-v1.mjs';

const {Client}=pg;
const EVENT='12196200-0000-4000-8000-000000000002';
const PURCHASE_A='12192300-0000-0000-0000-000000000002';
const PURCHASE_B='12192300-0000-0000-0000-000000000003';
const disposable=/^myeongha_ci_case_[0-9]+$/u;

if(process.env.GITHUB_ACTIONS!=='true'||process.env.DB_SUITE!=='postgres17'||
 process.env.PGHOST!=='localhost'||process.env.PGPORT!=='5432'||
 !disposable.test(process.env.PGDATABASE??'')){
 throw Error('DENY: real Reader scope race is only allowed in isolated CI PostgreSQL17');
}

const waiting=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitUntilBlocked(observer,pid){
 for(let n=0;n<25;n++){
  const found=await observer.query(
   'select wait_event_type,wait_event from pg_catalog.pg_stat_activity where pid=$1',
   [pid],
  );
  const status=found.rows[0];
  if(status?.wait_event_type==='Lock'&&status?.wait_event==='advisory')
   return;
  await waiting(50);
 }
 throw Error('PG17_READER_S1_ADVISORY_WAIT_NOT_OBSERVED');
}

const a=new Client(),b=new Client(),observer=new Client();
let bInTransaction=false;
let inspectPromise=null;
try{
 await Promise.all([a.connect(),b.connect(),observer.connect()]);
 const guard=await observer.query(
  'select current_database() as db, current_setting($1) as version',
  ['server_version_num'],
 );
 assert.equal(guard.rows[0]?.db,process.env.PGDATABASE);
 assert.match(guard.rows[0]?.version,/^17[0-9]{4}$/u);

 const entries=await observer.query(
  'select pi.id::text as intent,cr.id::text as receipt,g.id::text as grant_id,'+
  'g.subject_id::text as subject_id,g.revision::text as revision,'+
  'g.last_provider_ordering_key as provider_key,g.status as status '+
  'from public.purchase_intents pi '+
  'join public.commerce_receipts cr on cr.purchase_intent_id=pi.id '+
  'join public.entitlement_grants g on g.source_receipt_id=cr.id '+
  "where pi.id in ($1::uuid,$2::uuid) and g.grant_source_type='purchase' "+
  'order by pi.id',
  [PURCHASE_A,PURCHASE_B],
 );
 assert.equal(entries.rows.length,2,'B2/B3 independent paid Reader Grants must exist');
 const aGrant=entries.rows.find(x=>x.intent===PURCHASE_A);
 const bGrant=entries.rows.find(x=>x.intent===PURCHASE_B);
 assert.ok(aGrant);
 assert.ok(bGrant);
 assert.notEqual(aGrant.grant_id,bGrant.grant_id);
 assert.equal(aGrant.status,'active');
 assert.equal(bGrant.status,'active');

 const result=await observer.query(scopeSql,[EVENT,aGrant.grant_id]);
 assert.ok(result.rows.length>0&&result.rows.length<=64,'exact B2 Reader S1 scopes required');
 for(const row of result.rows){
  assert.equal(row.subjectId,aGrant.subject_id);
  assert.equal(row.receiptId,aGrant.receipt);
  assert.equal(row.purchaseIntentId,PURCHASE_A);
 }

 const pid=Number((await a.query('select pg_backend_pid() as pid')).rows[0].pid);
 assert.ok(Number.isInteger(pid)&&pid>0);
 await b.query('begin isolation level read committed');
 bInTransaction=true;
 await b.query(
  "select pg_catalog.set_config('myeongha.subject_id',$1::text,true)",
  [aGrant.subject_id],
 );
 for(const scope of result.rows){
  await b.query(acquireSql,[
   scope.subjectId,scope.officialReadingId,scope.readerCharacterId,
  ]);
 }

 // The observer establishes the old CAS revision before the competing
 // transaction commits, while A must first wait for B's shared Reader S1.
 inspectPromise=inspect(a,{
  providerEventId:EVENT,
  entitlementGrantId:aGrant.grant_id,
  expectedReceiptId:aGrant.receipt,
  expectedGrantRevision:aGrant.revision,
  expectedLastProviderOrderingKey:aGrant.provider_key,
 });
 await waitUntilBlocked(observer,pid);

 // Simulate the existing competing S1-participating writer changing ONLY the
 // exact original Grant while it holds the same Reader S1 transaction lock.
 // This synthetic revision change is not a Provider Effect or refund.
 const changed=await b.query(
  'update public.entitlement_grants set revision=revision+1 '+
  'where id=$1::uuid and revision=$2::bigint returning revision::text as revision',
  [aGrant.grant_id,aGrant.revision],
 );
 assert.equal(changed.rowCount,1,'B2 synthetic competing revision must change once');
 await b.query('commit');
 bInTransaction=false;

 const preflight=await inspectPromise;
 assert.equal(preflight.kind,'grant_cas_snapshot_changed');
 assert.equal(preflight.readerS1ScopesLocked,true);
 assert.equal(preflight.sourceEventLocked,true);
 assert.equal(preflight.exactReaderGrantLocked,true);
 assert.equal(preflight.revisionProven,false);
 assert.equal(preflight.grantRevocationAuthorized,false);
 assert.equal(preflight.entitlementEffectInvoked,false);
 assert.equal(preflight.refundFinalityProven,false);
 assert.equal(preflight.writesPerformed,false);

 const after=await observer.query(
  'select id::text as id,revision::text as revision,status '+
  'from public.entitlement_grants where id in ($1::uuid,$2::uuid)',
  [aGrant.grant_id,bGrant.grant_id],
 );
 assert.equal(after.rows.find(x=>x.id===aGrant.grant_id)?.revision,
  String(BigInt(aGrant.revision)+1n));
 assert.equal(after.rows.find(x=>x.id===bGrant.grant_id)?.revision,bGrant.revision);
 assert.equal(after.rows.find(x=>x.id===bGrant.grant_id)?.status,'active');
 const effects=await observer.query(
  'select count(*)::text as total from public.entitlement_events '+
  'where source_provider_event_id=$1::uuid',
  [EVENT],
 );
 assert.equal(effects.rows[0].total,'0');

 process.stdout.write(
  'PASS isolated PG17 two-connection Reader S1 advisory wait -> exact B2 Grant CAS HOLD; '+
  'B3 preserved; no Provider refund/Entitlement Effect\n',
 );
}catch(error){
 if(inspectPromise)await inspectPromise.catch(()=>{});
 throw error;
}finally{
 if(bInTransaction)await b.query('rollback').catch(()=>{});
 await Promise.allSettled([a.end(),b.end(),observer.end()]);
}
