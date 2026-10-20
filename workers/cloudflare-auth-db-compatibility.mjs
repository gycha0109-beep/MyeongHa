// Local workerd module-load and fail-closed preflight for Stage 5 Auth/DB.
// TEST-ONLY ENTRYPOINT. Not wired to wrangler.jsonc or Cloudflare Preview.
// No network connections, DB credentials, user session, cookie or production API.
// Watchtower-Track: ops
import pg from 'pg';
import { createHash, X509Certificate } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import { createNodePostgresSubjectPoolV1 } from '../apps/api/src/node-postgres-subject-pool.ts';
import {
  buildProductionPostgresStrictTlsTargetV1,
} from '../apps/api/src/production-postgres-tls-peer-verification.ts';

const HEADER = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
});

function configurationWithoutCredentialsIsDenied() {
  // This executes only the existing config parser. A rejected empty
  // config is required; never synthesize credentials or connect a pool.
  try {
    parseProductionUserDataRuntimeConfigV1(Object.freeze({}));
    return false;
  } catch {
    return true;
  }
}

export function evaluateIsolatedAuthDbCompatibility() {
  return Object.freeze({
    postgresDriverExports: typeof pg.Client === 'function' && typeof pg.Pool === 'function',
    productionPoolAdapterLoadable: typeof createNodePostgresSubjectPoolV1 === 'function',
    strictTlsAuthorityBuilderLoadable: typeof buildProductionPostgresStrictTlsTargetV1 === 'function',
    nodeCryptoAvailable: typeof X509Certificate === 'function' &&
      createHash('sha256').update('offline-only').digest('hex').length === 64,
    nodeTlsApiAvailable: typeof createSecureContext === 'function',
    missingCredentialsRejected: configurationWithoutCredentialsIsDenied(),
  });
}

export default {
  fetch(request) {
    const url = new URL(request.url);
    // Even an accidental remote deployment must never expose this probe.
    // Local Wrangler HTTP must use the loopback host and a test-only header.
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/__offline/auth-db' ||
      url.search !== '' || request.headers.get('X-Myeongha-Local-Probe') !== 'isolated-v1') {
      return new Response(null, { status: 404, headers: HEADER });
    }
    if (request.method !== 'GET') {
      return new Response(null, { status: 405, headers: { ...HEADER, Allow: 'GET' } });
    }
    const result = evaluateIsolatedAuthDbCompatibility();
    const pass = Object.values(result).every(value => value === true);
    // Return booleans only: no connection string, cookie, secret, user data or stack.
    return Response.json({ status: pass ? 'pass' : 'fail', checks: result }, {
      status: pass ? 200 : 503,
      headers: HEADER,
    });
  },
};
