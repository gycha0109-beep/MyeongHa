import type { PostgresSubjectPoolV1,PostgresSubjectConnectionV1 } from './postgres-subject-execution.js';
import { requireAdminCommandStateV1 } from './admin-command-contract-v1.js';
import type { AdminCommandBindingV1,AdminCommandContextV1,AdminCommandResultV1,AdminPresentationQueriesV1 } from './admin-command-contract-v1.js';

export const ADMIN_COMMAND_PRINCIPAL_SQL_V1 = 'SELECT current_user::text AS "currentUser" FROM pg_catalog.pg_roles r WHERE r.rolname=current_user AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolinherit AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
async function transaction<T>(pool: PostgresSubjectPoolV1,readOnly: boolean,work:(connection:PostgresSubjectConnectionV1)=>Promise<T>):Promise<T> {
 const connection=await pool.connect(); let started=false; let discard:unknown;
 try {
  await connection.query(readOnly ? 'BEGIN READ ONLY':'BEGIN'); started=true;
  const principal=await connection.query<{currentUser:unknown}>(ADMIN_COMMAND_PRINCIPAL_SQL_V1);
  if(principal.rows.length!==1 || principal.rows[0]?.currentUser!=='myeongha_admin_command_executor') throw new Error('Dedicated admin command principal unavailable.');
  const result=await work(connection);await connection.query('COMMIT');started=false;return result;
 }catch(error){if(started)try{await connection.query('ROLLBACK');}catch(rollback){discard=rollback;throw new AggregateError([error,rollback],'Admin command rollback failed.');}throw error;}
 finally{connection.release(discard);}
}
function result(value:unknown):AdminCommandResultV1 {
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid stored command result.');
 const row=value as Record<string,unknown>;
 if(typeof row.operationId!=='string'||!UUID.test(row.operationId)||typeof row.targetRef!=='string'||!UUID.test(row.targetRef)||!['succeeded','replayed','pending','partial','failed'].includes(String(row.status)))throw new Error('Invalid stored command receipt.');
 return {operationId:row.operationId,targetRef:row.targetRef,status:row.status as AdminCommandResultV1['status'],state:requireAdminCommandStateV1(row.state)};
}
export function createAdminPresentationPostgresV1(input:{readonly pool:PostgresSubjectPoolV1}):{binding:AdminCommandBindingV1;queries:AdminPresentationQueriesV1} {
 const queries:AdminPresentationQueriesV1={
  async list(entryId){if(entryId!==undefined&&!UUID.test(entryId))throw new Error('Invalid presentation UUID.');return transaction(input.pool,true,async connection=>{
   const rows=await connection.query<{entry:unknown}>('SELECT entry FROM myeongha_admin_ops.qry_presentation_entries_v1($1::uuid,$2::integer)',[entryId??null,20]);return rows.rows.map(row=>requireAdminCommandStateV1(row.entry));
  });},
  async history(entryId){if(!UUID.test(entryId))throw new Error('Invalid presentation UUID.');return transaction(input.pool,true,async connection=>{
   const rows=await connection.query<{entry:unknown}>('SELECT entry FROM myeongha_admin_ops.qry_presentation_history_v1($1::uuid)',[entryId]);return rows.rows.map(row=>requireAdminCommandStateV1(row.entry));
  });},
 };
 return {queries,binding:{operation:'presentation-save',authority:'admin-presentation-v1:atomic-domain-command-receipt-history-audit',
  async preview(context){const current=await queries.list(context.input.targetRef);const before=current[0]??{entryId:context.input.targetRef,revision:0};
   if(before.revision!==context.input.parameters.expectedRevision)throw new Error('Presentation version changed. Re-read before confirming.');
   return {before,expectedVersion:String(before.revision)};},
  async execute(context:AdminCommandContextV1,expectedVersion){
   if(context.input.operation!=='presentation-save'||expectedVersion!==String(context.input.parameters.expectedRevision))throw new Error('Invalid presentation confirmation.');
   const p=context.input.parameters;
   return transaction(input.pool,false,async connection=>{
    const rows=await connection.query<{result:unknown}>('SELECT myeongha_admin_ops.cmd_save_presentation_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::integer,$7::text,$8::text,$9::text,$10::text,$11::text,$12::timestamptz,$13::timestamptz,$14::text) AS result',[
     context.actorAuthUserId,context.input.operationId,context.requestId,context.payloadHash,context.input.targetRef,p.expectedRevision,p.kind,p.title,p.body,p.linkPath,p.status,p.startsAt,p.endsAt,context.input.reason]);
    if(rows.rows.length!==1)throw new Error('Presentation result not persisted.');return result(rows.rows[0]?.result);
   });
  },
  async findResult(actorAuthUserId,operationId){if(!UUID.test(actorAuthUserId)||!UUID.test(operationId))throw new Error('Invalid operation reference.');return transaction(input.pool,true,async connection=>{
   const rows=await connection.query<{result:unknown}>('SELECT result FROM myeongha_admin_ops.qry_admin_command_receipt_v1($1::uuid,$2::uuid)',[actorAuthUserId,operationId]);if(rows.rows.length===0)return null;if(rows.rows.length!==1)throw new Error('Invalid operation receipt.');return result(rows.rows[0]?.result);
  });},
 }};
}
