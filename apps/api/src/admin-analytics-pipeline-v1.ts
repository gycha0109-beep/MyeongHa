import { createHmac } from 'node:crypto';
import { ADMIN_ANALYTICS_EVENT_REGISTRY_V1 } from './admin-analytics-read-v1.js';
import { ANALYTICS_RETENTION_SECONDS_V1 } from './admin-operating-policy-v1.js';

export const ADMIN_ANALYTICS_PIPELINE_VERSION_V1 = 'admin-analytics-pipeline-v1' as const;
// An explicitly versioned candidate registry. No event becomes publishable merely
// because it appears here: an approved collection policy must bind every event.
export const ADMIN_ANALYTICS_EXTENSION_EVENTS_V1 = Object.freeze([
  'VISIT_STARTED','PAGE_VIEWED','SIGNUP_STARTED','SIGNUP_COMPLETED','PRODUCT_VIEWED',
  'CHECKOUT_STARTED','PAYMENT_FAILED','READING_STARTED','READING_COMPLETED','READING_FAILED',
  'RESULT_VIEWED','SATISFACTION_SUBMITTED','REFUND_COMPLETED','MAJOR_COMPLAINT_RECORDED',
] as const);
export type AdminAnalyticsEventNameV1 = typeof ADMIN_ANALYTICS_EVENT_REGISTRY_V1[number] | typeof ADMIN_ANALYTICS_EXTENSION_EVENTS_V1[number];
const ALL_EVENTS = new Set<string>([...ADMIN_ANALYTICS_EVENT_REGISTRY_V1,...ADMIN_ANALYTICS_EXTENSION_EVENTS_V1]);
const SERVER_EVENTS = new Set<string>(['SIGNUP_COMPLETED','BIRTH_RECORD_COMPLETED','READING_PURCHASED',
  'FIRST_READING_DELIVERED','PAYMENT_FAILED','READING_STARTED','READING_COMPLETED','READING_FAILED',
  'REFUND_COMPLETED','MAJOR_COMPLAINT_RECORDED','RELATIONSHIP_STAGE_CHANGED','MEMORY_ACCEPTED']);
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REF = /^a[vsph]_[0-9a-f]{64}$/u;
export interface AdminAnalyticsCollectionPolicyV1 {
  readonly enabled: boolean;
  readonly approvalRef: string;
  readonly policyVersion: string;
  readonly retentionSeconds: number;
  readonly deletionBindingVerified: boolean;
  readonly validVisitPolicyVersion: string;
  readonly approvedEvents: readonly AdminAnalyticsEventNameV1[];
  readonly approvedCampaignKeys?: readonly string[];
  readonly approvedChannelKeys?: readonly string[];
}
export interface AdminAnalyticsEnvelopeV1 {
  readonly eventId: string;
  readonly eventName: AdminAnalyticsEventNameV1;
  readonly eventSchemaVersion: typeof ADMIN_ANALYTICS_PIPELINE_VERSION_V1;
  readonly occurredAt: string;
  readonly anonymousOrSubjectRef: string;
  readonly sessionRef: string;
  readonly client: 'web' | 'ios' | 'android' | 'server';
  readonly payload: Readonly<{
    productKey?: string;
    pageKey?: string;
    campaignKey?: string;
    channelKey?: string;
    purchaseRef?: string;
    score?: number;
  }>;
}
export interface AdminAnalyticsStoredEventV1 extends AdminAnalyticsEnvelopeV1 {
  readonly authority: 'client_intent' | 'server_verified';
  readonly consentVersion: string;
  readonly policyVersion: string;
  readonly validVisitor: boolean;
  readonly paidPurchase: boolean | null;
  readonly expiresAt: string;
}
export interface AdminAnalyticsConsentV1 {
  readonly visitorRef: string;
  readonly sessionRef: string;
  readonly version: string;
  readonly granted: boolean;
  readonly expiresAt: string;
  /** Evaluated by a server admission binding, never by a client boolean. */
  readonly validVisitor: boolean;
}
export interface AdminAnalyticsConsentPortV1 {
  resolve(request: Request): Promise<AdminAnalyticsConsentV1 | null>;
  withdraw(request: Request): Promise<readonly string[]>;
}
export interface AdminAnalyticsEventStoreV1 {
  /** Atomic unique event-id insert: same event replay succeeds, conflicts reject. */
  append(event: AdminAnalyticsStoredEventV1): Promise<'inserted' | 'replayed'>;
  eraseVisitor(visitorRef: string): Promise<void>;
  eraseSubject(subjectLinkRef: string): Promise<void>;
  purgeExpired(now: string): Promise<number>;
}

export function isAdminAnalyticsCollectionApprovedV1(policy?: AdminAnalyticsCollectionPolicyV1): policy is AdminAnalyticsCollectionPolicyV1 {
  return policy?.enabled === true && KEY.test(policy.approvalRef) && KEY.test(policy.policyVersion) &&
    KEY.test(policy.validVisitPolicyVersion) && policy.deletionBindingVerified === true &&
    policy.retentionSeconds === ANALYTICS_RETENTION_SECONDS_V1 &&
    policy.approvedEvents.length > 0 && policy.approvedEvents.every(event => ALL_EVENTS.has(event));
}

/** HMAC inputs belong only to the caller's server; no raw auth/user ID is stored. */
export function deriveAdminAnalyticsReferenceV1(secret: string, scope: 'visitor'|'session'|'purchase'|'subject', input: string): string {
  if (secret.length < 32 || input.length < 1 || input.length > 512) throw new Error('Analytics reference binding unavailable.');
  const prefix = { visitor:'av', session:'as', purchase:'ap', subject:'ah' }[scope];
  return prefix + '_' + createHmac('sha256',secret).update(ADMIN_ANALYTICS_PIPELINE_VERSION_V1 + ':' + scope + ':' + input).digest('hex');
}

export function parseAdminAnalyticsEnvelopeV1(raw: unknown, policy: AdminAnalyticsCollectionPolicyV1): AdminAnalyticsEnvelopeV1 {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid analytics envelope.');
  const row = raw as Record<string,unknown>;
  const keys = ['eventId','eventName','eventSchemaVersion','occurredAt','anonymousOrSubjectRef','sessionRef','client','payload'];
  if (Object.keys(row).some(key => !keys.includes(key)) || Object.keys(row).length !== keys.length ||
      typeof row.eventId !== 'string' || !UUID.test(row.eventId) ||
      typeof row.eventName !== 'string' || !ALL_EVENTS.has(row.eventName) || !policy.approvedEvents.includes(row.eventName as AdminAnalyticsEventNameV1) ||
      row.eventSchemaVersion !== ADMIN_ANALYTICS_PIPELINE_VERSION_V1 ||
      typeof row.occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(row.occurredAt) || !Number.isFinite(Date.parse(row.occurredAt)) ||
      typeof row.anonymousOrSubjectRef !== 'string' || !/^av_[0-9a-f]{64}$/u.test(row.anonymousOrSubjectRef) ||
      typeof row.sessionRef !== 'string' || !/^as_[0-9a-f]{64}$/u.test(row.sessionRef) ||
      !['web','ios','android','server'].includes(String(row.client)) ||
      row.payload === null || typeof row.payload !== 'object' || Array.isArray(row.payload)) throw new Error('Invalid analytics envelope.');
  const payload = row.payload as Record<string,unknown>;
  const allowed = new Set(['productKey','pageKey','campaignKey','channelKey','purchaseRef','score']);
  if (Object.keys(payload).some(key => !allowed.has(key))) throw new Error('Unregistered analytics payload field.');
  for (const key of ['productKey','pageKey','campaignKey','channelKey']) {
    if (payload[key] !== undefined && (typeof payload[key] !== 'string' || !KEY.test(payload[key]))) throw new Error('Invalid analytics metadata key.');
  }
  if (payload.campaignKey !== undefined && !policy.approvedCampaignKeys?.includes(String(payload.campaignKey))) throw new Error('Unregistered campaign key.');
  if (payload.channelKey !== undefined && !policy.approvedChannelKeys?.includes(String(payload.channelKey))) throw new Error('Unregistered channel key.');
  if (payload.purchaseRef !== undefined && (typeof payload.purchaseRef !== 'string' || !/^ap_[0-9a-f]{64}$/u.test(payload.purchaseRef))) throw new Error('Invalid purchase analytics reference.');
  if (payload.score !== undefined && (typeof payload.score !== 'number' || !Number.isInteger(payload.score) || payload.score < 1 || payload.score > 5)) throw new Error('Invalid satisfaction score.');
  if (row.eventName === 'SATISFACTION_SUBMITTED' && (payload.score === undefined || payload.purchaseRef === undefined)) throw new Error('Purchase feedback requires score and purchase linkage.');
  return Object.freeze({ ...row, payload: Object.freeze({...payload}) }) as unknown as AdminAnalyticsEnvelopeV1;
}

function response(status: number, code: string): Response {
  return Response.json({ code }, { status, headers: { 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' } });
}

export function createAdminAnalyticsCollectorV1(input: {
  readonly policy?: AdminAnalyticsCollectionPolicyV1;
  readonly consent: AdminAnalyticsConsentPortV1;
  readonly store: AdminAnalyticsEventStoreV1;
  readonly now?: () => Date;
}) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (!['/api/analytics/events','/api/analytics/withdraw'].includes(url.pathname) || url.search !== '') return response(404,'NOT_FOUND');
    if (request.method !== 'POST') return response(405,'METHOD_NOT_ALLOWED');
    if (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json')) return response(403,'ANALYTICS_ORIGIN_REQUIRED');
    // Withdrawal is available even after collection is disabled.
    if (url.pathname.endsWith('/withdraw')) {
      try { for (const ref of await input.consent.withdraw(request)) { if (!/^av_[0-9a-f]{64}$/u.test(ref)) throw new Error('Invalid withdrawal reference.'); await input.store.eraseVisitor(ref); } }
      catch { return response(503,'ANALYTICS_WITHDRAWAL_INCOMPLETE'); }
      return response(200,'ANALYTICS_WITHDRAWN');
    }
    if (!isAdminAnalyticsCollectionApprovedV1(input.policy)) return response(503,'ANALYTICS_COLLECTION_DISABLED');
    if (Number(request.headers.get('content-length') ?? 0) > 4096) return response(413,'ANALYTICS_BODY_TOO_LARGE');
    try {
      const reader = request.body?.getReader(); if (!reader) return response(400,'ANALYTICS_BAD_REQUEST');
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const result = await reader.read(); if (result.done) break; size += result.value.byteLength; if (size > 4096) { await reader.cancel(); return response(413,'ANALYTICS_BODY_TOO_LARGE'); } chunks.push(result.value); } } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
      const event = parseAdminAnalyticsEnvelopeV1(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),input.policy);
      if (event.client === 'server' || SERVER_EVENTS.has(event.eventName)) return response(403,'ANALYTICS_SERVER_EVIDENCE_REQUIRED');
      const consent = await input.consent.resolve(request);
      const now = (input.now ?? (()=>new Date()))();
      if (consent === null || !consent.granted || consent.visitorRef !== event.anonymousOrSubjectRef || consent.sessionRef !== event.sessionRef ||
          !KEY.test(consent.version) || Date.parse(consent.expiresAt) <= now.getTime()) return response(403,'ANALYTICS_CONSENT_REQUIRED');
      if (Date.parse(event.occurredAt) > now.getTime() || Date.parse(event.occurredAt) <= now.getTime() - ANALYTICS_RETENTION_SECONDS_V1 * 1000) return response(400,'ANALYTICS_EVENT_OUTSIDE_RETENTION');
      const expiry = Math.min(Date.parse(event.occurredAt) + ANALYTICS_RETENTION_SECONDS_V1 * 1000,Date.parse(consent.expiresAt));
      const state = await input.store.append(Object.freeze({ ...event, authority:'client_intent',consentVersion:consent.version,
        policyVersion:input.policy.policyVersion, validVisitor:consent.validVisitor,paidPurchase:null,expiresAt:new Date(expiry).toISOString() }));
      return response(200,state === 'inserted' ? 'ANALYTICS_RECORDED' : 'ANALYTICS_REPLAYED');
    } catch { return response(400,'ANALYTICS_INVALID_OR_CONFLICTING_EVENT'); }
  };
}

/** Only a bound domain adapter can establish purchase/refund/Reading success. */
export async function recordVerifiedAdminAnalyticsEventV1(input: {
  readonly event: unknown;
  readonly policy: AdminAnalyticsCollectionPolicyV1;
  readonly consent: AdminAnalyticsConsentV1;
  readonly verifyDomainEvidence: (event: AdminAnalyticsEnvelopeV1) => Promise<{ paidPurchase: boolean | null } | null>;
  readonly store: AdminAnalyticsEventStoreV1;
  readonly now: Date;
}): Promise<'inserted'|'replayed'> {
  if (!isAdminAnalyticsCollectionApprovedV1(input.policy)) throw new Error('Analytics collection disabled.');
  const event = parseAdminAnalyticsEnvelopeV1(input.event,input.policy);
  if (event.client !== 'server' || !SERVER_EVENTS.has(event.eventName) || !input.consent.granted ||
      input.consent.visitorRef !== event.anonymousOrSubjectRef || input.consent.sessionRef !== event.sessionRef ||
      Date.parse(input.consent.expiresAt) <= input.now.getTime() || Date.parse(event.occurredAt) > input.now.getTime()) throw new Error('Analytics server consent/evidence required.');
  const evidence = await input.verifyDomainEvidence(event); if (evidence === null) throw new Error('Analytics domain evidence missing.');
  if ((event.eventName === 'READING_PURCHASED' || event.eventName === 'REFUND_COMPLETED') && !event.payload.purchaseRef) throw new Error('Purchase linkage required.');
  const expiresAt = Math.min(Date.parse(event.occurredAt)+ANALYTICS_RETENTION_SECONDS_V1*1000,Date.parse(input.consent.expiresAt));
  if (expiresAt <= input.now.getTime()) throw new Error('Analytics event expired.');
  return input.store.append(Object.freeze({ ...event,authority:'server_verified',consentVersion:input.consent.version,policyVersion:input.policy.policyVersion,
    validVisitor:input.consent.validVisitor,paidPurchase:evidence.paidPurchase,expiresAt:new Date(expiresAt).toISOString() }));
}

export interface AdminAnalyticsPeriodV1 { readonly from: string; readonly to: string; readonly grain: 'day'|'week'|'month'; readonly campaignKey: string | null; }
export interface AdminAnalyticsMetricV1 { readonly key: string; readonly label: string; readonly value: number | null; readonly numerator: number | null; readonly denominator: number | null; readonly status: 'measured'|'unmeasured'|'empty_denominator'|'target_sample_not_met'; readonly unit: string; }
export interface AdminAnalyticsCoverageV1 { readonly from: string; readonly through: string; readonly events: readonly AdminAnalyticsEventNameV1[]; }

export function parseAdminAnalyticsPeriodV1(url: URL): AdminAnalyticsPeriodV1 {
  for (const key of url.searchParams.keys()) if (!['from','to','grain','campaignKey'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error('Invalid analytics query.');
  const from = url.searchParams.get('from'); const to = url.searchParams.get('to'); const grain = url.searchParams.get('grain') ?? 'day'; const campaignKey = url.searchParams.get('campaignKey');
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/u.test(from) || !/^\d{4}-\d{2}-\d{2}$/u.test(to) ||
      new Date(from+'T00:00:00Z').toISOString().slice(0,10) !== from || new Date(to+'T00:00:00Z').toISOString().slice(0,10) !== to ||
      Date.parse(to)-Date.parse(from) < 0 || Date.parse(to)-Date.parse(from)>(180-1)*86_400_000 ||
      !['day','week','month'].includes(grain) || (campaignKey !== null && !KEY.test(campaignKey))) throw new Error('Invalid bounded analytics period.');
  return Object.freeze({from,to,grain:grain as AdminAnalyticsPeriodV1['grain'],campaignKey});
}

export function adminAnalyticsBucketV1(time: string, grain: AdminAnalyticsPeriodV1['grain']): string {
  const date = new Date(time); if (!Number.isFinite(date.getTime())) throw new Error('Invalid event time.');
  if (grain === 'month') return date.toISOString().slice(0,7)+'-01';
  if (grain === 'week') date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
  return date.toISOString().slice(0,10);
}

export function aggregateAdminAnalyticsEventsV1(events: readonly AdminAnalyticsStoredEventV1[],period: AdminAnalyticsPeriodV1,coverage: AdminAnalyticsCoverageV1 | null,now: Date) {
  const begin = Date.parse(period.from+'T00:00:00Z'); const end = Date.parse(period.to+'T00:00:00Z')+86_400_000;
  const covered = (names: readonly string[]) => coverage !== null && Date.parse(coverage.from) <= begin && Date.parse(coverage.through) >= end && names.every(name=>coverage.events.some(event=>event===name));
  const unique = new Map<string,AdminAnalyticsStoredEventV1>();
  for (const event of events) {
    const previous = unique.get(event.eventId); if (previous && JSON.stringify(previous)!==JSON.stringify(event)) throw new Error('Conflicting analytics event identity.');
    if (!REF.test(event.anonymousOrSubjectRef) || !REF.test(event.sessionRef)) throw new Error('Unminimized analytics identity.');
    if (Date.parse(event.occurredAt)<begin || Date.parse(event.occurredAt)>=end || Date.parse(event.expiresAt)<=now.getTime() ||
        (period.campaignKey !== null && event.payload.campaignKey !== period.campaignKey)) continue;
    if (SERVER_EVENTS.has(event.eventName) && event.authority !== 'server_verified') continue;
    unique.set(event.eventId,event);
  }
  const rows = [...unique.values()].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
  const visitors = new Set(rows.filter(e=>e.eventName==='PRODUCT_VIEWED' && e.validVisitor).map(e=>e.anonymousOrSubjectRef));
  const cohort = rows.filter(e=>visitors.has(e.anonymousOrSubjectRef));
  const members = (name: string) => new Set(cohort.filter(e=>e.eventName===name).map(e=>e.anonymousOrSubjectRef));
  const buyers = new Set(cohort.filter(e=>e.eventName==='READING_PURCHASED' && e.paidPurchase===true).map(e=>e.anonymousOrSubjectRef));
  const signup = members('SIGNUP_COMPLETED'); const signupStarts = members('SIGNUP_STARTED');
  const signupFinished = new Set([...signup].filter(ref=>signupStarts.has(ref)));
  const purchaseOwners = new Map(cohort.filter(e=>e.eventName==='READING_PURCHASED'&&e.paidPurchase===true&&e.payload.purchaseRef).map(e=>[e.payload.purchaseRef!,e.anonymousOrSubjectRef]));
  const feedback = cohort.filter(e=>e.eventName==='SATISFACTION_SUBMITTED' && purchaseOwners.get(e.payload.purchaseRef??'')===e.anonymousOrSubjectRef && typeof e.payload.score==='number');
  const ratings = new Map<string,number>(); for (const e of feedback) ratings.set(e.payload.purchaseRef!,e.payload.score!);
  const complaints = new Set(cohort.filter(e=>['REFUND_COMPLETED','MAJOR_COMPLAINT_RECORDED'].includes(e.eventName) && buyers.has(e.anonymousOrSubjectRef)).map(e=>e.anonymousOrSubjectRef));
  const repeatBuyers = [...buyers].filter(ref=>new Set(cohort.filter(e=>e.eventName==='READING_PURCHASED' && e.paidPurchase===true && e.anonymousOrSubjectRef===ref).map(e=>e.payload.purchaseRef)).size>1).length;
  const visits = cohort.filter(e=>['VISIT_STARTED','PAGE_VIEWED','PRODUCT_VIEWED'].includes(e.eventName));
  const revisitors = [...visitors].filter(ref=>new Set(visits.filter(e=>e.anonymousOrSubjectRef===ref).map(e=>e.occurredAt.slice(0,10))).size>1).length;
  const postPurchaseVisitors = [...buyers].filter(ref=>{
    const firstPurchase=cohort.find(e=>e.anonymousOrSubjectRef===ref&&e.eventName==='READING_PURCHASED'&&e.paidPurchase===true);
    return firstPurchase!==undefined&&visits.some(e=>e.anonymousOrSubjectRef===ref&&e.occurredAt>firstPurchase.occurredAt&&e.sessionRef!==firstPurchase.sessionRef);
  }).length;
  const metric = (key:string,label:string,n:number,d:number|null,names:readonly string[],unit:string):AdminAnalyticsMetricV1 => {
    if (!covered(names)) return {key,label,value:null,numerator:null,denominator:null,status:'unmeasured',unit};
    return {key,label,value:d===null?n:d===0?null:(unit==='%'?100:1)*n/d,numerator:n,denominator:d,status:d===0?'empty_denominator':key==='visitors'&&n<100?'target_sample_not_met':'measured',unit};
  };
  const metrics = [
    metric('visit_visitors','전체 방문 고유 분석 참조',new Set(rows.filter(e=>e.eventName==='VISIT_STARTED'&&e.validVisitor).map(e=>e.anonymousOrSubjectRef)).size,null,['VISIT_STARTED'],'명'),
    metric('sessions','전체 방문 고유 세션',new Set(rows.filter(e=>e.eventName==='VISIT_STARTED'&&e.validVisitor).map(e=>e.sessionRef)).size,null,['VISIT_STARTED'],'개'),
    metric('visitors','상품 상세 유효 방문자',visitors.size,null,['PRODUCT_VIEWED'],'명'),
    metric('signup_conversion','회원가입 전환율',signup.size,visitors.size,['PRODUCT_VIEWED','SIGNUP_COMPLETED'],'%'),
    metric('signup_completion','가입 시작 대비 완료',signupFinished.size,signupStarts.size,['SIGNUP_STARTED','SIGNUP_COMPLETED','PRODUCT_VIEWED'],'%'),
    metric('purchase_conversion','검증 유료 구매 전환율',buyers.size,visitors.size,['PRODUCT_VIEWED','READING_PURCHASED'],'%'),
    metric('return_visitors','기간 내 다른 UTC 일자 재방문',revisitors,null,['PRODUCT_VIEWED','PAGE_VIEWED'],'명'),
    metric('post_purchase_return','구매 후 다른 세션 재방문',postPurchaseVisitors,null,['PRODUCT_VIEWED','READING_PURCHASED','PAGE_VIEWED','VISIT_STARTED'],'명'),
    metric('repeat_buyers','기간 내 서로 다른 구매 2회 이상',repeatBuyers,null,['PRODUCT_VIEWED','READING_PURCHASED'],'명'),
    metric('satisfaction','구매별 마지막 유효 만족도', [...ratings.values()].reduce((a,b)=>a+b,0),ratings.size,['PRODUCT_VIEWED','READING_PURCHASED','SATISFACTION_SUBMITTED'],'/5'),
    metric('feedback_responses','평가 응답 구매 수',ratings.size,null,['PRODUCT_VIEWED','READING_PURCHASED','SATISFACTION_SUBMITTED'],'건'),
    metric('refund_complaint_rate','환불 완료·중대 불만 구매자 합집합 비율',complaints.size,buyers.size,['PRODUCT_VIEWED','READING_PURCHASED','REFUND_COMPLETED','MAJOR_COMPLAINT_RECORDED'],'%'),
  ];
  const funnelNames = ['PRODUCT_VIEWED','BIRTH_RECORD_COMPLETED','CHECKOUT_STARTED','READING_PURCHASED','FIRST_READING_DELIVERED','RESULT_VIEWED'] as const;
  let eligible = new Map<string,string>();
  const funnel = funnelNames.map((eventName,index)=>{
    const next = new Map<string,string>();
    for (const event of cohort.filter(e=>e.eventName===eventName && (eventName!=='READING_PURCHASED'||e.paidPurchase===true))) {
      if (index===0 || (eligible.has(event.anonymousOrSubjectRef) && event.occurredAt>=eligible.get(event.anonymousOrSubjectRef)!)) {
        if (!next.has(event.anonymousOrSubjectRef)) next.set(event.anonymousOrSubjectRef,event.occurredAt);
      }
    }
    const prior = eligible.size; eligible = next;
    const observed = covered(funnelNames.slice(0,index+1));
    return {eventName,uniqueVisitors:observed?next.size:null,previousStepVisitors:observed&&index>0?prior:null,
      dropoutRate:observed&&index>0&&prior>0?100*(prior-next.size)/prior:null,status:observed?'measured':'unmeasured'};
  });
  const groups = new Map<string,{period:string;campaignKey:string;channelKey:string;productKey:string;visitors:Set<string>;buyers:Set<string>}>();
  for (const event of cohort) {
    const bucket = adminAnalyticsBucketV1(event.occurredAt,period.grain); const campaignKey = event.payload.campaignKey??'unknown'; const channelKey = event.payload.channelKey??'unknown'; const productKey = event.payload.productKey??'unknown';
    const key = [bucket,campaignKey,channelKey,productKey].join('|'); const g = groups.get(key)??{period:bucket,campaignKey,channelKey,productKey,visitors:new Set<string>(),buyers:new Set<string>()};
    if(event.eventName==='PRODUCT_VIEWED'&&event.validVisitor)g.visitors.add(event.anonymousOrSubjectRef);
    if(event.eventName==='READING_PURCHASED'&&event.paidPurchase===true)g.buyers.add(event.anonymousOrSubjectRef);groups.set(key,g);
  }
  return Object.freeze({metrics,funnel,series:[...groups.values()].map(g=>({period:g.period,campaignKey:g.campaignKey,channelKey:g.channelKey,productKey:g.productKey,
    visitors:covered(['PRODUCT_VIEWED'])?g.visitors.size:null,buyers:covered(['READING_PURCHASED','PRODUCT_VIEWED'])?[...g.buyers].filter(ref=>g.visitors.has(ref)).length:null,
    conversionRate:covered(['READING_PURCHASED','PRODUCT_VIEWED'])&&g.visitors.size>0?100*[...g.buyers].filter(ref=>g.visitors.has(ref)).length/g.visitors.size:null})),observedEvents:rows.length,
    coverageStatus:coverage===null?'source_unverified':'coverage_declared',timezone:'UTC',cohortDefinition:'동일 기간·캠페인의 서버 유효 방문 참조; 퍼널은 순차 단계 코호트'});
}
