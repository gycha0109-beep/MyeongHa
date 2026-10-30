import {describe,it,expect} from 'vitest';
import {parseAdminCommandInputV1} from './admin-command-contract-v1.js';
import {createAdminCreditPostgresV1} from './admin-credit-postgres-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
const ID='123e4567-e89b-42d3-a456-426614174000';
const input=(parameters:Record<string,unknown>)=>({operation:'credit-adjust',operationId:ID,targetRef:ID,reason:'synthetic test',parameters});
describe('confirmed credit adjustment domain adapter',()=>{
 it('has no arbitrary quantity cap and preserves the existing integer storage boundary',()=>{
  expect(parseAdminCommandInputV1(input({delta:1000001,expiresAt:null})).parameters.delta).toBe(1000001);
  expect(parseAdminCommandInputV1(input({delta:2147483647,expiresAt:null})).parameters.delta).toBe(2147483647);
  expect(parseAdminCommandInputV1(input({delta:-2147483648})).parameters.expiresAt).toBeNull();
  for(const parameters of [{delta:0},{delta:1.5,expiresAt:null},{delta:2147483648,expiresAt:null},{delta:1},{delta:-1,expiresAt:'2027-01-01T00:00:00Z'},{delta:1,expiresAt:'bad'},{delta:1,expiresAt:null,table:'subjects'}])expect(()=>parseAdminCommandInputV1(input(parameters))).toThrow();
 });
 it('requires the dedicated command principal before calling any credit RPC',async()=>{
  const queries:string[]=[];
  const pool:PostgresSubjectPoolV1={async connect(){return {async query<Row>(sql:string){queries.push(sql);return {rows:(sql.startsWith('SELECT current_user')?[{currentUser:'myeongha_admin_reader'}]:[]) as unknown as Row[]};},release(){}};}};
  const service=createAdminCreditPostgresV1({pool});
  await expect(service.history(ID)).rejects.toThrow('Dedicated credit');expect(queries).toHaveLength(3);expect(queries.at(-1)).toBe('ROLLBACK');
 });
 it('binds preview, confirmed execute and receipt lookup to fixed parameterized RPCs',async()=>{
  const queries:{sql:string;args?:readonly unknown[]}[]=[];
  const result={operationId:ID,targetRef:ID,status:'succeeded',state:{delta:1000001,afterAvailableCredits:'1000001'}};
  const pool:PostgresSubjectPoolV1={async connect(){return {async query<Row>(sql:string,args?:readonly unknown[]){queries.push(args?{sql,args}:{sql});
   const rows=sql.startsWith('SELECT current_user')?[{currentUser:'myeongha_admin_command_executor'}]:sql.includes('qry_credit_adjustment_preview')?[{state:{availableCredits:'0'},version:'a'.repeat(32)}]:sql.includes('cmd_adjust_credit')||sql.includes('qry_credit_adjustment_receipt')?[{result}]:[];
   return {rows:rows as unknown as Row[]};},release(){}};}};
  const service=createAdminCreditPostgresV1({pool});
  const context={actorAuthUserId:ID,requestId:ID,payloadHash:'a'.repeat(64),input:parseAdminCommandInputV1(input({delta:1000001,expiresAt:null}))};
  const preview=await service.binding.preview(context);expect(preview.expectedVersion).toBe('a'.repeat(32));
  expect(await service.binding.execute(context,preview.expectedVersion)).toEqual(result);
  expect(await service.binding.findResult(ID,ID)).toEqual(result);
  const execute=queries.find(q=>q.sql.includes('cmd_adjust_credit'));expect(execute?.args).toEqual([ID,ID,ID,'a'.repeat(64),ID,'a'.repeat(32),1000001,null,'synthetic test']);
  expect(queries.some(q=>/^(?:UPDATE|INSERT|DELETE)/u.test(q.sql))).toBe(false);
 });
});
