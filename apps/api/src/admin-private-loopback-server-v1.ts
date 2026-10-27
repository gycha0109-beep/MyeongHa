import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAdminPrivateRuntimeV1, type AdminPrivateRuntimeEnvV1 } from './admin-private-runtime-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

const LOOPBACK = '127.0.0.1';
const DEV_UI_ORIGIN = 'http://127.0.0.1:4184';
const MAX_SIGN_IN_BODY = 16 * 1024;
const MAX_AUTH_RESPONSE = 64 * 1024;

export interface AdminLoopbackEnvV1 extends AdminPrivateRuntimeEnvV1 {
  readonly MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN?: string;
}

export interface AdminLoopbackOptionsV1 {
  readonly env: AdminLoopbackEnvV1;
  readonly readPool: PostgresSubjectPoolV1;
  readonly auditPool: PostgresSubjectPoolV1;
  readonly commandPool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  readonly signInFetchImpl?: typeof fetch;
  readonly port?: number;
}

function jsonReply(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(payload));
}

function authOrigin(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function limitedBody(req: IncomingMessage): Promise<string> {
  if (Number(req.headers['content-length'] ?? '0') > MAX_SIGN_IN_BODY) {
    throw new Error('BODY_TOO_LARGE');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    bytes += buffer.length;
    if (bytes > MAX_SIGN_IN_BODY) throw new Error('BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function boundedResponse(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length') ?? '0') > MAX_AUTH_RESPONSE) {
    throw new Error('AUTH_RESPONSE_TOO_LARGE');
  }
  if (response.body === null) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_AUTH_RESPONSE) throw new Error('AUTH_RESPONSE_TOO_LARGE');
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(merged)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createAdminLoopbackServerV1(input: AdminLoopbackOptionsV1): Server {
  const port = input.port ?? 4185;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid Admin loopback port.');
  }
  const privileged = createAdminPrivateRuntimeV1({
    env: input.env,
    readPool: input.readPool,
    auditPool: input.auditPool,
    ...(input.commandPool === undefined ? {} : {commandPool:input.commandPool}),
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });
  const memberOrigin = authOrigin(input.env.MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN);
  const fetchImpl = input.signInFetchImpl ?? fetch;

  return createServer({ maxHeaderSize: 8192, requestTimeout: 10_000 },
    async (req, res) => {
      if (req.headers.host !== LOOPBACK + ':' + port) {
        jsonReply(res, 421, { error: 'ADMIN_LOOPBACK_HOST_REQUIRED' });
        req.resume();
        return;
      }
      let path: URL;
      try { path = new URL(req.url ?? '/', 'http://' + LOOPBACK + ':' + port); }
      catch {
        jsonReply(res, 400, { error: 'BAD_REQUEST' });
        req.resume();
        return;
      }
      if (path.pathname === '/api/auth/sign-in') {
        if (req.method !== 'POST' || path.search !== '') {
          jsonReply(res, 405, { error: 'METHOD_NOT_ALLOWED' });
          req.resume();
          return;
        }
        if (req.headers.origin !== DEV_UI_ORIGIN ||
            !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
          jsonReply(res, 403, { error: 'ADMIN_ORIGIN_REQUIRED' });
          req.resume();
          return;
        }
        if (memberOrigin === null) {
          try { await limitedBody(req); }
          catch { jsonReply(res, 413, { error: 'ADMIN_AUTH_BODY_INVALID' }); return; }
          jsonReply(res, 503, { error: 'ADMIN_AUTH_ORIGIN_UNAVAILABLE' });
          return;
        }
        try {
          const body = JSON.parse(await limitedBody(req)) as unknown;
          if (!isRecord(body) || typeof body.email !== 'string' ||
              typeof body.password !== 'string' || body.email.length > 254 ||
              body.password.length < 1 || body.password.length > 1024) {
            jsonReply(res, 400, { error: 'ADMIN_INVALID_CREDENTIALS' });
            return;
          }
          const upstream = await fetchImpl(memberOrigin + '/api/auth/sign-in', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'X-MyeongHa-Auth-Transport': 'web-cookie-v1',
            },
            cache: 'no-store',
            redirect: 'manual',
            signal: AbortSignal.timeout(8_000),
            body: JSON.stringify({ email: body.email, password: body.password }),
          });
          if (upstream.status === 429) {
            jsonReply(res, 429, { error: 'ADMIN_AUTH_RATE_LIMITED' });
            return;
          }
          if (!upstream.ok) {
            jsonReply(res, upstream.status === 401 || upstream.status === 403 ? 401 : 503,
              { error: 'ADMIN_SIGN_IN_FAILED' });
            return;
          }
          const payload = await boundedResponse(upstream);
          const data = isRecord(payload) && payload.ok === true ? payload.data : null;
          const session = isRecord(data) && data.status === 'authenticated'
            ? data.session : null;
          const token = isRecord(session) ? session.accessToken : null;
          if (typeof token !== 'string' || token.length > 8192 ||
              !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) {
            jsonReply(res, 503, { error: 'ADMIN_AUTH_SESSION_UNAVAILABLE' });
            return;
          }
          // Explicitly discard upstream cookies, refresh tokens and user PII.
          jsonReply(res, 200, { ok: true, data: {
            status: 'authenticated', session: { accessToken: token },
          } });
        } catch {
          jsonReply(res, 503, { error: 'ADMIN_AUTH_PROXY_UNAVAILABLE' });
        }
        return;
      }

      if (!path.pathname.startsWith('/api/admin/')) {
        jsonReply(res, 404, { error: 'NOT_FOUND' });
        req.resume();
        return;
      }

      // The browser may not submit SQL, arbitrary paths or request bodies.
      // The dedicated HTTP handler enforces Owner verification, audit and GET.
      try {
        const authorization = req.headers.authorization;
        const request = new Request(path.toString(), {
          method: req.method ?? 'OPTIONS',
          headers: {
            ...(typeof authorization === 'string' ? {Authorization:authorization}:{}),
            ...(typeof req.headers.origin === 'string'?{Origin:req.headers.origin}:{}),
            ...(typeof req.headers['content-type'] === 'string'?{'Content-Type':req.headers['content-type']}:{}),
          },
          ...(req.method === 'POST' ? {body:await limitedBody(req)}:{}),
        });
        req.resume();
        const response = await privileged.handleRequest(request);
        const body = await response.text();
        const headers: Record<string, string> = {};
        for (const key of ['content-type','cache-control','pragma','x-content-type-options','x-request-id','vary','retry-after']) {
          const value = response.headers.get(key);
          if (value !== null) headers[key] = value;
        }
        headers['referrer-policy'] = 'no-referrer';
        res.writeHead(response.status, headers);
        res.end(body);
      } catch {
        jsonReply(res, 503, { error: 'ADMIN_UNAVAILABLE' });
      }
    });
}

export async function listenAdminLoopbackV1(
  server: Server,
  port = 4185,
): Promise<AddressInfo> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid loopback port.');
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string' || address.address !== LOOPBACK) {
    server.close();
    throw new Error('Admin private server bound outside loopback.');
  }
  return address;
}
