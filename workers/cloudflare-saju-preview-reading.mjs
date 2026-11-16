import { createCloudflareSubjectPoolV1 } from './cloudflare-hyperdrive-subject-pool.mjs';
import { isCloudflareSajuKilledV1 } from './cloudflare-saju-kill-switch.mjs';
// Cloudflare Saju preview-reading adapter, separate from calculation-only.
// The existing subject/reading authorities decide all positive results.
// Watchtower-Track: ops
import {
  approvedCloudflareAuthOriginV1,
  approvedCloudflareStage5HandoffV1,
  approvedCloudflarePostgresTargetV1,
  approvedCloudflareSameOriginPostV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import { createProductionCurrentSubjectSajuPreviewReadingRuntimeV1 } from '../apps/api/src/production-current-subject-saju-preview-reading-runtime.ts';
import {
  createLocalAuthSubjectPoolV1, isIsolatedLocalAuthRequestV1, localGoTrueMemberFetchV1,
  parseLocalAuthRuntimeConfigV1,
} from '../apps/api/src/local-auth-dev-runtime.ts';
import { handleCurrentSubjectSajuPreviewReadingRequestV1 } from '../apps/api/src/current-subject-saju-preview-reading-http.ts';
import { createProductionRequestIdentityVerifierV1 } from '../apps/api/src/production-request-identity-verifier.ts';
import { createSajuPreviewReadingHttpAdapterV1 } from '../apps/api/src/saju-production-reading-http-adapter.ts';
import { isSajuAbuseAdmissionEnabledV1 } from '../apps/api/src/saju-abuse-admission-activation.ts';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import { parseProductionSajuRuntimeConfigV1 } from '../apps/api/src/production-saju-runtime-config.ts';
import {
  buildProductionNodePostgresPoolConfigV1,
} from '../apps/api/src/node-postgres-subject-pool.ts';
import { CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1 } from '../apps/api/src/cloudflare-direct-postgres-candidate.ts';

const APPROVED_MODE = 'approved-preview-reading-v1';
const SECURITY_HEADERS = CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;

function denied() {
  return new Response(null, { status: 404, headers: SECURITY_HEADERS });
}

function unavailable() {
  return Response.json({
    ok: false,
    error: {
      code: 'SAJU_PREVIEW_TEMPORARILY_UNAVAILABLE',
      messageKey: 'saju.preview_temporarily_unavailable',
      retryable: true,
    },
  }, { status: 503, headers: SECURITY_HEADERS });
}

// The producer returns one bounded JSON response, not HTML, SSE, provider
// redirects or cookies. Strip any accidental cross-origin grants.
export function fenceCloudflareSajuPreviewReadingResponseV1(candidate) {
  if (!(candidate instanceof Response)) return unavailable();
  if (candidate.status >= 300 && candidate.status < 400) return unavailable();
  if (candidate.headers.has('location') || candidate.headers.has('set-cookie')) return unavailable();
  if (candidate.status >= 200 && candidate.status < 300 && candidate.body === null) return unavailable();
  if (candidate.body !== null) {
    const type = candidate.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (type !== 'application/json' && !(type.startsWith('application/') && type.endsWith('+json'))) {
      return unavailable();
    }
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

// The Vercel handler's public route is reused verbatim. Never invoke the
// Preview interpreter without independent exact origin, TLS/RLS, DB target
// and Saju producer admission; no fallthrough to Vercel is possible.
export async function tryHandleCloudflareApprovedSajuPreviewReadingV1(request, bindings, route) {
  if (route?.id !== 'rewrite.saju.preview') return null;
  // Emergency disable must be checked before Auth/DB, producer config or
  // any Saju request body processing. Both modes share one operator switch.
  if (isCloudflareSajuKilledV1(bindings)) return null;
  const origin = approvedCloudflareAuthOriginV1(request, bindings);
  if (origin === null) return null;
  const localAuth = isIsolatedLocalAuthRequestV1(request, bindings);
  if (!localAuth && (bindings?.MYEONGHA_CLOUDFLARE_SAJU_PREVIEW_MODE !== APPROVED_MODE ||
      !approvedCloudflareStage5HandoffV1(bindings, origin, false))) return null;
  if (new URL(request.url).search !== '') return denied();
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { ...SECURITY_HEADERS, Allow: 'POST' } });
  }
  if (!approvedCloudflareSameOriginPostV1(request, origin)) return denied();

  let config;
  let localConfig;
  try {
    if (localAuth) {
      localConfig = parseLocalAuthRuntimeConfigV1(bindings);
      if (bindings.MYEONGHA_LOCAL_SAJU_SERVICE_ORIGIN !== 'http://127.0.0.1:15434' ||
          typeof bindings.MYEONGHA_LOCAL_SAJU_SERVICE_BEARER !== 'string' ||
          bindings.MYEONGHA_LOCAL_SAJU_SERVICE_BEARER.length < 32) return unavailable();
    } else {
      config = parseProductionUserDataRuntimeConfigV1(bindings);
      parseProductionSajuRuntimeConfigV1(bindings);
      if (!approvedCloudflarePostgresTargetV1(config, bindings)) return unavailable();
      const tls = buildProductionNodePostgresPoolConfigV1(
        config, CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1,
      );
      if (tls.max !== 1 || !tls.ssl || typeof tls.ssl !== 'object' ||
          tls.ssl.rejectUnauthorized !== true) return unavailable();
    }
  } catch {
    return unavailable();
  }

  let runtime;
  let subjectPool;
  let result;
  try {
    subjectPool = localAuth
      ? createLocalAuthSubjectPoolV1(localConfig, CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1)
      : createCloudflareSubjectPoolV1(config, bindings, CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    if (localAuth) {
      result = await handleCurrentSubjectSajuPreviewReadingRequestV1({
        request, requestId: crypto.randomUUID(), serverTime: new Date().toISOString(),
        identityEvidenceVerifier: createProductionRequestIdentityVerifierV1({
          config: localConfig.userData, memberFetchImpl: localGoTrueMemberFetchV1(localConfig),
        }),
        pool: subjectPool,
        sajuAdapter: createSajuPreviewReadingHttpAdapterV1({
          baseUrl: bindings.MYEONGHA_LOCAL_SAJU_SERVICE_ORIGIN,
          bearerToken: bindings.MYEONGHA_LOCAL_SAJU_SERVICE_BEARER,
        }),
      });
    } else {
      runtime = createProductionCurrentSubjectSajuPreviewReadingRuntimeV1({
        env: bindings, pool: subjectPool,
        sajuAbuseAdmissionEnabled: isSajuAbuseAdmissionEnabledV1(bindings),
      });
      result = await runtime.handleRequest({
        request, requestId: crypto.randomUUID(), serverTime: new Date().toISOString(),
      });
    }
  } catch {
    result = unavailable();
  }

  let closed = true;
  try { await runtime?.close(); } catch { closed = false; }
  try { await subjectPool?.close(); } catch { closed = false; }
  if (!closed) return unavailable();
  return fenceCloudflareSajuPreviewReadingResponseV1(result);
}
