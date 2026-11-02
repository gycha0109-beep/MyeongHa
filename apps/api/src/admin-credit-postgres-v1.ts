import { ADMIN_COMMAND_PRINCIPAL_SQL_V1 } from './admin-presentation-postgres-v1.js';
import { parseAdminCommandInputV1,requireAdminCommandStateV1 } from './admin-command-contract-v1.js';
import type { AdminCommandBindingV1,AdminCommandResultV1,AdminCommandStateV1 } from './admin-command-contract-v1.js';
import type { PostgresSubjectConnectionV1,PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
async function transaction<T>(pool:PostgresSubjectPoolV1,readOnly:boolean,work:(c:PostgresSubjectConnectionV1)=>Promise<T>):Promise<T>{
 const c=await pool.connect();let active=false;let discard:unknown;
 try{
  await c.query(readOnly?'BEGIN READ ONLY':'BEGIN');active=true;
  const role=await c.query<{currentUser:unknown}>(ADMIN_COMMAND_PRINCIPAL_SQL_V1);
  if(role.rows.length!==1||role.rows[0]?.currentUser!=='myeongha_admin_command_executor')throw Error('Dedicated credit command principal required.');
  const result=await work(c);await c.query('COMMIT');active=false;return result;
 }catch(error){if(active)try{await c.query('ROLLBACK');}catch(failure){discard=failure;}throw error;}
 finally{c.release(discard);}
}
function receipt(raw:unknown,operationId:string):AdminCommandResultV1{
 if(raw===null||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid credit adjustment receipt.');
 const row=raw as Record<string,unknown>;
 if(row.operationId!==operationId||typeof row.targetRef!=='string'||!UUID.test(row.targetRef)||!['succeeded','replayed'].includes(String(row.status)))throw Error('Invalid credit adjustment receipt.');
 return {operationId,targetRef:row.targetRef,status:row.status as 'succeeded'|'replayed',state:requireAdminCommandStateV1(row.state)};
}
/** A fixed domain RPC owns ledger invariants, Subject locking, durable replay,
 * per-Lot deltas, reason and atomic audit. No direct table writes are exposed. */
export function createAdminCreditPostgresV1({pool}:{readonly pool:PostgresSubjectPoolV1}):{
 readonly binding:AdminCommandBindingV1;
 readonly history:(subjectId:string)=>Promise<readonly AdminCommandStateV1[]>;
}{
 return {binding:{operation:'credit-adjust',authority:'admin-credit-adjustment-v1:confirmed-integer-ledger-atomic-audit',
  async preview(context){
   const input=parseAdminCommandInputV1(context.input);if(input.operation!=='credit-adjust')throw Error('Credit command required.');
   if(Number(input.parameters.delta)>0&&typeof input.parameters.expiresAt==='string'&&Date.parse(input.parameters.expiresAt)<=Date.now())throw Error('Grant expiry must be in the future.');
   return transaction(pool,true,async c=>{
    const result=await c.query<{state:unknown;version:unknown}>('SELECT state,version FROM myeongha_admin_ops.qry_credit_adjustment_preview_v1($1::uuid)',[input.targetRef]);
    const row=result.rows[0];if(result.rows.length!==1||typeof row?.version!=='string'||!/^[a-f0-9]{32}$/u.test(row.version))throw Error('Credit preview unavailable.');
    return {before:requireAdminCommandStateV1(row.state),expectedVersion:row.version};
   });
  },
  async execute(context,expectedVersion){
   const input=parseAdminCommandInputV1(context.input);
   if(input.operation!=='credit-adjust'||!/^[a-f0-9]{32}$/u.test(expectedVersion))throw Error('Confirmed credit adjustment required.');
   return transaction(pool,false,async c=>{
    const result=await c.query<{result:unknown}>('SELECT myeongha_admin_ops.cmd_adjust_credit_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::text,$7::integer,$8::timestamptz,$9::text) AS result',[
     context.actorAuthUserId,input.operationId,context.requestId,context.payloadHash,input.targetRef,expectedVersion,input.parameters.delta,input.parameters.expiresAt,input.reason]);
    if(result.rows.length!==1)throw Error('Credit command receipt not persisted.');return receipt(result.rows[0]?.result,input.operationId);
   });
  },
  async findResult(actorAuthUserId,operationId){
   if(!UUID.test(actorAuthUserId)||!UUID.test(operationId))throw Error('Invalid credit receipt identity.');
   return transaction(pool,true,async c=>{
    const result=await c.query<{result:unknown}>('SELECT result FROM myeongha_admin_ops.qry_credit_adjustment_receipt_v1($1::uuid,$2::uuid)',[actorAuthUserId,operationId]);
    if(result.rows.length===0)return null;if(result.rows.length!==1)throw Error('Ambiguous credit receipt.');return receipt(result.rows[0]?.result,operationId);
   });
  }},
  async history(subjectId){
   if(!UUID.test(subjectId))throw Error('Invalid credit history Subject.');
   return transaction(pool,true,async c=>{
    const result=await c.query<{entry:unknown}>('SELECT entry FROM myeongha_admin_ops.qry_credit_adjustment_history_v1($1::uuid)',[subjectId]);
    if(result.rows.length>50)throw Error('Unbounded credit history.');return result.rows.map(row=>requireAdminCommandStateV1(row.entry));
   });
  },
 };
}
