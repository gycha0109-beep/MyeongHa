import { Client } from 'pg';
import { handleCurrentSubjectSajuCalculationRequestV1 } from '../../../apps/api/src/current-subject-saju-calculation-http.ts';
import { SupabaseMemberIdentityEvidenceVerifierV1 } from '../../../apps/api/src/supabase-member-identity-verifier.ts';
import { createSajuProductionCalculationHttpAdapterV1 } from '../../../apps/api/src/saju-production-calculation-http-adapter.ts';

function loopbackOrigin(value) {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u.test(value)) {
    throw Error('Only disposable loopback origins are supported');
  }
  return value;
}

function isolatedDatabaseConfig(binding) {
  const { connectionString, host } = binding;
  const url = new URL(connectionString);
  // Wrangler pins the upstream to loopback. Inside workerd, the binding exposes
  // a virtual hostname that the runtime maps to that upstream.
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== host ||
      url.username !== 'myeongha_ops_phase11_login' || url.pathname !== '/postgres' ||
      !['', '?sslmode=disable'].includes(url.search) || url.hash) {
    throw Error('Only the temporary PostgreSQL fixture is supported');
  }
  return { connectionString, ssl: false, connectionTimeoutMillis: 2000, query_timeout: 2000 };
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET') {
      return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
    }
    if (path !== '/api/me/saju/calculation' || request.method !== 'POST') {
      return new Response(null, { status: 404 });
    }
    const authOrigin = loopbackOrigin(env.MH_OPS_WORKERD_AUTH_ORIGIN);
    const sajuOrigin = loopbackOrigin(env.MH_OPS_WORKERD_SAJU_ORIGIN);
    const dbConfig = isolatedDatabaseConfig(env.HYPERDRIVE);
    const identityEvidenceVerifier = new SupabaseMemberIdentityEvidenceVerifierV1({
      supabaseOrigin: 'https://synthetic.invalid',
      supabaseApiKey: 'synthetic-api-key-transport-material-long-enough',
      fetchImpl: (_url, init) => fetch(authOrigin + '/user', { ...init, redirect: 'manual' }),
      timeoutMs: 2000,
    });
    const sajuAdapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: sajuOrigin, bearerToken: 'synthetic-saju-only-bearer', timeoutMs: 3000,
    });
    let client;
    const pool = {
      async connect() {
        client = new Client(dbConfig);
        await client.connect();
        const principal = await client.query('SELECT session_user AS role');
        if (principal.rows[0]?.role !== 'myeongha_ops_phase11_login') throw Error('Unexpected fixture login');
        return { query: (sql, values) => client.query(sql, values ? [...values] : []), release() {} };
      },
    };
    try {
      const result = await handleCurrentSubjectSajuCalculationRequestV1({
        request, requestId: crypto.randomUUID(), serverTime: new Date().toISOString(),
        identityEvidenceVerifier, pool, sajuAdapter,
      });
      const headers = new Headers(result.headers);
      headers.set('cache-control', 'no-store');
      return new Response(result.body, { status: result.status, headers });
    } finally {
      if (client) ctx.waitUntil(client.end().catch(() => {}));
    }
  },
};
