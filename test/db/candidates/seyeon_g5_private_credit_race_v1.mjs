// Watchtower-Track: security
// Two ACTUAL PostgreSQL sessions against the exact named throwaway clone.
// No paid Provider calls; persisted S0-positive receipt is a synthetic fixture.
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';

if (process.env.CI!=='true' || process.env.PGHOST!=='localhost' ||
    process.env.PGDATABASE!=='myeongha_commerce_credit_candidate_test') {
  throw Error('HOLD: G5 concurrency only on exact named disposable PG database');
}
const pool=new Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT??5432),
  user:process.env.PGUSER,password:process.env.PGPASSWORD,
  database:process.env.PGDATABASE,ssl:false,max:4,statement_timeout:7000});
const original=readFileSync(
  new URL('./seyeon_g4_positive_delivery_settlement_v1_test.sql',import.meta.url),'utf8')
  .replace(/\r\n/g,'\n');
const marker='-- Real private Commerce executor, not Postgres owner and not the browser.';
if (!original.includes(marker)||!original.includes('begin;')){
  throw Error('Original first-positive DB fixture contract changed');
}
const fixture=original.slice(0,original.indexOf(marker))
  .replace(/^\\set[^\n]*\n/gm,'');
const settleSql='select public.internal_cmd_seyeon_g4_receipt_credit_settle_v1($1::uuid) as state';
const reserveSql='select outcome,reservation_id from public.internal_cmd_chat_credit_reserve_v1($1,$2,$3)';
const ids=n=>({
  subject:n+'110000-0000-4000-8000-000000000001',
  thread:n+'140000-0000-4000-8000-000000000001',
  client:n+'160000-0000-4000-8000-000000000001',
  attempt:n+'180000-0000-4000-8000-000000000001',
});
function assert(ok,message){if(!ok)throw Error('G5_FAIL: '+message);}
async function asCommerce(client){
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE myeongha_commerce_internal_executor');
}
async function prepare(which){
  let script=fixture;
  if(which==='cd'){
    script=script.replace(/cb(?=[0-9a-f]{6}-)/g,'cd')
      .replaceAll('g4-positive-settlement-fixture-v1','g4-positive-settlement-fixture-v2')
      .replaceAll('g4-positive-settlement-release','g4-positive-settlement-release-2')
      .replaceAll("repeat('a',64)","repeat('d',64)");
  }
  const fixtureConnection=await pool.connect();
  try { await fixtureConnection.query(script+'\nCOMMIT;'); }
  finally { fixtureConnection.release(); }
  const keys=ids(which);
  const connection=await pool.connect();
  try{
    await asCommerce(connection);
    await connection.query("select pg_catalog.set_config('myeongha.subject_id',$1,true)",
      [keys.subject]);
    const r=await connection.query(reserveSql,[keys.subject,keys.thread,keys.client]);
    assert(r.rows.length===1&&r.rows[0].outcome==='reserved',
      'original accepted Member did not reserve exact credit Turn');
    await connection.query('COMMIT');
  }catch(e){await connection.query('ROLLBACK');throw e;}
  finally{connection.release();}
  return keys;
}
async function assertBalance(keys,expectedState,expectedAvailable){
  const check=await pool.query(
    'select r.state, '+
    '(select coalesce(sum(a.credits),0)::int from public.chat_credit_turn_allocations_v1 a '+
    'where a.reservation_id=r.id) as allocations, '+
    '(select available_credits from public.internal_qry_chat_credit_balance_v1($1)) as available '+
    'from public.chat_credit_turn_reservations_v1 r '+
    'where r.subject_id=$1 and r.client_turn_id=$2',
    [keys.subject,keys.client]);
  assert(check.rows.length===1&&check.rows[0].state===expectedState&&
    Number(check.rows[0].allocations)===10 &&
    Number(check.rows[0].available)===expectedAvailable,
    'original reservation/balance not exactly one 10-credit allocation');
}
async function waitForLockedBackend(pid){
  for(let n=0;n<120;n++){
    const query=await pool.query(
      'select wait_event_type from pg_stat_activity '+
      'where pid=$1 and datname=current_database()',[pid]);
    if(query.rows[0]?.wait_event_type==='Lock')return;
    await new Promise(resolve=>setTimeout(resolve,15));
  }
  throw Error('G5_FAIL: second independent DB session was not blocked on original lock');
}
async function concurrentDuplicateACK(){
  const keys=await prepare('cb');
  const first=await pool.connect();
  const second=await pool.connect();
  let aOpen=false,bOpen=false;
  let pending;
  try{
    await asCommerce(first);aOpen=true;
    await asCommerce(second);bOpen=true;
    const {rows:[secondPid]}=await second.query('select pg_backend_pid() as pid');
    const resultA=await first.query(settleSql,[keys.attempt]);
    assert(resultA.rows[0]?.state==='settled','first exact original ACK did not settle');
    let settledB=false;
    pending=second.query(settleSql,[keys.attempt]).then(r=>{settledB=true;return r;});
    await waitForLockedBackend(secondPid.pid);
    assert(!settledB,'second ACK bypassed active first transaction lock');
    await first.query('COMMIT');aOpen=false;
    const resultB=await pending;
    assert(resultB.rows[0]?.state==='settled','same original ACK retry not idempotent');
    await second.query('COMMIT');bOpen=false;
    await assertBalance(keys,'settled',40);
    const changed=await pool.query(
      'select count(*)::int as cnt from public.chat_credit_turn_reservations_v1 '+
      'where subject_id=$1 and client_turn_id=$2',[keys.subject,keys.client]);
    assert(changed.rows[0]?.cnt===1,'concurrent ACK minted a duplicate reservation');
  }finally{
    if(aOpen)try{await first.query('ROLLBACK');}catch{}
    if(pending)try{await pending;}catch{}
    if(bOpen)try{await second.query('ROLLBACK');}catch{}
    first.release();second.release();
  }
}
async function crashBeforeCommit(){
  const keys=await prepare('cd');
  const first=await pool.connect();
  let open=false;
  try{
    await asCommerce(first);open=true;
    const provisional=await first.query(settleSql,[keys.attempt]);
    assert(provisional.rows[0]?.state==='settled',
      'provisional credit settle failed');
    // Simulate a connection dying after PostgreSQL sent a success row,
    // but before durable transaction COMMIT.
    await first.query('ROLLBACK');open=false;
  }finally{
    if(open)try{await first.query('ROLLBACK');}catch{}
    first.release();
  }
  await assertBalance(keys,'reserved',40);
  const retried=await pool.connect();
  try{
    await asCommerce(retried);
    const result=await retried.query(settleSql,[keys.attempt]);
    assert(result.rows[0]?.state==='settled','crashed transaction could not retry');
    await retried.query('COMMIT');
  }catch(e){await retried.query('ROLLBACK');throw e;}
  finally{retried.release();}
  await assertBalance(keys,'settled',40);
}
try{
  await concurrentDuplicateACK();
  await crashBeforeCommit();
  console.log('PASS G5 original positive 10-credit: 2-session lock, no double charge, rollback/retry (disposable)');
}finally{
  await pool.end();
}
