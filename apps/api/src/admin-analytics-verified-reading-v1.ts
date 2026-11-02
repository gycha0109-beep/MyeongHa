import { createHash } from 'node:crypto';
import { ADMIN_READ_DB_ROLE_V1,ADMIN_READ_PRINCIPAL_SQL_V1 } from './admin-postgres-read-v1.js';
import {
  ADMIN_ANALYTICS_PIPELINE_VERSION_V1,deriveAdminAnalyticsReferenceV1,
  isAdminAnalyticsCollectionApprovedV1,recordVerifiedAdminAnalyticsEventV1,
  type AdminAnalyticsCollectionPolicyV1,type AdminAnalyticsConsentPortV1,
} from './admin-analytics-pipeline-v1.js';
import type {AdminAnalyticsVerifiedPurchaseStoreV1} from './admin-analytics-verified-purchase-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const ADMIN_ANALYTICS_VERIFIED_READING_SQL_V1=`SELECT r.id::text AS "readingId",r.subject_id::text AS "subjectId",
  r.completed_at::text AS "completedAt"
FROM public.readings r
JOIN public.reading_execution_attempts a
  ON a.id=r.committed_execution_attempt_id AND a.reading_id=r.id AND a.subject_id=r.subject_id
WHERE r.id=$1::uuid AND r.subject_id=$2::uuid
  AND r.execution_status='succeeded' AND a.state='succeeded' AND r.completed_at IS NOT NULL
LIMIT 1`;

/** Source-bound Reading completion, never a claim that a Reader displayed the
 * result to a person. That requires separate delivery/open evidence. */
export function createAdminAnalyticsVerifiedReadingAdapterV1(input:{
  readonly pool:PostgresSubjectPoolV1;
  readonly store:AdminAnalyticsVerifiedPurchaseStoreV1;
  readonly consent:AdminAnalyticsConsentPortV1;
  readonly policy:AdminAnalyticsCollectionPolicyV1;
  readonly secret:string;
  readonly resolveActiveSubject:(request:Request)=>Promise<string|null>;
  readonly now?:()=>Date;
}){
  if(Buffer.byteLength(input.secret,'utf8')<32)throw Error('Analytics reference secret unavailable.');
  return Object.freeze({
    async record(request:Request,readingId:string):Promise<'inserted'|'replayed'>{
      if(!isAdminAnalyticsCollectionApprovedV1(input.policy))throw Error('Analytics collection disabled.');
      if(!UUID.test(readingId))throw Error('Invalid Reading reference.');
      const consent=await input.consent.resolve(request),subjectId=await input.resolveActiveSubject(request);
      if(!consent?.granted||!subjectId||!UUID.test(subjectId))throw Error('Active Member and consent required.');
      const readingRef=readingId.toLowerCase(),ownerRef=subjectId.toLowerCase();
      const connection=await input.pool.connect();let active=false,discard:unknown;
      let source:{readingId:string;subjectId:string;completedAt:string}|undefined;
      try{
        await connection.query('BEGIN READ ONLY');active=true;
        const role=await connection.query<{currentUser:string}>(ADMIN_READ_PRINCIPAL_SQL_V1);
        if(role.rows.length!==1||role.rows[0]?.currentUser!==ADMIN_READ_DB_ROLE_V1)throw Error('Dedicated Reading reader required.');
        const rows=await connection.query<{readingId:string;subjectId:string;completedAt:string}>(ADMIN_ANALYTICS_VERIFIED_READING_SQL_V1,[readingRef,ownerRef]);
        if(rows.rows.length>1)throw Error('Nonunique Reading completion.');
        source=rows.rows[0];
        await connection.query('COMMIT');active=false;
      }catch(error){if(active)try{await connection.query('ROLLBACK');}catch(failure){discard=failure;}throw error;}
      finally{connection.release(discard);}
      if(!source||source.readingId!==readingRef||source.subjectId!==ownerRef)throw Error('Verified Reading completion missing.');
      const completed=new Date(source.completedAt),now=(input.now??(()=>new Date()))();
      if(!Number.isFinite(completed.getTime())||completed.getTime()>now.getTime())throw Error('Invalid Reading completion time.');
      const occurredAt=completed.toISOString();
      if(!await input.store.isSubjectConsentActive({visitorRef:consent.visitorRef,consentVersion:consent.version,
        policyVersion:input.policy.policyVersion,subjectLinkRef:deriveAdminAnalyticsReferenceV1(input.secret,'subject',ownerRef),occurredAt}))
        throw Error('Reading predates consent or Subject linkage missing.');
      const bytes=createHash('sha256').update('myeongha-analytics-reading-completed-v1:'+readingRef).digest();
      bytes[6]=(bytes[6]!&0x0f)|0x80;bytes[8]=(bytes[8]!&0x3f)|0x80;
      const hex=bytes.toString('hex').slice(0,32);
      const eventId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-');
      return recordVerifiedAdminAnalyticsEventV1({
        event:{eventId,eventName:'READING_COMPLETED',eventSchemaVersion:ADMIN_ANALYTICS_PIPELINE_VERSION_V1,
          occurredAt,anonymousOrSubjectRef:consent.visitorRef,sessionRef:consent.sessionRef,client:'server',payload:{}},
        policy:input.policy,consent,store:input.store,now,
        verifyDomainEvidence:async()=>({paidPurchase:null}),
      });
    },
  });
}
