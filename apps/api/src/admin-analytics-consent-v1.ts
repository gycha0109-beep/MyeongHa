import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {ANALYTICS_RETENTION_SECONDS_V1} from './admin-operating-policy-v1.js';
import {createAdminAnalyticsCollectorV1,deriveAdminAnalyticsReferenceV1,isAdminAnalyticsCollectionApprovedV1,
 type AdminAnalyticsCollectionPolicyV1,type AdminAnalyticsConsentV1,type AdminAnalyticsEventStoreV1} from './admin-analytics-pipeline-v1.js';

export const ADMIN_ANALYTICS_CONSENT_VERSION_V1='product-analytics-consent-180d-v1';
export const ADMIN_ANALYTICS_CONSENT_COOKIE_V1='__Host-myeongha_analytics_consent';
export const ADMIN_ANALYTICS_SESSION_HEADER_V1='X-MyeongHa-Analytics-Session';
export interface AdminAnalyticsConsentStoreV1 extends AdminAnalyticsEventStoreV1 {
 bindConsent(consent:Omit<AdminAnalyticsConsentV1,'sessionRef'>,policyVersion:string,subjectLinkRef:string|null):Promise<void>;
 isConsentActive(consent:Omit<AdminAnalyticsConsentV1,'sessionRef'>,policyVersion:string):Promise<boolean>;
}
interface Receipt {readonly consent:Omit<AdminAnalyticsConsentV1,'sessionRef'>;readonly policyVersion:string;readonly subjectLinkRef:string|null;}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function reply(status:number,code:string,extra:Record<string,unknown>={}){return Response.json({code,...extra},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}

/** Explicit consent endpoint and Collector composition. No activation is inferred
 * from a retention decision. Admission, active Subject resolution and rate limiting
 * belong to trusted service adapters; none of them can be asserted in client JSON. */
export function createAdminAnalyticsConsentRuntimeV1(input:{
 readonly origin:string;readonly secret:string;readonly store:AdminAnalyticsConsentStoreV1;
 readonly policy:AdminAnalyticsCollectionPolicyV1;readonly enabled?:boolean;
 readonly allowRequest:(request:Request)=>Promise<boolean>;
 readonly resolveActiveSubject:(request:Request)=>Promise<string|null>;
 readonly admitVisitor:(request:Request)=>Promise<boolean>;
 readonly now?:()=>Date;
}){
 const origin=new URL(input.origin);if(origin.protocol!=='https:'||origin.origin!==input.origin||Buffer.byteLength(input.secret)<32||Buffer.byteLength(input.secret)>256)throw Error('Analytics consent configuration unavailable.');
 const now=()=> (input.now??(()=>new Date()))();
 const enabled=()=>input.enabled===true&&isAdminAnalyticsCollectionApprovedV1(input.policy);
 const mac=(payload:string)=>createHmac('sha256',input.secret).update('analytics-consent-receipt-v1.'+payload).digest();
 const encode=(receipt:Receipt)=>{const payload=Buffer.from(JSON.stringify(receipt)).toString('base64url');return payload+'.'+mac(payload).toString('base64url');};
 async function subjectLink(request:Request){const subject=await input.resolveActiveSubject(request);if(subject===null)return null;if(!UUID.test(subject))throw Error('Invalid active analytics Subject.');return deriveAdminAnalyticsReferenceV1(input.secret,'subject',subject.toLowerCase());}
 function read(request:Request,matchPolicy=true):Receipt|null{
  try{
   const cookies=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(ADMIN_ANALYTICS_CONSENT_COOKIE_V1+'='));
   if(cookies.length!==1)return null;const token=cookies[0]!.slice(ADMIN_ANALYTICS_CONSENT_COOKIE_V1.length+1);
   if(token.length>4096||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token))return null;
   const [payload,sig]=token.split('.');const expected=mac(payload!),actual=Buffer.from(sig!,'base64url');
   if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
   const r=JSON.parse(Buffer.from(payload!,'base64url').toString('utf8')) as Receipt;
   if((matchPolicy&&r.policyVersion!==input.policy.policyVersion)||r.consent?.version!==ADMIN_ANALYTICS_CONSENT_VERSION_V1||r.consent.granted!==true||
      !/^av_[0-9a-f]{64}$/u.test(r.consent.visitorRef)||typeof r.consent.validVisitor!=='boolean'||
      !Number.isFinite(Date.parse(r.consent.expiresAt))||Date.parse(r.consent.expiresAt)<=now().getTime()||
      Date.parse(r.consent.expiresAt)>now().getTime()+ANALYTICS_RETENTION_SECONDS_V1*1000||
      !(r.subjectLinkRef===null||(typeof r.subjectLinkRef==='string'&&/^ah_[0-9a-f]{64}$/u.test(r.subjectLinkRef))))return null;
   return r;
  }catch{return null;}
 }
 const sessionMac=(payload:string)=>createHmac('sha256',input.secret).update('analytics-tab-session-v1.'+payload).digest();
 async function resolveBase(request:Request){const receipt=read(request);if(receipt===null||receipt.subjectLinkRef!==await subjectLink(request)||!await input.store.isConsentActive(receipt.consent,input.policy.policyVersion))return null;return receipt.consent;}
 const consent={
  async resolve(request:Request){
   const base=await resolveBase(request);if(base===null)return null;
   try{
    const token=request.headers.get(ADMIN_ANALYTICS_SESSION_HEADER_V1);if(token===null||token.length>4096||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token))return null;
    const[payload,sig]=token.split('.');const expected=sessionMac(payload!),actual=Buffer.from(sig!,'base64url');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const session=JSON.parse(Buffer.from(payload!,'base64url').toString('utf8')) as {visitorRef:string;sessionRef:string;version:string;expiresAt:string};
    if(session.visitorRef!==base.visitorRef||session.version!==base.version||!/^as_[0-9a-f]{64}$/u.test(session.sessionRef)||!Number.isFinite(Date.parse(session.expiresAt))||Date.parse(session.expiresAt)<=now().getTime()||Date.parse(session.expiresAt)>Date.parse(base.expiresAt))return null;
    return Object.freeze({...base,sessionRef:session.sessionRef});
   }catch{return null;}
  },
  async withdraw(request:Request){const receipt=read(request,false);return receipt===null?[]:[receipt.consent.visitorRef];},
 };
 const collector=createAdminAnalyticsCollectorV1({policy:input.policy,store:input.store,consent,now});
 return Object.freeze({
  consent,
  async handleRequest(request:Request):Promise<Response>{
   const url=new URL(request.url);
   if(url.origin!==input.origin||!['/api/analytics/consent','/api/analytics/session','/api/analytics/events','/api/analytics/withdraw'].includes(url.pathname)||url.search)return reply(404,'NOT_FOUND');
   if(request.method!=='POST')return reply(405,'METHOD_NOT_ALLOWED');
   if(request.headers.get('origin')!==input.origin||!request.headers.get('content-type')?.startsWith('application/json'))return reply(403,'ANALYTICS_ORIGIN_REQUIRED');
   try{
    if(!await input.allowRequest(request))return reply(429,'ANALYTICS_RATE_LIMITED');
    if(url.pathname==='/api/analytics/withdraw'){
     const response=await collector(request);
     if(response.ok)response.headers.set('Set-Cookie',ADMIN_ANALYTICS_CONSENT_COOKIE_V1+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
     return response;
    }
    if(!enabled())return reply(503,'ANALYTICS_COLLECTION_DISABLED');
    if(url.pathname==='/api/analytics/events')return collector(request);
    // A consent grant is deliberately tiny and independent from analytics payloads.
    if(Number(request.headers.get('content-length')??0)>64)return reply(413,'ANALYTICS_BODY_TOO_LARGE');
    const reader=request.body?.getReader();if(!reader)return reply(400,'ANALYTICS_BAD_CONSENT');let size=0;const chunks:Uint8Array[]=[];
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>64){await reader.cancel();return reply(413,'ANALYTICS_BODY_TOO_LARGE');}chunks.push(chunk.value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const body=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes)) as Record<string,unknown>;
    if(url.pathname==='/api/analytics/session'){
     if(body===null||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)return reply(400,'ANALYTICS_BAD_SESSION');
     const base=await resolveBase(request);if(base===null)return reply(403,'ANALYTICS_CONSENT_REQUIRED');
     // One tab lifecycle is one session. The browser stores this signed context
     // in consent-gated sessionStorage; issuing it never overwrites the visitor cookie.
     const sessionRef=deriveAdminAnalyticsReferenceV1(input.secret,'session',randomUUID());
     const session={visitorRef:base.visitorRef,sessionRef,version:base.version,expiresAt:base.expiresAt};
     const payload=Buffer.from(JSON.stringify(session)).toString('base64url');
     return reply(200,'ANALYTICS_SESSION_STARTED',{...session,sessionContext:payload+'.'+sessionMac(payload).toString('base64url')});
    }
    if(body===null||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||
       !['grant','status'].includes(String(body.decision)))return reply(400,'ANALYTICS_BAD_CONSENT');
    const existing=await resolveBase(request);
    if(body.decision==='status') {
      // Read-only verification of the existing signed HttpOnly receipt and
      // durable active consent. This never creates a visitor or grants consent.
      if(existing===null)return reply(403,'ANALYTICS_CONSENT_REQUIRED');
      return reply(200,'ANALYTICS_CONSENT_ACTIVE',{consent:existing});
    }
    const granted=existing??Object.freeze({visitorRef:deriveAdminAnalyticsReferenceV1(input.secret,'visitor',randomUUID()),
     version:ADMIN_ANALYTICS_CONSENT_VERSION_V1,granted:true,validVisitor:await input.admitVisitor(request),expiresAt:new Date(now().getTime()+ANALYTICS_RETENTION_SECONDS_V1*1000).toISOString()});
    const subjectLinkRef=await subjectLink(request);
    await input.store.bindConsent(granted,input.policy.policyVersion,subjectLinkRef);
    const response=reply(200,'ANALYTICS_CONSENT_GRANTED',{consent:granted,retentionDays:180});
    response.headers.set('Set-Cookie',ADMIN_ANALYTICS_CONSENT_COOKIE_V1+'='+encode({consent:granted,policyVersion:input.policy.policyVersion,subjectLinkRef})+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+Math.max(0,Math.floor((Date.parse(granted.expiresAt)-now().getTime())/1000)));
    return response;
   }catch{return reply(503,'ANALYTICS_CONSENT_UNAVAILABLE');}
  },
  async runMaintenance(){return input.store.purgeExpired(now().toISOString());},
 });
}
