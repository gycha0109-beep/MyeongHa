// Watchtower-Track: security
// Runs only after the original S0 PostgreSQL 17 disposable fixture suite.
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const enabled=process.env.SEYEON_SECURITY_S0_REAL_PG==='1';
const uuid=(part:number,n:number)=>`a8${part}0000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const CHECK=`select ever_involved as "everInvolved"
  from public.qry_seyeon_thread_ever_involved_v1($1::uuid,$2::uuid)`;

describe.skipIf(!enabled)('G3 S0 history-presence authority in real PostgreSQL 17',()=>{
  let pool:Pool;
  beforeAll(async()=>{
    const db=process.env.PGDATABASE??'';
    if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
       process.env.DB_SUITE!=='postgres17'||process.env.PGHOST!=='localhost'||
       !/^myeongha_ci_case_[0-9]+$/u.test(db)||process.env.PGUSER!=='postgres'){
      throw Error('History-presence G3 tests require exact CI disposable PostgreSQL 17');
    }
    pool=new Pool({host:'localhost',port:Number(process.env.PGPORT??5432),
      database:db,user:'postgres',password:process.env.PGPASSWORD,
      ssl:false,max:3,statement_timeout:5000});
    const v=await pool.query<{version:number}>(
      "select current_setting('server_version_num')::int as version");
    const serverVersion=v.rows[0]?.version;
    if(typeof serverVersion!=='number'||serverVersion<170000||serverVersion>=180000)
      throw Error('History-presence G3 requires PostgreSQL 17');
  });
  afterAll(async()=>{await pool?.end();});

  function owned(n:number){
    return executePostgresSubjectTransactionV1({
      pool:pool as unknown as PostgresSubjectPoolV1,
      verifiedEvidence:{kind:'member' as const,verifiedAuthUserId:uuid(10,n)},
      execute:async({resolvedSubject,client})=>{
        expect(resolvedSubject.subjectId).toBe(uuid(11,n));
        return client.query<{everInvolved:boolean}>(CHECK,[resolvedSubject.subjectId,uuid(14,n)]);
      },
    });
  }

  it('reports former and current Se-yeon participants using only owner-bound metadata',async()=>{
    const initial=await owned(1);
    expect(initial.rows).toEqual([{everInvolved:true}]);
    // An old participant row no longer visible to active-binding must still
    // prevent every paginated transcript replay, including after leave.
    const change=await pool.query(`update public.conversation_thread_characters
      set left_at=clock_timestamp()
      where thread_id=$1 and character_id='seyeon' and left_at is null
      returning id`,[uuid(14,1)]);
    expect(change.rowCount).toBeGreaterThan(0);
    const afterLeave=await owned(1);
    expect(afterLeave.rows).toEqual([{everInvolved:true}]);
  });

  it('rejects another Member Thread even when the caller knows both UUIDs',async()=>{
    const attacker=uuid(10,1);
    await expect(executePostgresSubjectTransactionV1({
      pool:pool as unknown as PostgresSubjectPoolV1,
      verifiedEvidence:{kind:'member' as const,verifiedAuthUserId:attacker},
      execute:({resolvedSubject,client})=>client.query(CHECK,[
        resolvedSubject.subjectId,uuid(14,2),
      ]),
    })).rejects.toMatchObject({
      constraint:'seyeon_history_presence_thread_unavailable',
    });
    await expect(executePostgresSubjectTransactionV1({
      pool:pool as unknown as PostgresSubjectPoolV1,
      verifiedEvidence:{kind:'member' as const,verifiedAuthUserId:attacker},
      execute:({client})=>client.query(CHECK,[uuid(11,2),uuid(14,2)]),
    })).rejects.toThrow();
  });

  it('permits only API EXECUTE, never anon/Member/service-role or direct table mutations',async()=>{
    const {rows:[acl]}=await pool.query<{
      definer:boolean;api:boolean;anon:boolean;member:boolean;service:boolean;
      directSelect:boolean;directUpdate:boolean;
    }>(`select p.prosecdef as definer,
       has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE') as api,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as member,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service,
       has_table_privilege('myeongha_api_executor',
         'public.conversation_thread_characters','SELECT') as "directSelect",
       has_table_privilege('myeongha_api_executor',
         'public.conversation_thread_characters','UPDATE') as "directUpdate"
       from pg_proc p where p.oid=
         'public.qry_seyeon_thread_ever_involved_v1(uuid,uuid)'::regprocedure`);
    expect(acl).toEqual({
      definer:true,api:true,anon:false,member:false,service:false,
      directSelect:false,directUpdate:false,
    });
  });
});
