import { createHash } from 'node:crypto';
import { ADMIN_READ_PRINCIPAL_SQL_V1 } from './admin-postgres-read-v1.js';
import { ANALYTICS_RETENTION_SECONDS_V1 } from './admin-operating-policy-v1.js';
import type { PostgresSubjectPoolV1, PostgresSubjectConnectionV1 } from './postgres-subject-execution.js';
import {
  aggregateAdminAnalyticsEventsV1, isAdminAnalyticsCollectionApprovedV1,
  type AdminAnalyticsCollectionPolicyV1, type AdminAnalyticsConsentV1,
  type AdminAnalyticsStoredEventV1, type AdminAnalyticsEventStoreV1,
  type AdminAnalyticsPeriodV1, type AdminAnalyticsCoverageV1,
} from './admin-analytics-pipeline-v1.js';

export const ADMIN_ANALYTICS_FINANCIAL_SQL_V1 = `
SELECT date_trunc($3::text,r.verified_at AT TIME ZONE 'UTC')::date::text AS "period",
 COALESCE(p.product_key,'unknown') AS "productKey",r.verified_currency AS "currency",
 COUNT(*)::text AS "verifiedReceipts",COUNT(DISTINCT r.subject_id)::text AS "receiptOwners",
 SUM(r.verified_amount_minor)::text AS "verifiedAmountMinor",
 COUNT(*) FILTER (WHERE r.verified_amount_minor IS NULL OR r.verified_currency IS NULL)::text AS "moneyMissing"
FROM public.commerce_receipts r
LEFT JOIN public.product_offers po ON po.id=r.product_offer_id
LEFT JOIN public.products p ON p.id=po.product_id
WHERE r.verification_status='verified'
AND r.environment='production'
AND r.verified_at>=($1::date::timestamp AT TIME ZONE 'UTC')
AND r.verified_at<(($2::date+INTERVAL '1 day') AT TIME ZONE 'UTC')
GROUP BY 1,2,3 ORDER BY 1 DESC,2,3 NULLS LAST LIMIT $4::int`;

const ANALYTICS_EVENTS_SQL = `SELECT e.event_id::text AS "eventId",e.event_name AS "eventName",
 e.event_schema_version AS "eventSchemaVersion",e.occurred_at::text AS "occurredAt",
 e.visitor_ref AS "anonymousOrSubjectRef",e.session_ref AS "sessionRef",e.client,
 e.authority,e.consent_version AS "consentVersion",e.policy_version AS "policyVersion",e.valid_visitor AS "validVisitor",
 e.paid_purchase AS "paidPurchase",e.expires_at::text AS "expiresAt",e.product_key AS "productKey",e.page_key AS "pageKey",
 e.campaign_key AS "campaignKey",e.channel_key AS "channelKey",e.purchase_ref AS "purchaseRef",e.score
FROM myeongha_admin_analytics.events_v1 e
JOIN myeongha_admin_analytics.consents_v1 c ON c.visitor_ref=e.visitor_ref AND c.version=e.consent_version
WHERE c.withdrawn_at IS NULL AND c.expires_at>CURRENT_TIMESTAMP AND e.expires_at>CURRENT_TIMESTAMP
AND e.occurred_at>=($1::date::timestamp AT TIME ZONE 'UTC')
AND e.occurred_at<(($2::date+INTERVAL '1 day') AT TIME ZONE 'UTC')
AND ($3::text IS NULL OR e.campaign_key=$3::text)
ORDER BY e.occurred_at,e.event_id LIMIT 5001`;

export interface AdminAnalyticsFinancialRowV1 {
  readonly period: string; readonly productKey: string; readonly currency: string | null;
  readonly verifiedReceipts: string; readonly receiptOwners: string;
  readonly verifiedAmountMinor: string | null; readonly moneyMissing: string;
}
export interface AdminAnalyticsDashboardResultV1 {
  readonly version: 'admin-analytics-dashboard-v1';
  readonly period: AdminAnalyticsPeriodV1;
  readonly collectionStatus: 'disabled'|'configured_source_unverified'|'source_partial'|'source_covered';
  readonly analytics: ReturnType<typeof aggregateAdminAnalyticsEventsV1>;
  readonly finance: readonly AdminAnalyticsFinancialRowV1[];
  readonly financialStatus: 'verified_receipt_facts'|'partial_verified_receipt_facts';
  readonly financialDefinition: string;
}
export interface AdminAnalyticsDashboardReadPortV1 { read(period: AdminAnalyticsPeriodV1): Promise<AdminAnalyticsDashboardResultV1>; }

function eventFromRow(row: Record<string,unknown>): AdminAnalyticsStoredEventV1 {
  const payload: Record<string,unknown> = {};
  for (const key of ['productKey','pageKey','campaignKey','channelKey','purchaseRef','score']) if(row[key]!==null&&row[key]!==undefined) payload[key]=row[key];
  const event: Record<string,unknown> = {};
  for (const key of ['eventId','eventName','eventSchemaVersion','occurredAt','anonymousOrSubjectRef','sessionRef','client','authority','consentVersion','policyVersion','validVisitor','paidPurchase','expiresAt']) event[key]=row[key];
  event.payload=payload;
  return event as unknown as AdminAnalyticsStoredEventV1;
}

export function createAdminAnalyticsPipelineReadPortV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly collection?: AdminAnalyticsCollectionPolicyV1;
  readonly coverage?: AdminAnalyticsCoverageV1;
  readonly now?: () => Date;
}): AdminAnalyticsDashboardReadPortV1 {
  return {
    async read(period) {
      const connection = await input.pool.connect(); let active=false; let discard:unknown;
      try {
        await connection.query('BEGIN READ ONLY');active=true;
        const principal=await connection.query<{currentUser:string}>(ADMIN_READ_PRINCIPAL_SQL_V1);
        if(principal.rows.length!==1||principal.rows[0]?.currentUser!=='myeongha_admin_reader')throw new Error('Dedicated analytics reader unavailable.');
        const financial=await connection.query<AdminAnalyticsFinancialRowV1>(ADMIN_ANALYTICS_FINANCIAL_SQL_V1,[period.from,period.to,period.grain,501]);
        const approved=isAdminAnalyticsCollectionApprovedV1(input.collection);
        const events=approved?await connection.query<Record<string,unknown>>(ANALYTICS_EVENTS_SQL,[period.from,period.to,period.campaignKey]):{rows:[]};
        const partial=events.rows.length>5000;
        const coverage=approved&&!partial?(input.coverage??null):null;
        const result:AdminAnalyticsDashboardResultV1={version:'admin-analytics-dashboard-v1',period,
          collectionStatus:!approved?'disabled':partial?'source_partial':coverage===null?'configured_source_unverified':'source_covered',
          analytics:aggregateAdminAnalyticsEventsV1(events.rows.slice(0,5000).map(eventFromRow),period,coverage,(input.now??(()=>new Date()))()),
          finance:financial.rows.slice(0,500),financialStatus:financial.rows.length>500?'partial_verified_receipt_facts':'verified_receipt_facts',
          financialDefinition:'동일 UTC 검증 기간·상품·통화별 운영(production) 환경의 verified 영수증 기록 금액. 샌드박스 거래는 제외합니다. 순매출·정산·환불 완료·고유 방문자 전환율이 아니며, 영수증 소유자 수는 사람이 아닌 저장된 subject 참조의 중복 제거 수입니다. 캠페인 귀속은 없으므로 캠페인 선택과 독립된 재무 근거입니다.'};
        await connection.query('COMMIT');active=false;return Object.freeze(result);
      } catch(error) { if(active)try{await connection.query('ROLLBACK');}catch(failure){discard=failure;}throw error; }
      finally {connection.release(discard);}
    },
  };
}

function canonical(value: unknown): string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
async function writerTransaction<T>(pool:PostgresSubjectPoolV1,fn:(client:PostgresSubjectConnectionV1)=>Promise<T>):Promise<T> {
  const client=await pool.connect();let active=false;let discard:unknown;
  try {await client.query('BEGIN');active=true;
    const p=await client.query<{role:string}>(`SELECT current_user::text AS role FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=pg_roles.oid)`);
    if(p.rows.length!==1||p.rows[0]?.role!=='myeongha_analytics_writer')throw Error('Dedicated analytics writer unavailable.');
    const result=await fn(client);await client.query('COMMIT');active=false;return result;
  }catch(error){if(active)try{await client.query('ROLLBACK');}catch(failure){discard=failure;}throw error;}finally{client.release(discard);}
}

export function createAdminAnalyticsPostgresEventStoreV1(pool:PostgresSubjectPoolV1):AdminAnalyticsEventStoreV1 & {
  bindConsent(consent:Omit<AdminAnalyticsConsentV1,'sessionRef'>,policyVersion:string,subjectLinkRef:string|null):Promise<void>;
  isConsentActive(consent:Omit<AdminAnalyticsConsentV1,'sessionRef'>,policyVersion:string):Promise<boolean>;
  isSubjectConsentActive(input:{visitorRef:string;consentVersion:string;policyVersion:string;subjectLinkRef:string;occurredAt:string}):Promise<boolean>;
} {
  return {
    isSubjectConsentActive(input) {
      return writerTransaction(pool,async client=>{
        if(!/^av_[0-9a-f]{64}$/u.test(input.visitorRef)||!/^ah_[0-9a-f]{64}$/u.test(input.subjectLinkRef)||
          !Number.isFinite(Date.parse(input.occurredAt)))throw Error('Invalid subject-linked consent verification.');
        const result=await client.query<{active:boolean}>(`SELECT true AS active FROM myeongha_admin_analytics.consents_v1
          WHERE visitor_ref=$1 AND version=$2 AND policy_version=$3 AND subject_link_ref=$4
            AND granted_at<=$5::timestamptz AND withdrawn_at IS NULL
            AND expires_at>CURRENT_TIMESTAMP AND expires_at>$5::timestamptz`,
          [input.visitorRef,input.consentVersion,input.policyVersion,input.subjectLinkRef,input.occurredAt]);
        return result.rows.length===1&&result.rows[0]?.active===true;
      });
    },
    isConsentActive(consent,policyVersion) {
      return writerTransaction(pool,async client=>{
        const result=await client.query<{active:boolean}>(`SELECT true AS active FROM myeongha_admin_analytics.consents_v1
          WHERE visitor_ref=$1 AND version=$2 AND policy_version=$3 AND withdrawn_at IS NULL AND expires_at>CURRENT_TIMESTAMP`,[consent.visitorRef,consent.version,policyVersion]);
        return result.rows.length===1&&result.rows[0]?.active===true;
      });
    },
    bindConsent(consent,policyVersion,subjectLinkRef) {
      return writerTransaction(pool,async client=>{
        if(!/^av_[0-9a-f]{64}$/u.test(consent.visitorRef)||!consent.granted||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u.test(consent.version)||!Number.isFinite(Date.parse(consent.expiresAt))||
          (subjectLinkRef!==null&&!/^ah_[0-9a-f]{64}$/u.test(subjectLinkRef)))throw Error('Invalid consent binding.');
        const params=[consent.visitorRef,consent.version,policyVersion,subjectLinkRef,consent.expiresAt];
        const inserted=await client.query<{visitorRef:string}>(`INSERT INTO myeongha_admin_analytics.consents_v1(visitor_ref,version,policy_version,subject_link_ref,expires_at)
          VALUES($1,$2,$3,$4,$5::timestamptz) ON CONFLICT(visitor_ref,version) DO NOTHING
          RETURNING visitor_ref AS "visitorRef"`,params);
        if(inserted.rows.length===1&&inserted.rows[0]?.visitorRef===consent.visitorRef)return;
        if(inserted.rows.length!==0)throw Error('Invalid analytics consent insert receipt.');
        // An exact repeat grant is safe. A previously withdrawn, relinked,
        // expired or policy-mismatched row must NEVER issue a new active cookie.
        const existing=await client.query<{active:boolean}>(`SELECT true AS active FROM myeongha_admin_analytics.consents_v1
          WHERE visitor_ref=$1 AND version=$2 AND policy_version=$3
            AND subject_link_ref IS NOT DISTINCT FROM $4::text
            AND expires_at=$5::timestamptz AND withdrawn_at IS NULL
            AND expires_at>CURRENT_TIMESTAMP`,params);
        if(existing.rows.length!==1||existing.rows[0]?.active!==true)
          throw Error('Conflicting or withdrawn analytics consent cannot be re-granted.');
      });
    },
    append(event) {
      return writerTransaction(pool,async client=>{
        if(!Number.isFinite(Date.parse(event.occurredAt))||!Number.isFinite(Date.parse(event.expiresAt))||Date.parse(event.expiresAt)<=Date.parse(event.occurredAt)||
          Date.parse(event.expiresAt)>Date.parse(event.occurredAt)+ANALYTICS_RETENTION_SECONDS_V1*1000)throw Error('Analytics retention exceeds approved 180 days.');
        const consent=await client.query<{version:string;expiresAt:string}>(`SELECT version,expires_at::text AS "expiresAt" FROM myeongha_admin_analytics.consents_v1
          WHERE visitor_ref=$1 AND version=$2 AND policy_version=$3 AND withdrawn_at IS NULL AND expires_at>CURRENT_TIMESTAMP FOR SHARE`,[event.anonymousOrSubjectRef,event.consentVersion,event.policyVersion]);
        if(consent.rows.length!==1)throw Error('Analytics consent revoked or missing.');
        if(Date.parse(event.expiresAt)>Date.parse(consent.rows[0]!.expiresAt))throw Error('Analytics event exceeds consent lifetime.');
        // Server-verified domain events use a deterministic identity from their
        // persisted source. A later tab/session may retry the *same* event,
        // but must never change its original session attribution or owner.
        // Exclude only the volatile sessionRef from its replay fingerprint;
        // client events still require an exact session match on replay.
        const replayFingerprintInput=event.authority==='server_verified'
          ? Object.fromEntries(Object.entries(event).filter(([key])=>key!=='sessionRef'))
          : event;
        const fingerprint=createHash('sha256').update(canonical(replayFingerprintInput)).digest('hex');
        const inserted=await client.query<{eventId:string}>(`INSERT INTO myeongha_admin_analytics.events_v1
          (event_id,event_name,event_schema_version,visitor_ref,session_ref,client,authority,consent_version,policy_version,
           valid_visitor,paid_purchase,occurred_at,expires_at,product_key,page_key,campaign_key,channel_key,purchase_ref,score,event_fingerprint)
          VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13::timestamptz,$14,$15,$16,$17,$18,$19,$20)
          ON CONFLICT(event_id) DO NOTHING RETURNING event_id::text AS "eventId"`,[event.eventId,event.eventName,event.eventSchemaVersion,event.anonymousOrSubjectRef,
          event.sessionRef,event.client,event.authority,event.consentVersion,event.policyVersion,event.validVisitor,event.paidPurchase,event.occurredAt,event.expiresAt,
          event.payload.productKey??null,event.payload.pageKey??null,event.payload.campaignKey??null,event.payload.channelKey??null,event.payload.purchaseRef??null,event.payload.score??null,fingerprint]);
        if(inserted.rows.length===1)return 'inserted';
        const previous=await client.query<{fingerprint:string}>(`SELECT event_fingerprint AS fingerprint FROM myeongha_admin_analytics.events_v1 WHERE event_id=$1::uuid`,[event.eventId]);
        if(previous.rows.length!==1||previous.rows[0]?.fingerprint!==fingerprint)throw Error('Conflicting analytics event identity.');
        return 'replayed';
      });
    },
    eraseVisitor(visitorRef) {return writerTransaction(pool,async client=>{
      if(!/^av_[0-9a-f]{64}$/u.test(visitorRef))throw Error('Invalid visitor reference.');
      await client.query(`UPDATE myeongha_admin_analytics.consents_v1 SET withdrawn_at=CURRENT_TIMESTAMP WHERE visitor_ref=$1 AND withdrawn_at IS NULL`,[visitorRef]);
      await client.query('DELETE FROM myeongha_admin_analytics.events_v1 WHERE visitor_ref=$1',[visitorRef]);
    });},
    eraseSubject(subjectLinkRef){return writerTransaction(pool,async client=>{
      if(!/^ah_[0-9a-f]{64}$/u.test(subjectLinkRef))throw Error('Invalid subject deletion reference.');
      await client.query('DELETE FROM myeongha_admin_analytics.consents_v1 WHERE subject_link_ref=$1',[subjectLinkRef]);
    });},
    purgeExpired(now){return writerTransaction(pool,async client=>{
      if(!Number.isFinite(Date.parse(now)))throw Error('Invalid purge time.');
      // Each scheduled batch has a fixed upper bound. No UPDATE privilege is
      // required by the dedicated analytics writer.
      const events=await client.query<{id:string}>(`WITH due AS (
          SELECT event_id FROM myeongha_admin_analytics.events_v1
          WHERE expires_at<=$1::timestamptz
          ORDER BY expires_at,event_id LIMIT 1000
        ) DELETE FROM myeongha_admin_analytics.events_v1 e USING due
          WHERE e.event_id=due.event_id RETURNING e.event_id::text AS id`,[now]);
      // Avoid unbounded ON DELETE CASCADE by waiting until every event for the
      // expired consent version has been removed in earlier bounded batches.
      const consents=await client.query<{id:string}>(`WITH due AS (
          SELECT c.visitor_ref,c.version FROM myeongha_admin_analytics.consents_v1 c
          WHERE c.expires_at<=$1::timestamptz AND NOT EXISTS (
            SELECT 1 FROM myeongha_admin_analytics.events_v1 e
            WHERE e.visitor_ref=c.visitor_ref AND e.consent_version=c.version
          ) ORDER BY c.expires_at,c.visitor_ref,c.version LIMIT 1000
        ) DELETE FROM myeongha_admin_analytics.consents_v1 c USING due
          WHERE c.visitor_ref=due.visitor_ref AND c.version=due.version
          RETURNING c.visitor_ref AS id`,[now]);
      return events.rows.length+consents.rows.length;
    });},
  };
}
