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
import {
  parseProductionPostgresRuntimeConfigV1,
  parseProductionUserDataRuntimeConfigV1,
} from '../apps/api/src/production-user-data-runtime-config.ts';

const HEADERS = CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;

// Observability-only code. Do not expose readiness diagnostics to public API,
// include environment values, SQL, URLs, account identifiers, or error messages.
// Only a bounded, static category leaves this Worker through owner-only logs.
function logReadinessFailureCategoryV1(bindings) {
  let code = 'UNCLASSIFIED';
  try {
    const config = parseProductionUserDataRuntimeConfigV1(bindings);
    if (approvedCloudflarePostgresTargetV1(config, bindings)) {
      code = 'NON_USER_DATA';
    } else {
      const source = new URL(config.databaseUrl);
      const host = bindings?.MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST;
      const port = bindings?.MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT;
      const expectedLogin = typeof config.databasePrincipal === 'string' &&
        typeof host === 'string' && host.endsWith('.pooler.supabase.com')
        ? config.databasePrincipal + '.cnsfpcdiyofqvhpcegfc'
        : config.databasePrincipal;
      code = source.hostname !== host ? 'DB_HOST_MISMATCH'
        : source.port !== port ? 'DB_PORT_MISMATCH'
        : decodeURIComponent(source.username) !== expectedLogin ? 'DB_LOGIN_MISMATCH'
        : host?.endsWith('.pooler.supabase.com') && source.pathname !== '/postgres'
          ? 'DB_TENANT_PATH_MISMATCH'
          : 'DB_TARGET_MISMATCH';
    }
  } catch (error) {
    // Classify only exact known config failure text. Never log error.message,
    // cause, stack, user data, credentials, or the bound value itself.
    const message = error instanceof Error ? error.message : '';
    const name = [
      'MYEONGHA_DATABASE_URL',
      'MYEONGHA_DATABASE_PRINCIPAL',
      'MYEONGHA_DATABASE_TLS_PEER_MODE',
      'MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM',
      'MYEONGHA_SUPABASE_URL',
      'MYEONGHA_SUPABASE_API_KEY',
      'MYEONGHA_GUEST_FINGERPRINT_SECRET',
    ].find(key => message.includes(key));
    if (name) code = 'INVALID_' + name;
  }
  console.warn('CF_READINESS_PREFLIGHT_V1', code);
}


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
      if (!approvedCloudflarePostgresTargetV1(dbConfig, bindings)) {
        logReadinessFailureCategoryV1(bindings);
        return unready();
      }
    }
    if (report.capabilities.userData === 'unready') {
      logReadinessFailureCategoryV1(bindings);
    }
    return Response.json(report, {
      status: report.status === 'unready' ? 503 : 200,
      headers: HEADERS,
    });
  } catch {
    logReadinessFailureCategoryV1(bindings);
    return unready();
  }
}
