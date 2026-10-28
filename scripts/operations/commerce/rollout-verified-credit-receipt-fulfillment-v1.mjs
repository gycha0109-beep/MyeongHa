// Watchtower-Track: commerce-payment
// Exact function-only rollout; never invoke db push or repair historical rows.
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyCloudflareDbRootCaV1} from '../verify-cloudflare-db-credential-connectivity.mjs';

const FILE='supabase/migrations/20261028125751_commerce_verified_credit_receipt_fulfillment_v1.sql';
const BLOB='9c8f500a528c0cd5f52a0b5d60e47caacf2fb918';
const OLD='1f0d55554608a2f82bcc5e8b548c2f57171bda2a59fbd1767577978c651102e2';
const NEW='7be388c1d1a7fa00f29faaff5f3be40e07841d221676e6d6c1ba4a4f16cc2ccc';
const WRAPPER='194661c92668abcc82dbcabc58f07d69d1cf3a6a05a49cec0e85d193ce9c1ad4';
const VERSION='20261028125751';
const INTERNAL='public.internal_cmd_chat_credit_verified_topup_v1(uuid,uuid,uuid,text,integer)';
const COMMAND='public.cmd_fulfill_verified_chat_credit_receipt_v1(uuid,uuid)';
const sha=x=>createHash('sha256').update(x).digest('hex');
function requireValue(condition){if(!condition)throw Error('ROLLOUT_GATE_REJECTED');}
async function definition(client,signature){
 const r=await client.query('select pg_get_functiondef(to_regprocedure($1)) as ddl',[signature]);
 return r.rows[0]?.ddl??null;
}
async function verify(client){
 requireValue(sha(await definition(client,INTERNAL))===NEW);
 requireValue(sha(await definition(client,COMMAND))===WRAPPER);
 const r=await client.query(`select
  has_function_privilege('myeongha_api_executor',$1,'EXECUTE') as api,
  not has_function_privilege('anon',$1,'EXECUTE') and
  not has_function_privilege('authenticated',$1,'EXECUTE') and
  not has_function_privilege('service_role',$1,'EXECUTE') and
  not has_function_privilege('myeongha_api_executor',$2,'EXECUTE') as sealed`,[COMMAND,INTERNAL]);
 requireValue(r.rows[0]?.api===true&&r.rows[0]?.sealed===true);
 const ledger=await client.query('select name from supabase_migrations.schema_migrations where version=$1',[VERSION]);
 requireValue(ledger.rows.length===1&&ledger.rows[0].name==='commerce_verified_credit_receipt_fulfillment_v1');
}

let client,transaction=false,stage='admission';
try{
 const expected=process.env.COMMERCE_ROLLOUT_HEAD_SHA;
 requireValue(process.env.GITHUB_REF==='refs/heads/main'&&/^[a-f0-9]{40}$/u.test(expected??'')&&
  process.env.GITHUB_SHA===expected&&execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()===expected&&
  process.env.COMMERCE_ROLLOUT_CONFIRM==='ACTIVATE_VERIFIED_RECEIPT_FULFILLMENT_ONLY');
 requireValue(execFileSync('git',['hash-object',FILE],{encoding:'utf8'}).trim()===BLOB);
 const ca=process.env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM;
 requireValue(verifyCloudflareDbRootCaV1(ca));
 const host=process.env.SUPABASE_PRODUCTION_SESSION_POOLER_HOST;
 requireValue(typeof host==='string'&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$/u.test(host));
 client=new pg.Client({host,port:5432,database:'postgres',user:'postgres.cnsfpcdiyofqvhpcegfc',
  password:process.env.SUPABASE_DB_PASSWORD,ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:12000});
 stage='connect';await client.connect();
 stage='preflight';await client.query('begin');transaction=true;
 await client.query("set local lock_timeout='5s';set local statement_timeout='30s'");
 await client.query("select pg_advisory_xact_lock(hashtext('commerce-receipt-fulfillment-v1'))");
 const existing=await definition(client,COMMAND);
 if(existing!==null){await verify(client);await client.query('rollback');transaction=false;
  console.log('PASS_VERIFIED_RECEIPT_FULFILLMENT_ALREADY_APPLIED_NO_REPLAY');
 }else{
  requireValue(sha(await definition(client,INTERNAL))===OLD);
  const ledger=await client.query('select version from supabase_migrations.schema_migrations where version=$1',[VERSION]);
  requireValue(ledger.rows.length===0);
  const before=(await client.query("select count(*)::text as n from public.chat_credit_lots_v1 where source_kind='portone_topup'")).rows[0].n;
  const source=readFileSync(FILE,'utf8').replaceAll('\r\n','\n');
  requireValue((source.match(/\bbegin;/gu)??[]).length===1&&(source.match(/\bcommit;/gu)??[]).length===1);
  const body=source.replace(/^((?:--[^\n]*\n)+)begin;\n/u,'$1').replace(/\ncommit;\s*$/u,'');
  stage='atomic_apply';await client.query(body);
  await client.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',
   [VERSION,'commerce_verified_credit_receipt_fulfillment_v1',[source]]);
  await verify(client);
  requireValue((await client.query("select count(*)::text as n from public.chat_credit_lots_v1 where source_kind='portone_topup'")).rows[0].n===before);
  await client.query('commit');transaction=false;
  stage='postdeploy';await verify(client);
  console.log('PASS_VERIFIED_RECEIPT_FULFILLMENT_FUNCTIONS_ACL_HISTORY_NO_CREDITS_MINTED');
 }
}catch{
 if(transaction)try{await client?.query('rollback');}catch{}
 console.error(JSON.stringify({result:'HOLD',stage,rawDiagnosticsExposed:false}));process.exitCode=1;
}finally{await client?.end().catch(()=>{});}
