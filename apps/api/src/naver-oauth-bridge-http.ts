import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readAuthenticatedJsonRequestBodyV1 } from './authenticated-json-request-resource.js';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN } from './production-user-data-runtime-config.js';

// OAuth transport only. Supabase still issues sessions and owns provider identities.
const ORIGIN = 'https://myeongha.vercel.app';
const CALLBACK = `${ORIGIN}/api/auth/social/naver/callback`;
const SUPABASE_CALLBACK = `${MYEONGHA_PRODUCTION_SUPABASE_ORIGIN}/auth/v1/callback`;
const PATH = '/api/auth/social/naver/';
const STATE_TTL = 10 * 60_000;
const MAX_BYTES = 16_384;
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export type NaverOAuthBridgeActionV1 = 'authorize' | 'callback' | 'token' | 'userinfo';
export interface NaverOAuthBridgeEnvV1 {
  readonly [key: string]: string | undefined;
  readonly MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED?: string | undefined;
  readonly MYEONGHA_NAVER_CLIENT_ID?: string | undefined;
  readonly MYEONGHA_NAVER_OAUTH_BRIDGE_KEY?: string | undefined;
}
export type NaverOAuthBridgeFetchV1 = (url: string, init?: RequestInit) => Promise<Response>;
type State = { kind: 'state'; exp: number; state: string; challenge: string };
type Code = { kind: 'code'; exp: number; state: string; challenge: string; code: string };
type Access = { kind: 'access'; exp: number; token: string };
type Envelope = State | Code | Access;

function bounded(value: unknown, maximum = 4096): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS });
}
function error(status = 400): Response {
  return reply({ error: 'invalid_request' }, status);
}
function redirect(url: URL): Response {
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: url.toString() } });
}
function seal(value: Envelope, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('myeongha-naver-oauth-v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function open(value: string, key: Buffer, now: number): Envelope | null {
  try {
    if (!/^[A-Za-z0-9_-]{40,8192}$/u.test(value)) return null;
    const bytes = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from('myeongha-naver-oauth-v1'));
    cipher.setAuthTag(bytes.subarray(12, 28));
    const parsed: unknown = JSON.parse(Buffer.concat([
      cipher.update(bytes.subarray(28)), cipher.final(),
    ]).toString('utf8'));
    if (!record(parsed) || typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp) || parsed.exp <= now) return null;
    if (parsed.kind === 'access' && bounded(parsed.token)) return parsed as Access;
    if (!bounded(parsed.state) || typeof parsed.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(parsed.challenge)) return null;
    if (parsed.kind === 'state') return parsed as State;
    if (parsed.kind === 'code' && bounded(parsed.code)) return parsed as Code;
    return null;
  } catch {
    return null;
  }
}
function unique(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  return values.length === 1 && bounded(values[0]) ? values[0] : null;
}
async function readUpstream(response: Response): Promise<unknown> {
  if (!response.ok || response.body === null) throw new Error('upstream_failure');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('upstream_failure');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
async function tokenBody(request: Request): Promise<Record<string, string> | null> {
  const contentType = request.headers.get('Content-Type')?.split(';')[0]?.trim();
  let params: Record<string, string> = {};
  if (contentType === 'application/x-www-form-urlencoded') {
    // Reuse the bounded stream reader without ever logging credentials.
    const textReader = request.body?.getReader();
    if (!textReader) return null;
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await textReader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) return null;
        chunks.push(Buffer.from(value));
      }
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      for (const [name, value] of form) {
        if (Object.hasOwn(params, name)) return null;
        Object.defineProperty(params, name, { value, enumerable: true });
      }
    } finally {
      void textReader.cancel().catch(() => undefined);
      textReader.releaseLock();
    }
  } else if (contentType === 'application/json') {
    const body = await readAuthenticatedJsonRequestBodyV1(request);
    if (!record(body) || Object.values(body).some(value => typeof value !== 'string')) return null;
    params = body as Record<string, string>;
  } else return null;
  const authorization = request.headers.get('Authorization');
  if (authorization !== null) {
    if (!/^Basic [A-Za-z0-9+/=]+$/u.test(authorization) || params.client_id || params.client_secret) return null;
    const credentials = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const colon = credentials.indexOf(':');
    if (colon < 0) return null;
    params = { ...params, client_id: decodeURIComponent(credentials.slice(0, colon)), client_secret: decodeURIComponent(credentials.slice(colon + 1)) };
  }
  return params;
}

export async function handleNaverOAuthBridgeRequestV1(input: {
  readonly request: Request;
  readonly action: NaverOAuthBridgeActionV1;
  readonly env: NaverOAuthBridgeEnvV1;
  readonly fetchImpl?: NaverOAuthBridgeFetchV1;
  readonly nowEpochMs?: () => number;
}): Promise<Response> {
  const expectedMethod = input.action === 'token' ? 'POST' : 'GET';
  if (input.request.method !== expectedMethod) return new Response(null, { status: 405, headers: { ...HEADERS, Allow: expectedMethod } });
  const clientId = input.env.MYEONGHA_NAVER_CLIENT_ID;
  const encodedKey = input.env.MYEONGHA_NAVER_OAUTH_BRIDGE_KEY;
  if (input.env.MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED !== 'true' || !bounded(clientId, 128) || !encodedKey || !/^[A-Za-z0-9_-]{43}$/u.test(encodedKey)) return error(503);
  const key = Buffer.from(encodedKey, 'base64url');
  if (key.byteLength !== 32 || key.toString('base64url') !== encodedKey) return error(503);
  const now = input.nowEpochMs?.() ?? Date.now();
  const fetcher = input.fetchImpl ?? fetch;
  const url = new URL(input.request.url);
  if (url.origin !== ORIGIN || (url.pathname !== `${PATH}${input.action}` && url.pathname !== '/api/auth/sign-in')) return error();
  try {
    if (input.action === 'authorize') {
      const state = unique(url, 'state');
      const challenge = unique(url, 'code_challenge');
      if (unique(url, 'client_id') !== clientId || unique(url, 'redirect_uri') !== SUPABASE_CALLBACK || unique(url, 'response_type') !== 'code' || !state || !challenge || !/^[A-Za-z0-9_-]{43}$/u.test(challenge) || unique(url, 'code_challenge_method') !== 'S256') return error();
      const naver = new URL('https://nid.naver.com/oauth2.0/authorize');
      naver.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, state: seal({ kind: 'state', exp: now + STATE_TTL, state, challenge }, key) }).toString();
      return redirect(naver);
    }
    if (input.action === 'callback') {
      const state = unique(url, 'state');
      const flow = state ? open(state, key, now) : null;
      if (!flow || flow.kind !== 'state') return error();
      const target = new URL(SUPABASE_CALLBACK);
      target.searchParams.set('state', flow.state);
      if (url.searchParams.has('error')) {
        target.searchParams.set('error', 'access_denied');
      } else {
        const code = unique(url, 'code');
        if (!code) return error();
        target.searchParams.set('code', seal({ kind: 'code', exp: Math.min(flow.exp, now + 60_000), code, state: state!, challenge: flow.challenge }, key));
      }
      return redirect(target);
    }
    if (input.action === 'token') {
      const body = await tokenBody(input.request);
      if (!body || body.grant_type !== 'authorization_code' || body.client_id !== clientId || !bounded(body.client_secret, 512) || body.redirect_uri !== SUPABASE_CALLBACK || !bounded(body.code, 8192) || !bounded(body.code_verifier, 128) || !/^[A-Za-z0-9._~-]{43,128}$/u.test(body.code_verifier)) return error();
      const flow = open(body.code, key, now);
      if (!flow || flow.kind !== 'code') return error();
      const digest = createHash('sha256').update(body.code_verifier).digest('base64url');
      if (!timingSafeEqual(Buffer.from(digest), Buffer.from(flow.challenge))) return error();
      const result = await readUpstream(await fetcher('https://nid.naver.com/oauth2.0/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: body.client_secret, redirect_uri: CALLBACK, code: flow.code, state: flow.state }),
      }));
      if (!record(result) || !bounded(result.access_token) || typeof result.token_type !== 'string' || result.token_type.toLowerCase() !== 'bearer') return error(502);
      const seconds = typeof result.expires_in === 'string' ? Number(result.expires_in) : result.expires_in;
      if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds <= 0) return error(502);
      // A short-lived sealed handle prevents arbitrary Naver tokens being used as this app's identity.
      const expiresIn = Math.min(seconds, 300);
      return reply({ access_token: seal({ kind: 'access', exp: now + expiresIn * 1000, token: result.access_token }, key), token_type: 'Bearer', expires_in: expiresIn });
    }
    const authorization = input.request.headers.get('Authorization');
    const bearer = authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,8192})$/u)?.[1];
    const access = bearer ? open(bearer, key, now) : null;
    if (!access || access.kind !== 'access') return error(401);
    const result = await readUpstream(await fetcher('https://openapi.naver.com/v1/nid/me', {
      redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Authorization: `Bearer ${access.token}` },
    }));
    if (!record(result) || result.resultcode !== '00' || !record(result.response) || !bounded(result.response.id, 256)) return error(502);
    const profile = result.response;
    // Naver email is a contact address, not an identity key. Do not trigger email-based linking.
    return reply({ sub: profile.id,
      ...(bounded(profile.nickname, 256) ? { nickname: profile.nickname } : {}),
      ...(bounded(profile.profile_image, 2048) && profile.profile_image.startsWith('https://') ? { picture: profile.profile_image } : {}),
    });
  } catch {
    // Never return upstream errors, credentials, authorization codes or profile payloads.
    return error(502);
  }
}
