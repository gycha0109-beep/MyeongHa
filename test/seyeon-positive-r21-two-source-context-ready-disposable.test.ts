// Watchtower-Track: security
// R21: real PostgreSQL, exact named disposable clone, synthetic sources only.
import {afterAll, describe, expect, it} from 'vitest';
import {Pool, type PoolClient} from 'pg';

const enabled=process.env.CI==='true' &&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1' &&
  process.env.PGHOST==='localhost' &&
  process.env.PGUSER==='postgres' &&
  process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pool=enabled?new Pool({max:3,connectionTimeoutMillis:5000}):null;
const subject='d2000000-0000-4000-8000-000000000001';
const bundle='d3000000-0000-4000-8000-000000000001';
const release='d3100000-0000-4000-8000-000000000001';
const first={
  recordId:'d5000000-0000-4000-8000-000000000001',
  grantId:'d6000000-0000-4000-8000-000000000001',
};
const second={
  recordId:'d5000000-0000-4000-8000-000000000002',
  grantId:'d6000000-0000-4000-8000-000000000002',
};
function ids(n:number){
  const tail=String(n).padStart(12,'0');
  return {
    thread:'d4000000-0000-4000-8000-'+tail,
    participant:'d4100000-0000-4000-8000-'+tail,
    turn:'d7000000-0000-4000-8000-'+tail,
    attempt:'d7200000-0000-4000-8000-'+tail,
    user:'d7100000-0000-4000-8000-'+tail,
    selection:'sha256:v1:'+String(n).padStart(64,'0'),
  };
}
type Fixture=ReturnType<typeof ids>;
async function tx<T>(fn:(c:PoolClient)=>Promise<T>,executor=false):Promise<T>{
  if(!pool)throw Error('R21 requires only disposable CI PostgreSQL');
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    if(executor){
      await c.query('SET LOCAL ROLE myeongha_api_executor');
      await c.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
    }
    const result=await fn(c);
    await c.query('COMMIT');
    return result;
  }catch(e){
    await c.query('ROLLBACK').catch(()=>undefined);
    throw e;
  }finally{c.release();}
}
async function createTurn(n:number):Promise<Fixture>{
  const a=ids(n),key='r21-two-sources-'+n;
  await tx(async c=>{
    await c.query(
      "insert into public.conversation_threads(id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at) values ($1::uuid,$2::uuid,'single_character','active','r21-two-synthetic-sources',$3::uuid,$4::uuid,0,1,clock_timestamp(),clock_timestamp())",
      [a.thread,subject,release,bundle],
    );
    await c.query(
      "insert into public.conversation_thread_characters(id,thread_id,character_id,content_bundle_id,role,joined_at) values($1::uuid,$2::uuid,'seyeon',$3::uuid,'primary',clock_timestamp()-interval '1 minute')",
      [a.participant,a.thread,bundle],
    );
    await c.query(
      "select * from public.cmd_receive_chat_turn_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::jsonb,$13::text)",
      [subject,a.thread,key,'sha256:v1:synthetic-r21-'+n,'chat-request-v1',
        JSON.stringify({clientTurnId:key,text:'synthetic r21 only',
          clientCapability:'0.0.1-dev'}),
        release,bundle,a.turn,a.user,'synthetic r21 only',null,
        'sha256:v1:synthetic-r21-message-'+n],
    );
    await c.query(
      'select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
      [subject,a.turn,a.attempt,'seyeon-production-chat-planner-v1'],
    );
  });
  return a;
}
async function candidate(a:Fixture,sources:readonly {
  recordId:string;grantId:string
}[]){
  return tx(async c=>{
    const q=await c.query<{receipt:{
      originalSourceCount:number;contextReady:boolean;
      permitsProvider:boolean;permitsAtomicCommit:boolean;
      permitsHttpReveal:boolean;selectedSourcesDigest:string;
    }}>(
      'select seyeon_positive_candidate.pin_two_and_context_ready_r21($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text) as receipt',
      [subject,a.thread,a.turn,a.attempt,JSON.stringify(sources),a.selection],
    );
    return q.rows[0]?.receipt;
  },true);
}
async function state(a:Fixture){
  return tx(async c=>{
    const q=await c.query<{
      turnState:string;parents:string;edges:string;firstPins:string;
    }>(
      "select (select state from public.chat_turns where id=$1::uuid) as \"turnState\", "+
      "(select count(*)::text from seyeon_positive_candidate.source_sets_r1 where attempt_id=$2::uuid) as parents, "+
      "(select count(*)::text from seyeon_positive_candidate.source_edges_r1 where attempt_id=$2::uuid) as edges, "+
      "(select count(*)::text from seyeon_positive_candidate.attempt_source_pins where attempt_id=$2::uuid) as \"firstPins\"",
      [a.turn,a.attempt],
    );
    return q.rows[0];
  });
}
describe.skipIf(!enabled)('R21 exact TWO original Grants before REAL core ContextReady',()=>{
  afterAll(async()=>{await pool?.end();});
  it('atomically pins two locked originals, marks context ready, denies Provider/Commit/Reveal',async()=>{
    const a=await createTurn(751);
    const result=await candidate(a,[first,second]);
    expect(result).toMatchObject({
      selectedSourcesDigest:a.selection,
      originalSourceCount:2,contextReady:true,
      permitsProvider:false,permitsAtomicCommit:false,permitsHttpReveal:false,
    });
    expect(await state(a)).toMatchObject({
      turnState:'context_ready',parents:'1',edges:'2',firstPins:'1',
    });
    await expect(candidate(a,[first,second])).rejects.toThrow();
  });
  it('rejects a replaced second Grant and rolls back all parent/edge/context writes',async()=>{
    const a=await createTurn(752);
    await expect(candidate(a,[first,{
      ...second,grantId:'d6000000-0000-4000-8000-000000000099',
    }])).rejects.toThrow();
    expect(await state(a)).toMatchObject({
      turnState:'planned',parents:'0',edges:'0',firstPins:'0',
    });
  });
  it('rejects missing or duplicate sources before ContextReady',async()=>{
    const a=await createTurn(753);
    await expect(candidate(a,[first])).rejects.toThrow();
    await expect(candidate(a,[first,first])).rejects.toThrow();
    expect(await state(a)).toMatchObject({
      turnState:'planned',parents:'0',edges:'0',firstPins:'0',
    });
  });
});
