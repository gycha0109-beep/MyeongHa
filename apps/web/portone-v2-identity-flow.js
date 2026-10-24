import { getActiveBearer } from './product-auth.js';

export const WEB_PORTONE_IDENTITY_FLOW_V1 = Object.freeze({
  activeByDefault: false,
  issueRoute: '/api/identity-verifications/attempts',
  completeRoute: '/api/identity-verifications/complete',
  pendingKey: 'myeongha.portoneIdentity.pending.v1',
  redirectPath: '/my.html',
  redirectMarker: 'identityVerification',
  redirectValue: 'callback',
  preenrollment: Object.freeze({
    issueRoute: '/api/identity-verifications/pre-enrollment/attempts',
    completeRoute: '/api/identity-verifications/pre-enrollment/complete',
    capabilityRoute: '/api/identity-verifications/pre-enrollment/capability',
    pendingKey: 'myeongha.portoneIdentity.preenrollment.pending.v1',
    redirectPath: '/auth.html',
    redirectMarker: 'preenrollmentIdentity',
    redirectValue: 'callback',
  }),
});

const ID_PATTERN = /^iv[a-f0-9]{32}$/u;
const STORE_PATTERN = /^store-[A-Za-z0-9_-]{8,128}$/u;
const CHANNEL_PATTERN = /^channel-key-[A-Za-z0-9_-]{8,128}$/u;

export class WebPortOneIdentityFlowErrorV1 extends Error {
  constructor(code) {
    super('PortOne identity verification is unavailable.');
    this.name = 'WebPortOneIdentityFlowErrorV1';
    this.code = code;
  }
}
const fail = (code) => { throw new WebPortOneIdentityFlowErrorV1(code); };
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function assertIssued(value, now) {
  if (!isObject(value) ||
      !ID_PATTERN.test(value.identityVerificationId) ||
      !STORE_PATTERN.test(value.storeId) ||
      !CHANNEL_PATTERN.test(value.channelKey) ||
      typeof value.expiresAt !== 'string') return fail('INVALID_ISSUE_RESPONSE');
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 11 * 60_000) {
    return fail('INVALID_ISSUE_RESPONSE');
  }
  return Object.freeze({
    identityVerificationId: value.identityVerificationId,
    storeId: value.storeId,
    channelKey: value.channelKey,
    expiresAt: value.expiresAt,
  });
}
function assertPending(store, now, flow) {
  let value = null;
  try { value = store.getItem(flow.pendingKey); } catch { return fail('PENDING_STORAGE_UNAVAILABLE'); }
  if (typeof value !== 'string' || value.length > 300) return fail('NO_PENDING_IDENTITY');
  let data = null;
  try { data = JSON.parse(value); } catch { return fail('NO_PENDING_IDENTITY'); }
  if (!isObject(data) || !ID_PATTERN.test(data.identityVerificationId) ||
      typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) ||
      Date.parse(data.expiresAt) <= now) {
    return fail('NO_PENDING_IDENTITY');
  }
  return data;
}
function clearPending(store, flow) {
  try { store.removeItem(flow.pendingKey); } catch {}
}
function writePending(store, issued, flow) {
  try {
    store.setItem(flow.pendingKey, JSON.stringify({
      identityVerificationId: issued.identityVerificationId,
      expiresAt: issued.expiresAt,
    }));
  } catch { return fail('PENDING_STORAGE_UNAVAILABLE'); }
}
function safeRedirectUrl(baseOrigin, flow) {
  let origin;
  try { origin = new URL(baseOrigin); } catch { return fail('UNTRUSTED_ORIGIN'); }
  if (origin.protocol !== 'https:' ||
      origin.origin !== 'https://myeongha.vercel.app' ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    return fail('UNTRUSTED_ORIGIN');
  }
  const target = new URL(flow.redirectPath, origin);
  target.searchParams.set(flow.redirectMarker, flow.redirectValue);
  return target.toString();
}

/**
 * Browser SDK port must be injected by the caller. No SDK dependency or
 * provider request occurs until the server issues a short-lived owned ID.
 * This module intentionally NEVER trusts a popup/redirect success as age proof.
 */
export function createWebPortOneIdentityFlowV1(input = {}) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const resolveBearer = input.resolveBearer ?? getActiveBearer;
  const store = input.pendingStore ?? globalThis.sessionStorage;
  const now = input.now ?? Date.now;
  const sdk = input.sdk;
  const sdkFactory = input.sdkFactory;
  const origin = input.origin ?? 'https://myeongha.vercel.app';
  const unregistered = input.preenrollment === true;
  const flow = unregistered
    ? WEB_PORTONE_IDENTITY_FLOW_V1.preenrollment : WEB_PORTONE_IDENTITY_FLOW_V1;
  if (typeof fetchImpl !== 'function' || typeof resolveBearer !== 'function' ||
      !store || typeof now !== 'function') return fail('INVALID_CLIENT_SETUP');

  async function authorizedPost(route, body) {
    const credential = unregistered ? null : await resolveBearer();
    if (!unregistered && (!credential || typeof credential.token !== 'string' ||
        credential.token.length === 0 ||
        (credential.kind !== 'member' && credential.kind !== 'guest'))) return fail('AUTH_REQUIRED');
    let response;
    try {
      response = await fetchImpl(route, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(unregistered ? {} : { Authorization: 'Bearer ' + credential.token }),
        },
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        body: JSON.stringify(body),
      });
    } catch { return fail('IDENTITY_NETWORK_UNAVAILABLE'); }
    if (!response.ok) return fail('IDENTITY_UNAVAILABLE');
    let payload;
    try { payload = await response.json(); } catch { return fail('INVALID_SERVER_RESPONSE'); }
    if (!isObject(payload) || payload.ok !== true || !isObject(payload.data)) {
      return fail('INVALID_SERVER_RESPONSE');
    }
    return payload.data;
  }

  async function complete(id) {
    const data = await authorizedPost(flow.completeRoute,
      { identityVerificationId: id });
    if (data.ageBand !== 'adult' && data.ageBand !== 'free_minor') {
      return fail('INVALID_SERVER_RESPONSE');
    }
    return Object.freeze({ ageBand: data.ageBand });
  }

  return Object.freeze({
    async start() {
      // Never load a remote SDK while the server-side identity gate is OFF.
      // The approved server-owned issue must succeed before lazy SDK loading.
      if ((!sdk || typeof sdk.requestIdentityVerification !== 'function') &&
          typeof sdkFactory !== 'function') {
        return fail('SDK_UNAVAILABLE');
      }
      const redirectUrl = safeRedirectUrl(origin, flow);
      const issued = assertIssued(
        await authorizedPost(flow.issueRoute, {}), now());
      writePending(store, issued, flow);
      let providerReply;
      try {
        const approvedSdk = sdk && typeof sdk.requestIdentityVerification === 'function'
          ? sdk : await sdkFactory();
        if (!approvedSdk || typeof approvedSdk.requestIdentityVerification !== 'function') {
          return fail('SDK_UNAVAILABLE');
        }
        providerReply = await approvedSdk.requestIdentityVerification({
          storeId: issued.storeId,
          channelKey: issued.channelKey,
          identityVerificationId: issued.identityVerificationId,
          redirectUrl,
        });
      } catch {
        clearPending(store, flow);
        return fail('SDK_UNAVAILABLE');
      }
      // A successful redirect may navigate away before the Promise resolves.
      if (providerReply === undefined) {
        return Object.freeze({ kind: 'redirect_pending' });
      }
      if (!isObject(providerReply) || providerReply.code !== undefined ||
          providerReply.identityVerificationId !== issued.identityVerificationId) {
        clearPending(store, flow);
        return fail('PROVIDER_NOT_VERIFIED');
      }
      try {
        const result = await complete(issued.identityVerificationId);
        return Object.freeze({ kind: 'verified', ...result });
      } finally { clearPending(store, flow); }
    },
    async resumeFromRedirect(query) {
      let params;
      try { params = new URLSearchParams(query); } catch { return fail('INVALID_REDIRECT'); }
      if (params.getAll(flow.redirectMarker).length !== 1 ||
          params.get(flow.redirectMarker) !== flow.redirectValue ||
          params.has('code')) {
        return fail('INVALID_REDIRECT');
      }
      const pending = assertPending(store, now(), flow);
      if (params.getAll('identityVerificationId').length !== 1 ||
          params.get('identityVerificationId') !== pending.identityVerificationId) {
        return fail('IDENTITY_MISMATCH');
      }
      try {
        const result = await complete(pending.identityVerificationId);
        return Object.freeze({ kind: 'verified', ...result });
      } finally { clearPending(store, flow); }
    },
    discardPending() { clearPending(store, flow); },
  });
}
