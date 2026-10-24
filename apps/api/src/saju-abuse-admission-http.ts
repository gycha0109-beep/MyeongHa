import { fingerprintSajuAbuseClientV1, type SajuAbuseObservedRouteIdV1 } from './saju-abuse-observability.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export interface SajuAbuseAdmissionPolicyV1 {
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly windowSeconds: number;
  readonly requestLimit: number;
  readonly blockedCountSaturation: number;
  readonly retryAfterMaximumSeconds: number;
  readonly cleanupRetentionSeconds: number;
}

export interface SajuAbuseAdmissionResultV1 {
  readonly allowed: boolean;
  readonly requestCount: number;
  readonly resetAt: string;
  readonly evaluatedAt: string;
  readonly policy: SajuAbuseAdmissionPolicyV1;
}

export interface SajuAbuseAdmissionPortV1 {
  admit(input: {
    readonly routeId: SajuAbuseObservedRouteIdV1;
    readonly clientKey: string;
    /** Guest transport evidence still needs a live-session check before allocating counters. Never persist this evidence. */
    readonly evidence: VerifiedSubjectIdentityEvidenceV1;
  }): Promise<SajuAbuseAdmissionResultV1 | null>;
}

/** Server composition only. No default numeric policy or request-owned configuration. */
export interface SajuAbuseAdmissionGateV1 {
  readonly admissionPort: SajuAbuseAdmissionPortV1;
  readonly secret: string;
}

/** Shared result admission: DB adapter validates before COMMIT; HTTP uses the same contract. */
export function requireSajuAbuseAdmissionResultV1(value: SajuAbuseAdmissionResultV1): SajuAbuseAdmissionResultV1 {
  const policy = { ...value.policy };
  if (typeof policy.policyVersion !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(policy.policyVersion) ||
    typeof policy.policyHash !== 'string' || !/^[a-f0-9]{64}$/u.test(policy.policyHash) ||
    ![policy.windowSeconds, policy.requestLimit, policy.blockedCountSaturation, policy.retryAfterMaximumSeconds, policy.cleanupRetentionSeconds]
      .every((item) => Number.isSafeInteger(item) && item > 0) ||
    policy.blockedCountSaturation <= policy.requestLimit || policy.cleanupRetentionSeconds < policy.windowSeconds ||
    policy.windowSeconds > Number.MAX_SAFE_INTEGER / 1000 ||
    typeof value.allowed !== 'boolean' || !Number.isSafeInteger(value.requestCount) ||
    value.requestCount < 1 || value.requestCount > policy.blockedCountSaturation ||
    value.allowed !== (value.requestCount <= policy.requestLimit) ||
    typeof value.resetAt !== 'string' || !Number.isFinite(Date.parse(value.resetAt)) ||
    typeof value.evaluatedAt !== 'string' || !Number.isFinite(Date.parse(value.evaluatedAt)) ||
    Date.parse(value.resetAt) <= Date.parse(value.evaluatedAt) ||
    Date.parse(value.resetAt) - Date.parse(value.evaluatedAt) > policy.windowSeconds * 1000) {
    throw new Error('Invalid Saju admission authority result.');
  }
  return Object.freeze({ allowed: value.allowed, requestCount: value.requestCount,
    resetAt: new Date(value.resetAt).toISOString(), evaluatedAt: new Date(value.evaluatedAt).toISOString(), policy: Object.freeze(policy) });
}

function errorResponse(requestId: string, code: 'AUTH_REQUIRED' | 'RATE_LIMITED' | 'SAJU_ADMISSION_UNAVAILABLE', retryAfter?: number): Response {
  return Response.json({
    ok: false,
    error: { code, messageKey: code === 'AUTH_REQUIRED' ? 'auth.required' : `saju.${code.toLowerCase()}`, retryable: code === 'SAJU_ADMISSION_UNAVAILABLE' },
    meta: { apiContractVersion: 'v0.9', requestId },
  }, {
    status: code === 'AUTH_REQUIRED' ? 401 : code === 'RATE_LIMITED' ? 429 : 503,
    headers: { 'Cache-Control': 'no-store', ...(retryAfter === undefined ? {} : { 'Retry-After': String(retryAfter) }) },
  });
}

function cancelBody(request: Request): void {
  if (request.body === null || request.bodyUsed) return;
  try { void request.body.cancel().catch(() => undefined); } catch { /* Best effort. */ }
}

/** Returns null only after successful admission. Never retries an uncertain admission. */
export async function admitSajuAbuseHttpRequestV1(input: {
  readonly request: Request;
  readonly requestId: string;
  readonly routeId: SajuAbuseObservedRouteIdV1;
  readonly evidence: VerifiedSubjectIdentityEvidenceV1;
  readonly gate: SajuAbuseAdmissionGateV1;
}): Promise<Response | null> {
  let response: Response;
  try {
    const { admissionPort, secret } = input.gate;
    const clientKey = fingerprintSajuAbuseClientV1({ evidence: input.evidence, secret });
    const result = await admissionPort.admit({ routeId: input.routeId, clientKey, evidence: input.evidence });
    if (result === null) {
      cancelBody(input.request);
      return errorResponse(input.requestId, 'AUTH_REQUIRED');
    }
    const admission = requireSajuAbuseAdmissionResultV1(result);
    const policy = admission.policy;
    const resetAt = Date.parse(admission.resetAt);
    // Reset and evaluation time come from the same DB authority, not an independent API clock.
    const now = Date.parse(admission.evaluatedAt);
    if (admission.allowed) return null;
    const retryAfter = Math.min(policy.retryAfterMaximumSeconds, Math.ceil((resetAt - now) / 1000));
    if (!Number.isSafeInteger(retryAfter) || retryAfter < 1 || retryAfter > policy.retryAfterMaximumSeconds) {
      throw new Error('Invalid Saju admission retry boundary.');
    }
    response = errorResponse(input.requestId, 'RATE_LIMITED', retryAfter);
  } catch {
    response = errorResponse(input.requestId, 'SAJU_ADMISSION_UNAVAILABLE');
  }
  cancelBody(input.request);
  return response;
}
