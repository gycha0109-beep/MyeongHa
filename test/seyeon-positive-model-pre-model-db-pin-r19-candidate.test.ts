// Watchtower-Track: security
import {describe,expect,it,afterAll} from 'vitest';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../packages/domain/src/index.js';
import {Pool} from 'pg';
import type {
  PostgresSubjectPoolV1,PostgresSubjectConnectionV1,PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type {SeyeonExactModelPersonalSourceSelectionV1} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import {
  persistSeyeonR19OfflinePositivePreModelPinV1,
  SeyeonR19OfflinePositivePinHoldV1,
} from '../apps/api/src/seyeon-positive-model-pre-model-db-pin-r19-candidate.js';

const AUTH='d1000000-0000-4000-8000-000000000001';
const SUBJECT='d2000000-0000-4000-8000-000000000001';
const THREAD='d4000000-0000-4000-8000-000000000019';
const PARTICIPANT='d4100000-0000-4000-8000-000000000019';
const TURN='d7000000-0000-4000-8000-000000000019';
const ATTEMPT='d7200000-0000-4000-8000-000000000019';
const MEMORY1='d5000000-0000-4000-8000-000000000001';
const MEMORY2='d5000000-0000-4000-8000-000000000002';
const GRANT1='d6000000-0000-4000-8000-000000000001';
const GRANT2='d6000000-0000-4000-8000-000000000002';
const SHA='sha256:v1:'+'a'.repeat(64);
const digest=(v:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');
const evidence={kind:'member' as const,verifiedAuthUserId:AUTH};
function selection():SeyeonExactModelPersonalSourceSelectionV1 {
  const selectedSources:SeyeonExactModelPersonalSourceSelectionV1['selectedSources']=[
    {recordKind:'memory',recordId:MEMORY1,grantId:GRANT1,
      recordType:'shared_detail',schemaVersion:'memory-v1',
      rawRecordDigest:SHA,projectedMemoryDigest:SHA},
    {recordKind:'memory',recordId:MEMORY2,grantId:GRANT2,
      recordType:'shared_detail',schemaVersion:'memory-v1',
      rawRecordDigest:SHA,projectedMemoryDigest:SHA},
  ];
  return {
    version:'seyeon-exact-model-personal-source-selection-v1',
    selectedMemoryCount:2,
    selectedPersonalRecordCount:2,
    selectedSources,
    selectedSourcesDigest:digest(selectedSources),
    selectedCurrentUserSource:null,
    selectedUnpinnedRecentSources:[],
    selectedUnpinnedDerivedSources:[],
    selectedModelSourceCensusDigest:digest({
      originalPersonalSources:selectedSources,currentUserSource:null,
      unpinnedRecentSources:[],unpinnedDerivedSources:[],
    }),
    persistedBeforeModel:false,permitsAtomicCommit:false,permitsHttpReveal:false,
  };
}
function candidate(pool:PostgresSubjectPoolV1,sel=selection()) {
  return persistSeyeonR19OfflinePositivePreModelPinV1({
    pool,verifiedEvidence:evidence,threadId:THREAD,turnId:TURN,
    attemptId:ATTEMPT,selection:sel,
  });
}
function fakeDb(input:{dbName?:string;pin?:boolean;commitFails?:boolean}={}) {
  const steps:string[]=[];
  let args:readonly unknown[]|undefined;
  const conn:PostgresSubjectConnectionV1={
    async query<Row>(sql:string,params?:readonly unknown[]):Promise<PostgresQueryResultV1<Row>>{
      if(sql==='COMMIT'&&input.commitFails){steps.push('ambiguous COMMIT');throw Error('reply lost');}
      steps.push(sql);
      if(sql.includes('begin_member_subject_context_v1'))return {rows:[{
        subjectId:SUBJECT,subjectKind:'member',
      }] as Row[]};
      if(sql.includes('current_database()'))return {rows:[{
        databaseName:input.dbName??'myeongha_seyeon_positive_pin_candidate_test',
      }] as Row[]};
      if(sql.includes('pin_source_set_r1')) {
        args=params;return {rows:[{pinned:input.pin??true}] as Row[]};
      }
      return {rows:[]};
    },
    release(){steps.push('released');},
  };
  return {pool:{connect:async()=>conn} satisfies PostgresSubjectPoolV1,
    steps,get args(){return args;}};
}

describe('R19 offline G1 positive original Grant pre-model pin boundary',()=>{
  it('only returns candidate receipt after PostgreSQL COMMIT, never Provider permission',async()=>{
    const db=fakeDb();
    const receipt=await candidate(db.pool);
    expect(db.args).toEqual([SUBJECT,THREAD,TURN,ATTEMPT,
      JSON.stringify([{recordId:MEMORY1,grantId:GRANT1},
        {recordId:MEMORY2,grantId:GRANT2}]),selection().selectedSourcesDigest]);
    expect(db.steps.indexOf('COMMIT')).toBeGreaterThan(db.steps.findIndex(x=>x.includes('pin_source_set_r1')));
    expect(receipt).toEqual({status:'disposable_source_set_committed',
      attemptId:ATTEMPT,selectedPersonalRecordCount:2,
      selectedSourcesDigest:selection().selectedSourcesDigest,permitsProvider:false,
      permitsAtomicCommit:false,permitsHttpReveal:false});
  });

  it('rejects unsupported, duplicate, untrusted and unbound selections before a DB call',async()=>{
    const db=fakeDb();
    const original=selection();
    const invalid:SeyeonExactModelPersonalSourceSelectionV1[]=[
      {...original,selectedPersonalRecordCount:0},
      {...original,selectedMemoryCount:3},
      {...original,selectedSourcesDigest:'forged'},
      {...original,selectedSourcesDigest:SHA}, // valid syntax, WRONG manifest digest
      {...original,selectedModelSourceCensusDigest:SHA}, // forged whole census
      {...original,selectedUnpinnedDerivedSources:[{
        kind:'relationship_event',memoryId:'relationship-event:old',
        sourceRef:'relationship-event:old',
        selectedModelMemoryDigest:SHA,originalGrantVerified:false,
      }]}, // unpinned derived source cannot enter original-only R19 DB Pin
      {...original,selectedSources:[
        {...original.selectedSources[0]!,rawRecordDigest:'sha256:v1:'+'f'.repeat(64)},
        original.selectedSources[1]!,
      ]}, // manifest changed but digest stayed the same
      {...original,selectedSources:[
        {...original.selectedSources[0]!,secretUnpinnedSource:'hidden'} as unknown as
          SeyeonExactModelPersonalSourceSelectionV1['selectedSources'][number],
        original.selectedSources[1]!,
      ],selectedSourcesDigest:digest([
        {...original.selectedSources[0]!,secretUnpinnedSource:'hidden'},
        original.selectedSources[1]!,
      ])}, // extra source metadata must not reach database silently
      {...original,selectedSources:[original.selectedSources[0]!,original.selectedSources[0]!]},
      {...original,selectedSources:[{...original.selectedSources[0]!,recordKind:'life_fact'},original.selectedSources[1]!] },
      {...original,selectedSources:[{...original.selectedSources[0]!,recordType:'unapproved'},original.selectedSources[1]!] },
      {...original,permitsHttpReveal:true as never},
    ];
    for(const s of invalid)await expect(candidate(db.pool,s))
      .rejects.toBeInstanceOf(SeyeonR19OfflinePositivePinHoldV1);
    expect(db.steps).toEqual([]);
  });

  it('stays fail-closed on wrong DB, mismatched Grant, resolver/COMMIT failures',async()=>{
    for(const opts of [{dbName:'production'},{pin:false},{commitFails:true}]) {
      const db=fakeDb(opts);
      await expect(candidate(db.pool)).rejects.toBeInstanceOf(SeyeonR19OfflinePositivePinHoldV1);
      expect(db.steps).toContain('ROLLBACK');
    }
    const db=fakeDb();
    await expect(persistSeyeonR19OfflinePositivePreModelPinV1({
      pool:db.pool,verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'test'},
      threadId:THREAD,turnId:TURN,attemptId:ATTEMPT,selection:selection(),
    })).rejects.toBeInstanceOf(SeyeonR19OfflinePositivePinHoldV1);
    expect(db.steps).toEqual([]);
  });
});

const real=process.env.CI==='true' &&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1' &&
  process.env.PGHOST==='localhost' &&
  process.env.PGUSER==='postgres' &&
  process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pg=real?new Pool({max:3,connectionTimeoutMillis:5000}):null;
afterAll(async()=>{await pg?.end();});
const realSuite=real?describe:describe.skip;
realSuite('R19 disposable PostgreSQL actual Owner SourceSet storage',()=>{
  const realPool:PostgresSubjectPoolV1={
    async connect(){
      if(!pg)throw Error('not disposable PG');
      const client=await pg.connect();
      return {
        async query<Row>(sql:string,values?:readonly unknown[]){
          const response=await client.query(sql,values===undefined?[]:[...values]);
          return {rows:response.rows as Row[]};
        },
        release(error?:unknown){client.release(error instanceof Error?error:undefined);},
      };
    },
  };

  it('stores exact two original Grants against a new running Attempt before any Provider and rejects changed set',async()=>{
    if(!pg)throw Error('missing disposable PG');
    // The R1 fixture's original thread already has an in-flight Attempt.
    // New synthetic Turn must use its own Thread, not bypass the DB guard.
    await pg.query(`
insert into public.conversation_threads(
 id,subject_id,thread_type,status,title,active_content_release_id,
 active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at
) values (
 $1::uuid,$2::uuid,'single_character','active','r19-disposable',
 $3::uuid,$4::uuid,0,1,clock_timestamp(),clock_timestamp()
)
`,[THREAD,SUBJECT,'d3100000-0000-4000-8000-000000000001',
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
  'synthetic pre-model pin',null,'sha256:v1:synthetic-r19-user'
)`,[SUBJECT,THREAD,'r19-isolated-positive-pin','sha256:v1:synthetic-r19-request',
      JSON.stringify({clientTurnId:'r19-isolated-positive-pin',text:'synthetic pre-model pin',
        clientCapability:'0.0.1-dev'}),
      'd3100000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      TURN,'d7100000-0000-4000-8000-000000000019']);
    await pg.query(
      'select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
      [SUBJECT,TURN,ATTEMPT,'seyeon-production-chat-planner-v1']);
    const before=await pg.query(
      'select count(*)::int as count from seyeon_positive_candidate.source_sets_r1 where attempt_id=$1',[ATTEMPT]);
    expect(before.rows[0]?.count).toBe(0);
    const receipt=await candidate(realPool);
    expect(receipt.status).toBe('disposable_source_set_committed');
    expect(receipt.permitsProvider).toBe(false);
    const persisted=await pg.query(`
select s.source_count,s.selected_sources_digest,count(e.*)::int as edges
from seyeon_positive_candidate.source_sets_r1 s
join seyeon_positive_candidate.source_edges_r1 e on e.attempt_id=s.attempt_id
where s.attempt_id=$1 group by s.source_count,s.selected_sources_digest
`,[ATTEMPT]);
    expect(persisted.rows).toEqual([{source_count:2,
      selected_sources_digest:selection().selectedSourcesDigest,edges:2}]);
    await expect(candidate(realPool,{
      ...selection(),selectedSourcesDigest:'sha256:v1:'+'b'.repeat(64),
    })).rejects.toBeInstanceOf(SeyeonR19OfflinePositivePinHoldV1);
    await expect(candidate(realPool,{
      ...selection(),selectedSources:[
        {...selection().selectedSources[0]!,grantId:GRANT2},
        selection().selectedSources[1]!,
      ],
    })).rejects.toBeInstanceOf(SeyeonR19OfflinePositivePinHoldV1);
    expect((await pg.query(
      'select count(*)::int as count from seyeon_positive_candidate.source_edges_r1 where attempt_id=$1',[ATTEMPT]))
      .rows[0]?.count).toBe(2);
  });
});
