// Cloudflare calculation-only adapter. Independent explicit approval after
// Auth/DB origin admission; absent bindings leave the public route at 404.
// Never activate Reading/LLM, face image processing, or commerce here.
// Watchtower-Track: ops
import {
  approvedCloudflareAuthOriginV1,
  approvedCloudflareSameOriginPostV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import { createProductionCurrentSubjectSajuCalculationRuntimeV1 } from '../apps/api/src/production-current-subject-saju-calculation-runtime.ts';
import { CURRENT_SUBJECT_SAJU_CALCULATION_HTTP_BINDINGS_V1 } from '../apps/api/src/current-subject-saju-calculation-http.ts';
import { hasRequestBodyWithoutDrainingV1 } from '../apps/api/src/request-body-presence-probe.ts';
import { IngressRequestBodyCompletionDeadlineExceededV1 } from '../apps/api/src/ingress-request-body-deadline.ts';

const APPROVED_CALCULATION_MODE = 'approved-calculation-only-v1';
const SECURITY_HEADERS = CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;

function denied() {
  return new Response(null, { status: 404, headers: SECURITY_HEADERS });
}

function unavailable() {
  return Response.json({
    ok: false,
    error: { code: 'SAJU_SERVICE_UNAVAILABLE', messageKey: 'saju.service_unavailable', retryable: true },
  }, { status: 503, headers: SECURITY_HEADERS });
}

// Calculation-only egress must not transport Reading, HTML, redirects,
// streaming event MIME or session mutations from a defective API handler.
export function fenceCloudflareApprovedSajuResponseV1(candidate) {
  if (!(candidate instanceof Response)) return unavailable();
  if (candidate.status >= 300 && candidate.status < 400) return unavailable();
  if (candidate.headers.has('location') || candidate.headers.has('set-cookie')) return unavailable();
  if (candidate.status >= 200 && candidate.status < 300 && candidate.body === null) return unavailable();

  if (candidate.body !== null) {
    const contentType = candidate.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const isJson = contentType === 'application/json' ||
      (contentType.startsWith('application/') && contentType.endsWith('+json'));
    if (!isJson) return unavailable();
  }

  const headers = new Headers(candidate.headers);
  for (const key of [...headers.keys()]) {
    if (key.toLowerCase().startsWith('access-control-')) headers.delete(key);
  }
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(candidate.body, {
    status: candidate.status,
    statusText: candidate.statusText,
    headers,
  });
}

async function bodyPresenceBoundRequest(request) {
  // The existing calculation ingress accepts no caller-selected calculation
  // payload. Its Vercel route similarly passes only a body-presence marker,
  // preserving rejection of non-empty bodies without retaining raw bytes.
  const hasBody = await hasRequestBodyWithoutDrainingV1(request);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.delete('transfer-encoding');
  return new Request(request.url, {
    method: 'POST',
    headers,
    ...(hasBody ? { body: new Uint8Array([1]) } : {}),
  });
}

/** @returns {Promise<Response|null>} null keeps the deny-first 404. */
export async function tryHandleCloudflareApprovedSajuCalculationV1(request, bindings, route) {
  if (route?.id !== 'api.me.saju.calculation') return null;
  // Auth/DB subject resolution must be separately approved before calculation.
  const origin = approvedCloudflareAuthOriginV1(request, bindings);
  if (origin === null || bindings?.MYEONGHA_CLOUDFLARE_SAJU_MODE !== APPROVED_CALCULATION_MODE) {
    return null;
  }
  if (new URL(request.url).search !== '') return denied();
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { ...SECURITY_HEADERS, Allow: 'POST' } });
  }
  if (!approvedCloudflareSameOriginPostV1(request, origin)) return denied();

  const requestId = crypto.randomUUID();
  let runtime;
  let result;
  try {
    const canonicalRequest = await bodyPresenceBoundRequest(request);
    // The production runtime owns server-trusted Member/Guest verification,
    // canonical Birth revision selection, restricted Postgres and the
    // calculation-only HTTPS producer. Per-request lifetime prevents
    // cross-request pg connection reuse on Workers.
    runtime = createProductionCurrentSubjectSajuCalculationRuntimeV1({ env: bindings });
    result = await runtime.handleRequest({
      request: canonicalRequest,
      requestId,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    result = error instanceof IngressRequestBodyCompletionDeadlineExceededV1
      ? Response.json({
          ok: false,
          error: { code: 'REQUEST_BODY_TIMEOUT', messageKey: 'auth.request_body_timeout', retryable: false },
          meta: {
            apiContractVersion: CURRENT_SUBJECT_SAJU_CALCULATION_HTTP_BINDINGS_V1.apiContractVersion,
            requestId,
          },
        }, { status: 408, headers: SECURITY_HEADERS })
      : unavailable();
  }
  try {
    await runtime?.close();
  } catch {
    return unavailable();
  }

  return fenceCloudflareApprovedSajuResponseV1(result);
}
