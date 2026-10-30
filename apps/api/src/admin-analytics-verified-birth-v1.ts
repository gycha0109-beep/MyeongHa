import {createHash} from 'node:crypto';
import {ADMIN_READ_DB_ROLE_V1,ADMIN_READ_PRINCIPAL_SQL_V1} from './admin-postgres-read-v1.js';
import {ADMIN_ANALYTICS_PIPELINE_VERSION_V1,deriveAdminAnalyticsReferenceV1,
  isAdminAnalyticsCollectionApprovedV1,recordVerifiedAdminAnalyticsEventV1,
  type AdminAnalyticsCollectionPolicyV1,type AdminAnalyticsConsentPortV1} from './admin-analytics-pipeline-v1.js';
import type {AdminAnalyticsVerifiedPurchaseStoreV1} from './admin-analytics-verified-purchase-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const ADMIN_ANALYTICS_VERIFIED_BIRTH_SQL_V1=`SELECT v.id::text AS "revisionId",v.subject_id::text AS "subjectId",
  v.created_at::text AS "createdAt"
FROM public.birth_profile_revisions v
JOIN public.birth_profiles p ON p.id=v.birth_profile_id AND p.subject_id=v.subject_id
WHERE v.id=$1::uuid AND v.subject_id=$2::uuid AND p.profile_kind='self'
  AND p.archived_at IS NULL AND p.current_revision_id=v.id
LIMIT 1`;

/** Count only an actual current self-profile revision. Birth values and
 * input hashes never leave the source table, including through analytics. */
export function createAdminAnalyticsVerifiedBirthAdapterV1(input:{
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
    async record(request:Request,revisionId:string):Promise<'inserted'|'replayed'>{
      if(!isAdminAnalyticsCollectionApprovedV1(input.policy))throw Error('Analytics collection disabled.');
      if(!UUID.test(revisionId))throw Error('Invalid birth revision reference.');
      const consent=await input.consent.resolve(request),subjectId=await input.resolveActiveSubject(request);
      if(!consent?.granted||!subjectId||!UUID.test(subjectId))throw Error('Consent and active owner required.');
      const revisionRef=revisionId.toLowerCase(),ownerRef=subjectId.toLowerCase();
      const connection=await input.pool.connect();let active=false,discard:unknown;
      let source:{revisionId:string;subjectId:string;createdAt:string}|undefined;
      try{
        await connection.query('BEGIN READ ONLY');active=true;
        const role=await connection.query<{currentUser:string}>(ADMIN_READ_PRINCIPAL_SQL_V1);
        if(role.rows.length!==1||role.rows[0]?.currentUser!==ADMIN_READ_DB_ROLE_V1)throw Error('Dedicated birth metadata reader required.');
        const rows=await connection.query<{revisionId:string;subjectId:string;createdAt:string}>(ADMIN_ANALYTICS_VERIFIED_BIRTH_SQL_V1,[revisionRef,ownerRef]);
        if(rows.rows.length>1)throw Error('Nonunique birth revision.');
        source=rows.rows[0];
        await connection.query('COMMIT');active=false;
      }catch(error){if(active)try{await connection.query('ROLLBACK');}catch(failure){discard=failure;}throw error;}
      finally{connection.release(discard);}
      if(!source||source.revisionId!==revisionRef||source.subjectId!==ownerRef)throw Error('Current self birth revision not found.');
      const created=new Date(source.createdAt),now=(input.now??(()=>new Date()))();
      if(!Number.isFinite(created.getTime())||created.getTime()>now.getTime())throw Error('Invalid revision time.');
      const occurredAt=created.toISOString();
      if(!await input.store.isSubjectConsentActive({visitorRef:consent.visitorRef,consentVersion:consent.version,
        policyVersion:input.policy.policyVersion,subjectLinkRef:deriveAdminAnalyticsReferenceV1(input.secret,'subject',ownerRef),occurredAt}))
        throw Error('Birth input predates consent or Subject linkage missing.');
      const bytes=createHash('sha256').update('myeongha-analytics-self-birth-record-v1:'+revisionRef).digest();
      bytes[6]=(bytes[6]!&0x0f)|0x80;bytes[8]=(bytes[8]!&0x3f)|0x80;
      const hex=bytes.toString('hex').slice(0,32),eventId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-');
      return recordVerifiedAdminAnalyticsEventV1({
        event:{eventId,eventName:'BIRTH_RECORD_COMPLETED',eventSchemaVersion:ADMIN_ANALYTICS_PIPELINE_VERSION_V1,
          occurredAt,anonymousOrSubjectRef:consent.visitorRef,sessionRef:consent.sessionRef,client:'server',payload:{}},
        policy:input.policy,consent,store:input.store,now,
        verifyDomainEvidence:async()=>({paidPurchase:null}),
      });
    },
  });
}
