// Cloudflare production readiness configuration preflight parity.
// This endpoint NEVER probes PostgreSQL or invokes the private TLS canary.
// Watchtower-Track: ops
import {
  approvedCloudflareAuthOriginV1,
  approvedCloudflareStage5HandoffV1,
  approvedCloudflarePostgresTargetV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import { evaluateProductionReadinessV1 } from '../apps/api/src/production-readiness.ts';
import { parseProductionPostgresRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';

const HEADERS = CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;

function unready() {
  return Response.json({
    status: 'unready',
    capabilities: {
      userData: 'unready',
      sajuCalculation: 'degraded',
      sajuProductReading: 'blocked_by_authority',
      characterSajuSp2: 'disabled',
    },
  }, { status: 503, headers: HEADERS });
}

export async function tryHandleCloudflareReadinessV1(request, bindings, route) {
  if (route?.id !== 'api.readiness') return null;
  const origin = approvedCloudflareAuthOriginV1(request, bindings);
  if (origin === null || !approvedCloudflareStage5HandoffV1(bindings, origin, false)) {
    return null;
  }
  const url = new URL(request.url);
  if (url.search !== '' || url.hash !== '') {
    return new Response(null, { status: 404, headers: HEADERS });
  }
  if (request.method !== 'GET') {
    // The Vercel-only private POST TLS canary is intentionally NOT public.
    return new Response(null, {
      status: 405,
      headers: { ...HEADERS, Allow: 'GET' },
    });
  }

  try {
    const report = evaluateProductionReadinessV1(bindings);
    // A syntactically valid configuration on a *different* PostgreSQL host
    // cannot be described as ready on this Worker.
    if (report.capabilities.userData === 'ready') {
      const dbConfig = parseProductionPostgresRuntimeConfigV1(bindings);
      if (!approvedCloudflarePostgresTargetV1(dbConfig, bindings)) return unready();
    }
    return Response.json(report, {
      status: report.status === 'unready' ? 503 : 200,
      headers: HEADERS,
    });
  } catch {
    return unready();
  }
}
