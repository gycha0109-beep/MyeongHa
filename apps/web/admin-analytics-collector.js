// Explicit opt-in integration only. Default initialization does no I/O, writes
// no cookies/storage, reads no location/referrer, and generates no identifier.
const CLIENT_EVENTS = new Set(['LANDING_VIEWED','ENTERED_HALL','CHARACTER_SELECTED','BIRTH_RECORD_STARTED','MEMORY_PROPOSED','RETURN_PUSH_OPENED',
  'VISIT_STARTED','PAGE_VIEWED','SIGNUP_STARTED','PRODUCT_VIEWED','CHECKOUT_STARTED','RESULT_VIEWED','SATISFACTION_SUBMITTED']);
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;
export function createMyeonghaAnalyticsCollectorV1(options = {}) {
  const policy = options.policy;
  const enabled = options.enabled === true && policy?.approved === true &&
    KEY.test(policy.approvalRef ?? '') && KEY.test(policy.policyVersion ?? '') &&
    Number.isSafeInteger(policy.retentionSeconds) && policy.retentionSeconds > 0 &&
    policy.deletionBindingVerified === true && KEY.test(policy.validVisitPolicyVersion ?? '');
  let consent = null;
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  return Object.freeze({
    status: enabled ? 'awaiting_consent' : 'disabled',
    setConsent(value) {
      if (!enabled) return false;
      if (!value || value.granted !== true || !/^av_[0-9a-f]{64}$/u.test(value.visitorRef ?? '') ||
          !/^as_[0-9a-f]{64}$/u.test(value.sessionRef ?? '') || !KEY.test(value.version ?? '') ||
          !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) { consent = null; return false; }
      consent = { ...value }; return true;
    },
    async track(eventName, payload = {}, eventId) {
      if (!enabled) return { status: 'disabled' };
      if (!consent || Date.parse(consent.expiresAt) <= Date.now()) return { status: 'consent_required' };
      if (!CLIENT_EVENTS.has(eventName) || !policy.approvedEvents?.includes(eventName)) return { status: 'unregistered_event' };
      if (Object.keys(payload).some(key => !['productKey','pageKey','campaignKey','channelKey','purchaseRef','score'].includes(key))) return { status: 'invalid_metadata' };
      for (const key of ['pageKey','productKey']) if (payload[key] !== undefined && !KEY.test(payload[key])) return { status: 'invalid_metadata' };
      if (payload.campaignKey !== undefined && !policy.approvedCampaignKeys?.includes(payload.campaignKey)) return { status: 'unregistered_campaign' };
      if (payload.channelKey !== undefined && !policy.approvedChannelKeys?.includes(payload.channelKey)) return { status: 'unregistered_channel' };
      if (payload.purchaseRef !== undefined && !/^ap_[0-9a-f]{64}$/u.test(payload.purchaseRef)) return { status: 'invalid_metadata' };
      if (payload.score !== undefined && (!Number.isInteger(payload.score) || payload.score < 1 || payload.score > 5)) return { status: 'invalid_metadata' };
      const id = eventId ?? crypto.randomUUID();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) return { status: 'invalid_event_id' };
      try {
        const response = await fetchImpl('/api/analytics/events', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId:id,eventName,eventSchemaVersion:'admin-analytics-pipeline-v1',
            occurredAt:new Date().toISOString(),anonymousOrSubjectRef:consent.visitorRef,sessionRef:consent.sessionRef,client:'web',payload }) });
        return { status: response.ok ? 'recorded' : 'rejected', eventId:id };
      } catch { return { status: 'unavailable',eventId:id }; }
    },
    async withdraw() {
      const hadConsent = consent !== null; consent = null;
      if (!enabled || !hadConsent) return { status: 'local_consent_cleared' };
      try { const response = await fetchImpl('/api/analytics/withdraw',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:'{}'});
        return {status:response.ok?'withdrawn':'withdrawal_pending'};
      } catch { return {status:'withdrawal_pending'}; }
    },
  });
}

export function initializeMyeonghaAnalyticsV1(options = {}) {
  return createMyeonghaAnalyticsCollectorV1(options);
}
