import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';

function reply(status: number, error: string) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}
function secure(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control', 'no-store');
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'no-referrer');
  result.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
  return result;
}
function bareHttps(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid hosted origin');
  return url.origin;
}

/** Access protects assets; Supabase Owner authorization still protects every API. */
export function createAdminHostedHttpV1(input: {
  readonly origin: string;
  readonly memberAuthOrigin: string;
  readonly verifyAccess: (request: Request) => Promise<boolean>;
  readonly allowRequest: () => Promise<boolean>;
  readonly api: (request: Request) => Promise<Response>;
  readonly assets: (request: Request) => Promise<Response>;
  readonly fetchImpl?: typeof fetch;
}) {
  const origin = bareHttps(input.origin); const memberOrigin = bareHttps(input.memberAuthOrigin);
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.origin !== origin) return secure(reply(421, 'ADMIN_ORIGIN_REQUIRED'));
      if (!await input.verifyAccess(request)) return secure(reply(403, 'ADMIN_ACCESS_REQUIRED'));
      if (!await input.allowRequest()) {
        const limited = reply(429, 'ADMIN_RATE_LIMITED'); limited.headers.set('Retry-After', '60'); return secure(limited);
      }
      if (request.headers.has('origin') && request.headers.get('origin') !== origin) return secure(reply(403, 'ADMIN_ORIGIN_REQUIRED'));
      if (url.pathname === '/api/auth/sign-in') {
        if (request.method !== 'POST' || url.search) return secure(reply(405, 'METHOD_NOT_ALLOWED'));
        if (request.headers.get('origin') !== origin || !request.headers.get('content-type')?.startsWith('application/json')) return secure(reply(403, 'ADMIN_ORIGIN_REQUIRED'));
        const signal = AbortSignal.timeout(8000);
        const text = await readBoundedUpstreamJsonTextV1(new Response(request.body), { maximumBodyBytes: 16_384, signal });
        const body: unknown = JSON.parse(text);
        if (body === null || typeof body !== 'object' || Array.isArray(body)) return secure(reply(400, 'ADMIN_INVALID_CREDENTIALS'));
        const record = body as Record<string, unknown>;
        if (Object.keys(record).some(key => !['email','password'].includes(key)) || typeof record.email !== 'string' || record.email.length > 254 ||
            typeof record.password !== 'string' || !record.password.length || record.password.length > 1024) return secure(reply(400, 'ADMIN_INVALID_CREDENTIALS'));
        const response = await (input.fetchImpl ?? fetch)(memberOrigin + '/api/auth/sign-in', { method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-MyeongHa-Auth-Transport': 'web-cookie-v1' },
          body: JSON.stringify({ email: record.email, password: record.password }), redirect: 'manual', cache: 'no-store', signal });
        if (!response.ok) return secure(reply(response.status === 429 ? 429 : response.status === 401 ? 401 : 503, 'ADMIN_SIGN_IN_FAILED'));
        const payload = JSON.parse(await readBoundedUpstreamJsonTextV1(response, { maximumBodyBytes: 65_536, signal })) as { ok?: unknown; data?: { status?: unknown; session?: { accessToken?: unknown } } };
        const token = payload.ok === true && payload.data?.status === 'authenticated' ? payload.data.session?.accessToken : null;
        if (typeof token !== 'string' || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) return secure(reply(503, 'ADMIN_AUTH_SESSION_UNAVAILABLE'));
        return secure(Response.json({ ok: true, data: { status: 'authenticated', session: { accessToken: token } } }));
      }
      if (url.pathname.startsWith('/api/admin/')) return secure(await input.api(request));
      if (!['GET','HEAD'].includes(request.method)) return secure(reply(405, 'METHOD_NOT_ALLOWED'));
      if (!url.pathname.startsWith('/admin')) return secure(reply(404, 'NOT_FOUND'));
      const path = url.pathname.replace(/^\/admin\/?/u, '/');
      const assetUrl = new URL(request.url); assetUrl.pathname = path; assetUrl.search = '';
      let result = await input.assets(new Request(assetUrl, { method: request.method }));
      // Only known navigation routes fall back to the app; unknown resources fail.
      if (result.status === 404 && ['/admin','/admin/','/admin/users','/admin/commerce','/admin/readings','/admin/analytics','/admin/issues'].includes(url.pathname)) {
        assetUrl.pathname = '/index.html'; result = await input.assets(new Request(assetUrl, { method: request.method }));
      }
      return secure(result);
    } catch { return secure(reply(503, 'ADMIN_HOSTED_UNAVAILABLE')); }
  };
}
