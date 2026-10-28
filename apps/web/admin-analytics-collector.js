// Explicit opt-in integration only. Default initialization does no I/O, writes
// no cookies/storage, reads no location/referrer, and generates no identifier.
const CLIENT_EVENTS = new Set(['LANDING_VIEWED','ENTERED_HALL','CHARACTER_SELECTED','BIRTH_RECORD_STARTED','MEMORY_PROPOSED','RETURN_PUSH_OPENED',
  'VISIT_STARTED','PAGE_VIEWED','SIGNUP_STARTED','PRODUCT_VIEWED','CHECKOUT_STARTED','RESULT_VIEWED','SATISFACTION_SUBMITTED']);
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;
export function createMyeonghaAnalyticsCollectorV1(options = {}) {
  const policy = options.policy;
  const enabled = options.enabled === true && policy?.approved === true &&
    KEY.test(policy.approvalRef ?? '') && KEY.test(policy.policyVersion ?? '') &&
    policy.retentionSeconds === 180 * 86400 &&
    policy.deletionBindingVerified === true && KEY.test(policy.validVisitPolicyVersion ?? '');
  let consent = null;
  let sessionContext = null;
  let consentGeneration=0;
  const prepared = new Map();
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  const sessionKey='myeongha.analytics.tab-session.v1';
  const storage=()=>options.sessionStorage??globalThis.sessionStorage;
  const validSession=value=>consent&&value&&value.visitorRef===consent.visitorRef&&value.version===consent.version&&/^as_[0-9a-f]{64}$/u.test(value.sessionRef??'')&&
    typeof value.sessionContext==='string'&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value.sessionContext)&&Number.isFinite(Date.parse(value.expiresAt))&&Date.parse(value.expiresAt)>Date.now()&&Date.parse(value.expiresAt)<=Date.parse(consent.expiresAt);
  async function startSession(){
    if(!enabled)return {status:'disabled'};
    if(!consent||Date.parse(consent.expiresAt)<=Date.now())return {status:'consent_required'};
    const generation=consentGeneration;
    // Storage is touched only after a server consent grant (or a trusted
    // consent restoration). sessionStorage defines one browser-tab lifecycle.
    try{const cached=JSON.parse(storage()?.getItem(sessionKey)??'null');if(validSession(cached)){sessionContext=cached.sessionContext;consent={...consent,sessionRef:cached.sessionRef};return {status:'session_resumed'};}}catch{/* Fall back to a signed in-memory context. */}
    try{
      const response=await fetchImpl('/api/analytics/session',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:'{}'});
      if(!response.ok)return {status:'unavailable'};const session=await response.json();if(generation!==consentGeneration)return {status:'cancelled'};if(!validSession(session))return {status:'unavailable'};
      sessionContext=session.sessionContext;consent={...consent,sessionRef:session.sessionRef};prepared.clear();
      try{storage()?.setItem(sessionKey,JSON.stringify(session));}catch{/* No persistent tracking fallback. */}
      return {status:'session_started'};
    }catch{return {status:'unavailable'};}
  }
  return Object.freeze({
    status: enabled ? 'awaiting_consent' : 'disabled',
    startSession,
    async grantConsent() {
      if (!enabled) return {status:'disabled'};
      const generation=++consentGeneration;consent=null;sessionContext=null;
      try {
        const response=await fetchImpl('/api/analytics/consent',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:'grant'})});
        if(!response.ok)return {status:'unavailable'};
        const data=await response.json();if(generation!==consentGeneration)return {status:'cancelled'};const value=data.consent;
        if(!value||value.granted!==true||!/^av_[0-9a-f]{64}$/u.test(value.visitorRef??'')||!KEY.test(value.version??'')||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now())return {status:'unavailable'};
        consent={...value};await startSession();return {status:generation===consentGeneration?'granted':'cancelled'};
      }catch{return {status:'unavailable'};}
    },
    async restoreConsent() {
      // Only an explicitly configured, approved caller can ask the server
      // whether its existing HttpOnly receipt is still active. A missing or
      // revoked receipt creates no visitor, identifier, or tracked event.
      if (!enabled) return {status:'disabled'};
      const generation=++consentGeneration;
      consent=null;sessionContext=null;prepared.clear();
      try {
        const response=await fetchImpl('/api/analytics/consent',{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({decision:'status'}),
        });
        if(generation!==consentGeneration)return{status:'cancelled'};
        if(response.status===403)return{status:'consent_required'};
        if(!response.ok)return{status:'unavailable'};
        const data=await response.json();
        if(generation!==consentGeneration)return{status:'cancelled'};
        const value=data.consent;
        if(data.code!=='ANALYTICS_CONSENT_ACTIVE'||!value||value.granted!==true||
           !/^av_[0-9a-f]{64}$/u.test(value.visitorRef??'')||
           !KEY.test(value.version??'')||!Number.isFinite(Date.parse(value.expiresAt))||
           Date.parse(value.expiresAt)<=Date.now())return{status:'unavailable'};
        consent={...value};
        const session=await startSession();
        if(generation!==consentGeneration)return{status:'cancelled'};
        return session.status==='session_started'||session.status==='session_resumed'
          ?{status:'restored'}:{status:'session_unavailable'};
      }catch{return{status:'unavailable'};}
    },
    setConsent(value) {
      if (!enabled) return false;
      if (!value || value.granted !== true || !/^av_[0-9a-f]{64}$/u.test(value.visitorRef ?? '') ||
          !KEY.test(value.version ?? '') ||
          !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) { consent = null; return false; }
      consentGeneration++;consent = { ...value }; sessionContext=null; return true;
    },
    async track(eventName, payload = {}, eventId) {
      if (!enabled) return { status: 'disabled' };
      if (!consent || Date.parse(consent.expiresAt) <= Date.now()) return { status: 'consent_required' };
      if (sessionContext===null) return {status:'session_required'};
      if (!CLIENT_EVENTS.has(eventName) || !policy.approvedEvents?.includes(eventName)) return { status: 'unregistered_event' };
      if (Object.keys(payload).some(key => !['productKey','pageKey','campaignKey','channelKey','purchaseRef','score'].includes(key))) return { status: 'invalid_metadata' };
      for (const key of ['pageKey','productKey']) if (payload[key] !== undefined && !KEY.test(payload[key])) return { status: 'invalid_metadata' };
      if (payload.campaignKey !== undefined && !policy.approvedCampaignKeys?.includes(payload.campaignKey)) return { status: 'unregistered_campaign' };
      if (payload.channelKey !== undefined && !policy.approvedChannelKeys?.includes(payload.channelKey)) return { status: 'unregistered_channel' };
      if (payload.purchaseRef !== undefined && !/^ap_[0-9a-f]{64}$/u.test(payload.purchaseRef)) return { status: 'invalid_metadata' };
      if (payload.score !== undefined && (!Number.isInteger(payload.score) || payload.score < 1 || payload.score > 5)) return { status: 'invalid_metadata' };
      const id = eventId ?? crypto.randomUUID();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) return { status: 'invalid_event_id' };
      const normalizedPayload=Object.fromEntries(Object.keys(payload).sort().map(key=>[key,payload[key]]));
      const identity=JSON.stringify({eventName,payload:normalizedPayload,visitor:consent.visitorRef,session:consent.sessionRef});
      const previous=prepared.get(id);
      if(previous&&previous.identity!==identity)return {status:'conflicting_event_id',eventId:id};
      const body=previous?.body??JSON.stringify({eventId:id,eventName,eventSchemaVersion:'admin-analytics-pipeline-v1',occurredAt:new Date().toISOString(),anonymousOrSubjectRef:consent.visitorRef,sessionRef:consent.sessionRef,client:'web',payload:normalizedPayload});
      prepared.set(id,{identity,body});if(prepared.size>100)prepared.delete(prepared.keys().next().value);
      try {
        const response = await fetchImpl('/api/analytics/events', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json','X-MyeongHa-Analytics-Session':sessionContext }, body });
        return { status: response.ok ? 'recorded' : 'rejected', eventId:id };
      } catch { return { status: 'unavailable',eventId:id }; }
    },
    async withdraw() {
      consentGeneration++;consent = null; sessionContext=null; prepared.clear();
      // A reload may leave only the server HttpOnly receipt. Withdrawal must
      // still reach the server even when this tab has no in-memory consent.
      // After collection is switched off, an explicitly offered withdrawal
      // control must still be able to erase previously granted server consent.
      // Default unconfigured initialization still performs no request.
      if (!enabled && options.withdrawalAvailable !== true) return { status: 'local_consent_cleared' };
      try{storage()?.removeItem(sessionKey);}catch{/* Explicit withdrawal still continues on the server. */}
      try { const response = await fetchImpl('/api/analytics/withdraw',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:'{}'});
        return {status:response.ok?'withdrawn':'withdrawal_pending'};
      } catch { return {status:'withdrawal_pending'}; }
    },
  });
}

export function initializeMyeonghaAnalyticsV1(options = {}) {
  return createMyeonghaAnalyticsCollectorV1(options);
}

/** Mount only after the service's explicit collection activation. No implied
 * consent or collection on page entry; each grant requires a user click. */
export function mountMyeonghaAnalyticsConsentV1(options={}) {
  if(options.enabled!==true && options.withdrawalAvailable!==true)return null;
  const collector=createMyeonghaAnalyticsCollectorV1(options);
  const withdrawalOnly=collector.status==='disabled';
  if(withdrawalOnly && options.withdrawalAvailable!==true)return null;
  const doc=options.documentImpl??document;const section=doc.createElement('section');section.setAttribute('aria-label','제품 분석 동의');
  const description=doc.createElement('p');description.textContent='선택: 방문·페이지·가입·구매 흐름을 분석합니다. 출생정보·대화·결제 원문은 수집하지 않으며 제품 분석 이벤트는 최대 180일 보관합니다. 동의하지 않아도 서비스를 이용할 수 있습니다.';
  const grant=doc.createElement('button');grant.type='button';grant.textContent='제품 분석 동의';
  const withdraw=doc.createElement('button');withdraw.type='button';withdraw.textContent='분석 동의 철회';
  const status=doc.createElement('p');status.setAttribute('role','status');
  grant.addEventListener('click',async()=>{grant.disabled=true;const result=await collector.grantConsent();status.textContent=result.status==='granted'?'분석 동의가 저장되었습니다.':'분석 동의를 저장할 수 없습니다.';grant.disabled=false;});
  withdraw.addEventListener('click',async()=>{const result=await collector.withdraw();status.textContent=result.status==='withdrawn'||result.status==='local_consent_cleared'?'분석 수집을 중단했습니다.':'추가 수집을 중단했습니다. 서버 삭제 확인이 필요합니다.';});
  if(withdrawalOnly)description.textContent='현재 제품 분석 수집은 비활성입니다. 이전에 허용한 수집이 있다면 여기에서 동의를 철회할 수 있습니다.';
  section.append(description,...(withdrawalOnly?[]:[grant]),withdraw,status);doc.body.append(section);return collector;
}
