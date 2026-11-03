import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

export interface PublicPresentationV1 {
 readonly entryId:string; readonly revision:number; readonly kind:'notice'|'banner';
 readonly title:string; readonly body:string; readonly linkPath:string|null;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
/** No client input or arbitrary SQL. The dedicated function projects ONLY
 * published, currently scheduled expressions; never audit/history/drafts. */
export function createPublicPresentationReaderV1(pool:PostgresSubjectPoolV1) {
 return async ():Promise<readonly PublicPresentationV1[]>=>{
  const connection=await pool.connect();let started=false;let discard:unknown;
  try{
   await connection.query('BEGIN READ ONLY');started=true;
   // This fixed role can execute the published projection only. No Subject
   // context, personal data query or ordinary user mutation is introduced.
   await connection.query('SET LOCAL ROLE myeongha_api_executor');
   const rows=await connection.query<{entry:unknown}>('SELECT entry FROM myeongha_admin_ops.qry_visible_presentations_v1()');
   if(rows.rows.length>20)throw new Error('Invalid public presentation page.');
   const entries=rows.rows.map(({entry})=>{
    if(entry===null||typeof entry!=='object'||Array.isArray(entry))throw new Error('Invalid public presentation.');
    const v=entry as Record<string,unknown>;
    if(typeof v.entryId!=='string'||!UUID.test(v.entryId)||!Number.isSafeInteger(v.revision)||Number(v.revision)<1||!['notice','banner'].includes(String(v.kind))||typeof v.title!=='string'||v.title.length>160||typeof v.body!=='string'||v.body.length>5000||!(v.linkPath===null||(typeof v.linkPath==='string'&&v.linkPath.length<=200&&/^\/[A-Za-z0-9/_.-]*(?:\?[A-Za-z0-9_.%=&-]*)?$/u.test(v.linkPath)&&!v.linkPath.startsWith('//')&&!v.linkPath.includes('..'))))throw new Error('Invalid public presentation fields.');
    return Object.freeze({entryId:v.entryId,revision:Number(v.revision),kind:v.kind as 'notice'|'banner',title:v.title,body:v.body,linkPath:v.linkPath as string|null});
   });
   await connection.query('COMMIT');started=false;return Object.freeze(entries);
  }catch(error){if(started)try{await connection.query('ROLLBACK');}catch(rollback){discard=rollback;}throw error;}
  finally{connection.release(discard);}
 };
}
