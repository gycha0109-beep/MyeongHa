import { createHash } from 'node:crypto';
import { ADMIN_READ_DB_ROLE_V1, ADMIN_READ_PRINCIPAL_SQL_V1 } from './admin-postgres-read-v1.js';
import {
  ADMIN_ANALYTICS_PIPELINE_VERSION_V1,deriveAdminAnalyticsReferenceV1,
  isAdminAnalyticsCollectionApprovedV1,recordVerifiedAdminAnalyticsEventV1,
  type AdminAnalyticsCollectionPolicyV1,type AdminAnalyticsConsentPortV1,type AdminAnalyticsEventStoreV1,
} from './admin-analytics-pipeline-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PURCHASE_SQL=`SELECT r.id::text AS "receiptId",r.subject_id::text AS "subjectId",
  r.verified_at::text AS "verifiedAt",r.verified_amount_minor::text AS "amountMinor",
  p.product_key AS "productKey"
FROM public.commerce_receipts r
JOIN public.product_offers po ON po.id=r.product_offer_id
JOIN public.products p ON p.id=po.product_id
WHERE r.id=$1::uuid AND r.subject_id=$2::uuid AND r.verification_status='verified'
  AND r.environment='production'
  AND r.verified_at IS NOT NULL AND r.verified_amount_minor>0
  AND r.verified_currency IS NOT NULL AND p.product_type='reading'
LIMIT 1`;
export const ADMIN_ANALYTICS_VERIFIED_PURCHASE_SQL_V1=PURCHASE_SQL;

export interface AdminAnalyticsVerifiedPurchaseStoreV1 extends AdminAnalyticsEventStoreV1 {
  isSubjectConsentActive(input:{
    visitorRef:string;consentVersion:string;policyVersion:string;subjectLinkRef:string;
    occurredAt:string;
  }):Promise<boolean>;
}

/** Server-only bridge for a *verified* Reading receipt. Not a client endpoint and
 * not mounted into payment webhooks or Production collection by default.
 * An authenticated subject + consent session + source row + durable consent
 * binding must all agree; UI checkout intent is never purchase evidence. */
export function createAdminAnalyticsVerifiedPurchaseAdapterV1(input:{
  readonly pool:PostgresSubjectPoolV1;
  readonly store:AdminAnalyticsVerifiedPurchaseStoreV1;
  readonly consent:AdminAnalyticsConsentPortV1;
  readonly policy:AdminAnalyticsCollectionPolicyV1;
  readonly secret:string;
  readonly resolveActiveSubject:(request:Request)=>Promise<string|null>;
  readonly now?:()=>Date;
}) {
  if(Buffer.byteLength(input.secret,'utf8')<32)throw Error('Analytics reference secret unavailable.');
  return Object.freeze({
    async record(request:Request,receiptId:string):Promise<'inserted'|'replayed'> {
      if(!isAdminAnalyticsCollectionApprovedV1(input.policy))throw Error('Analytics collection disabled.');
      if(!UUID.test(receiptId))throw Error('Invalid receipt reference.');
      const consent=await input.consent.resolve(request);
      const subjectId=await input.resolveActiveSubject(request);
      if(!consent?.granted||!subjectId||!UUID.test(subjectId))throw Error('Active consent and Member required.');
      const receiptRef=receiptId.toLowerCase(),ownerRef=subjectId.toLowerCase();
      const connection=await input.pool.connect();let active=false,discard:unknown;
      let source:{receiptId:string;subjectId:string;verifiedAt:string;amountMinor:string;productKey:string}|undefined;
      try{
        await connection.query('BEGIN READ ONLY');active=true;
        const principal=await connection.query<{currentUser:string}>(ADMIN_READ_PRINCIPAL_SQL_V1);
        if(principal.rows.length!==1||principal.rows[0]?.currentUser!==ADMIN_READ_DB_ROLE_V1)throw Error('Dedicated analytics source reader required.');
        const result=await connection.query<{receiptId:string;subjectId:string;verifiedAt:string;amountMinor:string;productKey:string}>(PURCHASE_SQL,[receiptRef,ownerRef]);
        if(result.rows.length>1)throw Error('Nonunique verified receipt.');
        source=result.rows[0];
        await connection.query('COMMIT');active=false;
      }catch(error){if(active)try{await connection.query('ROLLBACK');}catch(failure){discard=failure;}throw error;}
      finally{connection.release(discard);}
      if(!source||source.receiptId!==receiptRef||source.subjectId!==ownerRef||
        !/^[0-9]{1,19}$/u.test(source.amountMinor)||BigInt(source.amountMinor)<=0n||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u.test(source.productKey))throw Error('Verified paid Reading evidence missing.');
      const occurred=new Date(source.verifiedAt);
      const now=(input.now??(()=>new Date()))();
      if(!Number.isFinite(occurred.getTime())||occurred.getTime()>now.getTime())throw Error('Invalid receipt verification time.');
      const occurredAt=occurred.toISOString();
      const subjectLinkRef=deriveAdminAnalyticsReferenceV1(input.secret,'subject',ownerRef);
      const verifiedConsent=await input.store.isSubjectConsentActive({
        visitorRef:consent.visitorRef,consentVersion:consent.version,
        policyVersion:input.policy.policyVersion,subjectLinkRef,occurredAt,
      });
      if(!verifiedConsent)throw Error('Purchase predates consent or Subject linkage missing.');
      // UUIDv8-format deterministic event identity: reprocessing the same
      // receipt does not create a second conversion.
      const bytes=createHash('sha256').update('myeongha-analytics-verified-reading-receipt-v1:'+receiptRef).digest();
      bytes[6]=(bytes[6]!&0x0f)|0x80;bytes[8]=(bytes[8]!&0x3f)|0x80;
      const hex=bytes.toString('hex').slice(0,32);
      const eventId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-');
      return recordVerifiedAdminAnalyticsEventV1({
        event:{eventId,eventName:'READING_PURCHASED',eventSchemaVersion:ADMIN_ANALYTICS_PIPELINE_VERSION_V1,
          occurredAt,anonymousOrSubjectRef:consent.visitorRef,sessionRef:consent.sessionRef,
          client:'server',payload:{productKey:source.productKey,purchaseRef:deriveAdminAnalyticsReferenceV1(input.secret,'purchase',receiptRef)}},
        policy:input.policy,consent,store:input.store,now,
        verifyDomainEvidence:async()=>({paidPurchase:true}),
      });
    },
  });
}
