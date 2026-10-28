// Watchtower-Track: commerce-payment
// Direct DB concurrency/rollback/ACL checks on disposable localhost PostgreSQL.
import pg from 'pg';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const host=process.env.PGHOST??'127.0.0.1';
if(!['127.0.0.1','localhost'].includes(host))throw Error('Disposable localhost DB required');
const config={host,port:Number(process.env.PGPORT??57931),user:process.env.PGUSER??'postgres',
 database:process.env.PGDATABASE??'commerce_fulfillment',ssl:false};
const s='cfc20000-0000-4000-8000-000000000001',other='cfc20000-0000-4000-8000-000000000002';
const sql='select * from public.cmd_fulfill_verified_chat_credit_receipt_v1($1::uuid,$2::uuid)';
const owner=new pg.Client(config);await owner.connect();
async function fulfill(client,receipt,subject=s){
 await client.query('begin');
 try{await client.query('set local role myeongha_api_executor');
  await client.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
  const r=await client.query(sql,[subject,receipt]);await client.query('commit');return r.rows[0];
 }catch(e){await client.query('rollback');throw e;}
}
try{
 await owner.query(readFileSync(new URL('./commerce_credit_receipt_fulfillment_v1.sql',import.meta.url),'utf8'));
 const fixtures=Object.fromEntries((await owner.query('select label,id from fulfillment_fixture_receipts')).rows.map(x=>[x.label,x.id]));
 for(const role of ['anon','authenticated','service_role']){
  const r=await owner.query('select has_function_privilege($1,$2,$3) as allowed',
   [role,'public.cmd_fulfill_verified_chat_credit_receipt_v1(uuid,uuid)','EXECUTE']);assert.equal(r.rows[0].allowed,false);
 }
 assert.equal((await owner.query("select has_function_privilege('myeongha_api_executor','public.internal_cmd_chat_credit_verified_topup_v1(uuid,uuid,uuid,text,integer)','EXECUTE') as allowed")).rows[0].allowed,false);
 await assert.rejects(()=>fulfill(owner,fixtures.sandbox));
 await assert.rejects(()=>fulfill(owner,fixtures.production,other));
 await assert.rejects(()=>fulfill(owner,'cfc30000-0000-4000-8000-000000000009'));
 const a=new pg.Client(config),b=new pg.Client(config);await a.connect();await b.connect();
 try{const results=await Promise.all([fulfill(a,fixtures.production),fulfill(b,fixtures.production)]);
  assert.equal(results.filter(x=>x.issued).length,1);assert.equal(results[0].lot_id,results[1].lot_id);
 }finally{await a.end();await b.end();}
 assert.equal((await fulfill(owner,fixtures.production)).issued,false);
 await owner.query('begin');await owner.query("select set_config('myeongha.subject_id',$1,true)",[s]);
 assert.equal((await owner.query(sql,[s,fixtures.rollback])).rows[0].issued,true);
 await owner.query('rollback');
 assert.equal((await fulfill(owner,fixtures.rollback)).issued,true);
 const check=await owner.query("select count(*)::text as n,sum(credits_issued)::text as credits,bool_and(expires_at is null) as never_expires from public.chat_credit_lots_v1 where source_kind='portone_topup' and subject_id=$1",[s]);
 assert.deepEqual(check.rows[0],{n:'2',credits:'600',never_expires:true});
 assert.equal((await owner.query("select count(*)::text as n from public.chat_credit_lots_v1 where source_ref=$1",[fixtures.sandbox])).rows[0].n,'0');
 console.log('PASS_RECEIPT_FULFILLMENT_CONCURRENCY_REPLAY_ROLLBACK_OWNER_SANDBOX_ACL_NONEXPIRY');
}finally{await owner.end();}
