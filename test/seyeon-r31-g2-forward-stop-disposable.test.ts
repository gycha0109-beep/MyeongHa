// Watchtower-Track: security
// R31: final scratch G2 permission barrier AFTER compatibility rehearsals.
// No real model, HTTP, billing or production role is contacted.
import {afterAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';

const enabled=process.env.CI==='true'
  &&process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1'
  &&process.env.PGHOST==='localhost'
  &&process.env.PGUSER==='postgres'
  &&process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pool=enabled?new Pool({max:2,connectionTimeoutMillis:5000}):null;
const owner='d2000000-0000-4000-8000-000000000001';
const rpc='seyeon_positive_candidate.commit_actual_v2_r3';
describe.skipIf(!enabled)('R31 positive G2 API permission is actually revoked',()=>{
  afterAll(async()=>{await pool?.end();});
  it('disallows the real positive wrapper and direct v1/v2 without deleting legacy zero-pin ownership',async()=>{
    if(!pool)throw Error('R31 disposable PG only');
    const roles=['myeongha_api_executor','authenticated','service_role'];
    const rows=await pool.query<{
      executor_can_positive:boolean;executor_can_v2:boolean;
      executor_can_v1:boolean;public_can_positive:boolean;
    }>(
      "select has_function_privilege('myeongha_api_executor',$1,'EXECUTE') as executor_can_positive,"+
      "has_function_privilege('myeongha_api_executor','public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE') as executor_can_v2,"+
      "has_function_privilege('myeongha_api_executor','public.cmd_commit_seyeon_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE') as executor_can_v1,"+
      "has_function_privilege('public',$1,'EXECUTE') as public_can_positive",
      [rpc+'(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text)'],
    );
    expect(rows.rows).toMatchObject([{
      executor_can_positive:false,executor_can_v1:false,
      executor_can_v2:false,public_can_positive:false,
    }]);
    for(const role of roles){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE '+role);
        await client.query(
          "select set_config('myeongha.subject_id',$1,true)",[owner],
        );
        await expect(client.query(
          'select seyeon_positive_candidate.commit_actual_v2_r3($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text)',
          [owner,null,null,null,null,null,null,null,null,null],
        )).rejects.toMatchObject({code:'42501'});
      }finally{
        await client.query('ROLLBACK').catch(()=>undefined);
        client.release();
      }
    }
    // The Owner function still exists for audit; no new approved positive
    // Commit path was created or made callable by API.
    const surviving=await pool.query<{count:string}>(
      "select count(*)::text as count from pg_proc where oid=to_regprocedure('seyeon_positive_candidate.commit_actual_v2_r3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text)')",
    );
    expect(surviving.rows[0]?.count).toBe('1');
  });
});
