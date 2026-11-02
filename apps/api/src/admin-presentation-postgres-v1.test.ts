import{describe,it,expect}from'vitest';
import{createAdminPresentationPostgresV1}from'./admin-presentation-postgres-v1.js';
import type{PostgresSubjectPoolV1}from'./postgres-subject-execution.js';
const ID='123e4567-e89b-42d3-a456-426614174000';
function harness(role='myeongha_admin_command_executor'){
 const queries:{sql:string;args?:readonly unknown[]}[]=[];
 const pool:PostgresSubjectPoolV1={async connect(){return{async query<Row>(sql:string,args?:readonly unknown[]){queries.push(args?{sql,args}:{sql});if(sql.startsWith('SELECT current_user'))return{rows:[{currentUser:role}]as unknown as Row[]};return{rows:[]as Row[]};},release(){}};}};
 return{recorded:queries,...createAdminPresentationPostgresV1({pool})};
}
describe('presentation-only RPC adapter',()=>{
 it('uses dedicated principal and bounded RPC reads rather than table mutation',async()=>{
  const h=harness();expect(await h.queries.list(ID)).toEqual([]);
  expect(h.recorded[2]?.sql).toBe('SELECT entry FROM myeongha_admin_ops.qry_presentation_entries_v1($1::uuid,$2::integer)');
  expect(h.recorded[2]?.args).toEqual([ID,20]);
  expect(h.recorded.at(-1)?.sql).toBe('COMMIT');
 });
 it('rejects ordinary API roles before calling any presentation domain function',async()=>{
  const h=harness('myeongha_api_executor');await expect(h.queries.list()).rejects.toThrow('Dedicated');
  expect(h.recorded).toHaveLength(3);expect(h.recorded[2]?.sql).toBe('ROLLBACK');
 });
});
