// Watchtower-Track: security
// R20 named disposable only; no positive Provider dispatch or live route.
import {createHash} from 'node:crypto';
import {afterAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {canonicalJson} from '../packages/domain/src/index.js';
import type {SeyeonRetrievedMemoryV2} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import type {SeyeonPersonalRecordProjectionCandidateV1} from '../apps/api/src/seyeon-production-context-v1.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
  type SeyeonExactModelPersonalSourceSelectionV1,
} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import type {
  PostgresSubjectPoolV1,PostgresSubjectConnectionV1,PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  persistSeyeonR20OfflineDigestBoundPinV1,
  SeyeonR20OfflineDigestHoldV1,
} from '../apps/api/src/seyeon-positive-raw-projection-digest-bind-r20-candidate.js';

const hash=(v:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');
const AUTH='d1000000-0000-4000-8000-000000000001';
const SUBJECT='d2000000-0000-4000-8000-000000000001';
const THREAD='d4000000-0000-4000-8000-000000000020';
const PARTICIPANT='d4100000-0000-4000-8000-000000000020';
const TURN='d7000000-0000-4000-8000-000000000020';
const ATTEMPT='d7200000-0000-4000-8000-000000000020';
const IDS=[
  ['d5000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    {v:'synthetic-consented-memory'}],
  ['d5000000-0000-4000-8000-000000000002',
    'd6000000-0000-4000-8000-000000000002',
    {v:'synthetic-other-memory'}],
] as const;
const evidence={kind:'member' as const,verifiedAuthUserId:AUTH};

function inputs(rawOverride?:string,projectionOverride?:string){
  const retrievedMemories:SeyeonRetrievedMemoryV2[]=IDS.map(([id,grant],i)=>({
    kind:'memory',memoryId:'memory:'+id,claimKind:'fact',
    summary:i===0?'synthetic A':'synthetic B',
    sourceRef:'memory:'+id+':grant:'+grant,
    relevance:i===0?.9:.8,salience:.8,
  }));
  const sourceCandidates:SeyeonPersonalRecordProjectionCandidateV1[]=
    IDS.map(([recordId,grantId,payload],i)=>({
      recordKind:'memory',recordId,grantId,recordType:'shared_detail',
      schemaVersion:'memory-v1',projectedMemoryId:'memory:'+recordId,
      rawRecordDigest:i===0&&rawOverride?rawOverride:hash({
        kind:'memory',recordId,grantId,recordType:'shared_detail',
        schemaVersion:'memory-v1',payload,
      }),
      projectedMemoryDigest:i===0&&projectionOverride?
        projectionOverride:hash(retrievedMemories[i]),
      permitsAtomicCommit:false,permitsHttpReveal:false,
    }));
  const selection=selectSeyeonExactModelPersonalSourcesV1({
    retrievedMemories,sourceCandidates,
  });
  return {retrievedMemories,sourceCandidates,selection};
}
function call(pool:PostgresSubjectPoolV1,other:ReturnType<typeof inputs>){
  return persistSeyeonR20OfflineDigestBoundPinV1({
    pool,verifiedEvidence:evidence,threadId:THREAD,turnId:TURN,
    attemptId:ATTEMPT,...other,
  });
}
function mock(options:{
  db?:string;pin?:boolean;noInspect?:boolean;payloadTamper?:boolean;
  commitFail?:boolean;grantTamper?:boolean;
}={}){
  const executed:string[]=[];
  const saved=inputs();
  const sources=IDS.map(([recordId,grantId,payload],ordinal)=>({
    ordinal,recordKind:'memory',recordId,
    grantId:options.grantTamper?'d6000000-0000-4000-8000-000000000099':grantId,
    recordType:'shared_detail',schemaVersion:'memory-v1',
    payload:options.payloadTamper?{tampered:true}:payload,
    pgPayloadDigest:'sha256:pg-jsonb:v1:'+'f'.repeat(64),
  }));
  const connection:PostgresSubjectConnectionV1={
    async query<Row>(sql:string):Promise<PostgresQueryResultV1<Row>>{
      executed.push(sql);
      if(sql==='COMMIT'&&options.commitFail)throw Error('COMMIT reply lost');
      if(sql.includes('begin_member_subject_context_v1'))return {rows:[{
        subjectId:SUBJECT,subjectKind:'member',
      }] as Row[]};
      if(sql.includes('current_database()'))return {rows:[{
        dbName:options.db??'myeongha_seyeon_positive_pin_candidate_test',
      }] as Row[]};
      if(sql.includes('pin_source_set_r1'))return {rows:[{
        pinned:options.pin??true,
      }] as Row[]};
      if(sql.includes('inspect_pinned_raw_source_r20'))return {rows:[{
        original:options.noInspect?null:{
          sourceCount:2,selectedSourcesDigest:saved.selection.selectedSourcesDigest,
          sources,
        },
      }] as Row[]};
      return {rows:[]};
    },
    release(){executed.push('release');},
  };
  return {pool:{connect:async()=>connection} satisfies PostgresSubjectPoolV1,executed};
}
describe('R20 original JSONB ↔ final projection digest correspondence, no Provider',()=>{
  it('computes server model memory hashes, reads DB-original payload and returns after COMMIT',async()=>{
    const db=mock();
    const proof=await call(db.pool,inputs());
    const inspectAt=db.executed.findIndex(x=>x.includes('inspect_pinned_raw_source_r20'));
    expect(inspectAt).toBeGreaterThan(db.executed.findIndex(x=>x.includes('pin_source_set_r1')));
    expect(db.executed.indexOf('COMMIT')).toBeGreaterThan(inspectAt);
    expect(proof).toMatchObject({
      status:'disposable_original_and_projection_digests_committed',
      selectedPersonalRecordCount:2,
      permitsProvider:false,permitsAtomicCommit:false,permitsHttpReveal:false,
    });
  });
  it('rejects forged raw, projected or selected digest and never permits Provider',async()=>{
    const db=mock();
    await expect(call(db.pool,inputs('sha256:v1:'+'0'.repeat(64))))
      .rejects.toBeInstanceOf(SeyeonR20OfflineDigestHoldV1);
    await expect(call(db.pool,inputs(undefined,'sha256:v1:'+'0'.repeat(64))))
      .rejects.toBeInstanceOf(SeyeonR20OfflineDigestHoldV1);
    const a=inputs();
    const forged={...a,selection:{
      ...a.selection,selectedSourcesDigest:'sha256:v1:'+'0'.repeat(64),
    }} as typeof a;
    await expect(call(db.pool,forged)).rejects.toBeInstanceOf(
      SeyeonR20OfflineDigestHoldV1);
    expect(db.executed).not.toContain('COMMIT');
  });
  it('denies missing original Owner readback, mutated payload, replaced Grant, wrong DB and unknown COMMIT',async()=>{
    for(const opts of [{noInspect:true},{payloadTamper:true},
      {grantTamper:true},{pin:false},{db:'production'},{commitFail:true}]){
      const db=mock(opts);
      await expect(call(db.pool,inputs())).rejects.toBeInstanceOf(
        SeyeonR20OfflineDigestHoldV1);
      expect(db.executed).toContain('ROLLBACK');
    }
  });
});
const real=process.env.CI==='true'&&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1'&&
  process.env.PGHOST==='localhost'&&
  process.env.PGUSER==='postgres'&&
  process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pg=real?new Pool({max:3,connectionTimeoutMillis:5000}):null;
afterAll(async()=>{await pg?.end();});
(real?describe:describe.skip)('R20 actual restricted-role PostgreSQL same-TX original source binding',()=>{
  const pool:PostgresSubjectPoolV1={
    async connect(){
      if(!pg)throw Error('disposable PG missing');
      const client=await pg.connect();
      return {
        async query<Row>(sql:string,params?:readonly unknown[]){
          const result=await client.query(sql,params===undefined?[]:[...params]);
          return {rows:result.rows as Row[]};
        },
        release(error?:unknown){client.release(error instanceof Error?error:undefined);},
      };
    },
  };
  it('rolls back unbound digest then commits exact raw original + projection',async()=>{
    if(!pg)throw Error('disposable PG only');
    await pg.query(`
insert into public.conversation_threads(
 id,subject_id,thread_type,status,title,active_content_release_id,
 active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at
) values (
 $1::uuid,$2::uuid,'single_character','active','r20-offline-only',
 $3::uuid,$4::uuid,0,1,clock_timestamp(),clock_timestamp()
)`,[THREAD,SUBJECT,'d3100000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001']);
    await pg.query(`
insert into public.conversation_thread_characters(
 id,thread_id,character_id,content_bundle_id,role,joined_at
) values ($1::uuid,$2::uuid,'seyeon',$3::uuid,'primary',clock_timestamp())
`,[PARTICIPANT,THREAD,'d3000000-0000-4000-8000-000000000001']);
    await pg.query(`
select * from public.cmd_receive_chat_turn_v1(
 $1::uuid,$2::uuid,$3::text,$4::text,'chat-request-v1',
 $5::jsonb,$6::uuid,$7::uuid,$8::uuid,$9::uuid,
 'synthetic r20 only',null,'sha256:v1:synthetic-r20-user'
)`,[SUBJECT,THREAD,'r20-digest-bound','sha256:v1:r20-synthetic',
      JSON.stringify({clientTurnId:'r20-digest-bound',text:'synthetic r20 only',
        clientCapability:'0.0.1-dev'}),
      'd3100000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      TURN,'d7100000-0000-4000-8000-000000000020']);
    await pg.query(
      'select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
      [SUBJECT,TURN,ATTEMPT,'seyeon-production-chat-planner-v1']);

    await expect(call(pool,inputs('sha256:v1:'+'0'.repeat(64))))
      .rejects.toBeInstanceOf(SeyeonR20OfflineDigestHoldV1);
    const before=await pg.query(
      'select count(*)::int as count from seyeon_positive_candidate.source_sets_r1 where attempt_id=$1',
      [ATTEMPT]);
    expect(before.rows[0]?.count).toBe(0); // DB Pin rolled back on Node mismatch.

    const result=await call(pool,inputs());
    expect(result.permitsProvider).toBe(false);
    const stored=await pg.query(`
select s.source_count,count(e.*)::int as edges
from seyeon_positive_candidate.source_sets_r1 s
join seyeon_positive_candidate.source_edges_r1 e
 on e.attempt_id=s.attempt_id
where s.attempt_id=$1 group by s.source_count
`,[ATTEMPT]);
    expect(stored.rows).toEqual([{source_count:2,edges:2}]);
    const dbDigest=await pg.query<{pgDigest:string,originalId:string}>(`
select e.pg_payload_digest as "pgDigest",e.original_grant_id::text as "originalId"
from seyeon_positive_candidate.source_edges_r1 e
where e.attempt_id=$1 order by e.ordinal
`,[ATTEMPT]);
    expect(dbDigest.rows).toHaveLength(2);
    expect(dbDigest.rows[0]?.pgDigest).toMatch(/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u);
    expect(dbDigest.rows[0]?.originalId).toBe(IDS[0][1]);
  });
});
