import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const PRINCIPAL=`SELECT current_user::text AS role FROM pg_catalog.pg_roles r WHERE r.rolname=current_user AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolinherit AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)`;
/** Dedicated maintenance entry. Never accepts SQL, dates or audit event IDs.
 * DB owns the current clock, 365-day minimum, legal holds and atomic audit. */
export function createAdminAuditRetentionMaintenanceV1(pool:PostgresSubjectPoolV1){
 return async(limit=1000):Promise<{readonly deleted:number}>=>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('Invalid audit retention batch.');
  const connection=await pool.connect();let active=false;let discard:unknown;
  try{
   await connection.query('BEGIN');active=true;
   const principal=await connection.query<{role:string}>(PRINCIPAL);
   if(principal.rows.length!==1||principal.rows[0]?.role!=='myeongha_admin_retention_executor')throw Error('Dedicated audit retention role required.');
   const result=await connection.query<{deleted:number}>('SELECT deleted FROM myeongha_admin_ops.cmd_purge_expired_admin_audit_v1($1::integer)',[limit]);
   const deleted=result.rows[0]?.deleted;
   if(result.rows.length!==1||!Number.isSafeInteger(deleted)||deleted!<0||deleted!>limit)throw Error('Invalid audit retention result.');
   await connection.query('COMMIT');active=false;return Object.freeze({deleted:deleted!});
  }catch(error){if(active)try{await connection.query('ROLLBACK');}catch(failure){discard=failure;}throw error;}
  finally{connection.release(discard);}
 };
}
