import { readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, resolve, sep } from 'node:path';
import { APPROVED_SAJU_SANDBOX_ROUTES_V1 } from '../../../packages/contracts/src/approved-saju-sandbox-routes.js';
import type { createApprovedSajuSandboxHttpRuntimeV1 } from './approved-saju-sandbox-http-runtime-v1.js';
import { OWNER_PORTONE_SDK_PATH, serveOwnerPortOneSdkV1 } from '../../../cloudflare/owner-portone-sdk-proxy.mjs';

const ROUTES = new Set(Object.values(APPROVED_SAJU_SANDBOX_ROUTES_V1));
const ARCHIVE_PATH = '/api/readings';
const TARGETS_PATH = '/api/target-persons';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function allowedReadQuery(url: URL) {
  if (url.pathname === TARGETS_PATH) return url.search === '';
  if (url.pathname !== ARCHIVE_PATH) return false;
  if (url.search === '') return true; // Owner-only purchased reading list
  const entries = [...url.searchParams.entries()];
  return entries.length === 1
    && (entries[0]?.[0] === 'purchaseIntentId' || entries[0]?.[0] === 'readingId')
    && UUID.test(entries[0]?.[1] ?? '');
}
const MAX_REQUEST_BYTES = 1024;
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_SDK_BYTES = 2 * 1024 * 1024;
const TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
});

type Runtime = Pick<ReturnType<typeof createApprovedSajuSandboxHttpRuntimeV1>, 'handleRequest'>;
type OwnerReadHandler = (request: Request) => Promise<Response>;
function closedHeaders() {
  return { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
}

/**
 * Dedicated disposable/owner-only Saju payment host. Never mounted in the
 * public Cloudflare Worker, and never accepts a non-loopback listener.
 * Real database roles, owner identity, test channel and provider verifier
 * are separately injected through the existing sandbox runtime.
 */
export function createApprovedSajuSandboxLoopbackHostV1(input: Readonly<{
  origin: string;
  staticRoot: string;
  runtime: Runtime;
  /** Trusted fixed-CDN test injection; never selected by a client URL. */
  sdkFetch?: typeof fetch;
  /** Existing RLS/entitlement-verifying GET runtimes. No write routes. */
  ownerReads?: Readonly<{ targets: OwnerReadHandler; readings: OwnerReadHandler }>;
}>) {
  const url = new URL(input.origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1'
    || url.origin !== input.origin || url.pathname !== '/'
    || url.search !== '' || url.hash !== '' || !/^\d+$/u.test(url.port)
    || !isAbsolute(input.staticRoot)) {
    throw new Error('Saju sandbox host requires an exact loopback origin and absolute static root.');
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Saju sandbox host port is outside the approved local range.');
  }
  const staticRoot = resolve(input.staticRoot);
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 12_000 }, async (req, res) => {
    const reply = (status: number, body?: Uint8Array, mime?: string) => {
      res.writeHead(status, { ...closedHeaders(), ...(mime ? { 'Content-Type': mime } : {}) });
      res.end(body);
    };
    if (req.headers.host !== url.host) { req.resume(); reply(421); return; }
    let requestUrl: URL;
    try { requestUrl = new URL(req.url ?? '/', input.origin); }
    catch { req.resume(); reply(400); return; }
    if (requestUrl.origin !== input.origin || requestUrl.hash) {
      req.resume(); reply(404); return;
    }

    if (requestUrl.pathname === OWNER_PORTONE_SDK_PATH) {
      req.resume();
      if (req.method !== 'GET' || requestUrl.search !== '') { reply(404); return; }
      try {
        // Reuse the existing fixed PortOne V2 SDK relay. It never forwards
        // browser cookies/authorization or accepts a caller-provided URL.
        const sdk = await serveOwnerPortOneSdkV1(input.sdkFetch ?? fetch);
        if (sdk.status !== 200 || sdk.body === null) { reply(503); return; }
        const reader = sdk.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
          while (true) {
            const step = await reader.read();
            if (step.done) break;
            total += step.value.byteLength;
            if (total > MAX_SDK_BYTES) { reply(503); return; }
            chunks.push(step.value);
          }
        } finally { try { await reader.cancel(); } catch {} }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        reply(200, bytes, 'application/javascript; charset=utf-8');
      } catch { reply(503); }
      return;
    }

    if (input.ownerReads !== undefined
      && (requestUrl.pathname === ARCHIVE_PATH || requestUrl.pathname === TARGETS_PATH)) {
      req.resume();
      if (req.method !== 'GET') { reply(405); return; }
      if (!allowedReadQuery(requestUrl)) { reply(404); return; }
      try {
        const authorization = req.headers.authorization;
        if (typeof authorization !== 'string') { reply(404); return; }
        // An owner READ must never bypass the same verified member + Owner ACL
        // used by sandbox checkout. Each actual read handler then repeats RLS.
        const owner = await input.runtime.handleRequest(new Request(
          input.origin + APPROVED_SAJU_SANDBOX_ROUTES_V1.access,
          { headers: { Authorization: authorization } },
        ));
        if (owner?.status !== 200) { reply(404); return; }
        const headers = new Headers({ Authorization: authorization });
        const read = requestUrl.pathname === ARCHIVE_PATH
          ? input.ownerReads.readings : input.ownerReads.targets;
        const result = await read(new Request(requestUrl.href, { headers }));
        if (!(result instanceof Response) || result.status >= 300 && result.status < 400
          || result.headers.has('set-cookie') || result.headers.has('location')) {
          reply(503); return;
        }
        const body = new Uint8Array(await result.arrayBuffer());
        if (body.byteLength > MAX_RESPONSE_BYTES || !result.headers.get('content-type')?.startsWith('application/json')) {
          reply(503); return;
        }
        reply(result.status, body, result.headers.get('content-type') ?? 'application/json');
      } catch { reply(503); }
      return;
    }

    if (ROUTES.has(requestUrl.pathname)) {
      try {
        const length = Number(req.headers['content-length'] ?? 0);
        if (length > MAX_REQUEST_BYTES || !Number.isFinite(length) || length < 0) {
          req.resume(); reply(413); return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of req) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          total += bytes.length;
          if (total > MAX_REQUEST_BYTES) { reply(413); return; }
          chunks.push(bytes);
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(key, value);
        }
        const response = await input.runtime.handleRequest(new Request(requestUrl.href, {
          method: req.method ?? 'GET', headers,
          ...(total === 0 ? {} : { body: Buffer.concat(chunks) }),
        }));
        if (!(response instanceof Response) || response.status >= 300 && response.status < 400
          || response.headers.has('set-cookie') || response.headers.has('location')) {
          reply(503); return;
        }
        const body = new Uint8Array(await response.arrayBuffer());
        if (body.byteLength > MAX_RESPONSE_BYTES) { reply(503); return; }
        const type = response.headers.get('content-type') ?? '';
        if (body.byteLength && !type.startsWith('application/json')) { reply(503); return; }
        reply(response.status, body, type || undefined);
      } catch { reply(503); }
      return;
    }
    req.resume();
    // Unknown API paths are never static files, even if a matching JSON file exists.
    if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
      reply(404); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { reply(405); return; }
    if (requestUrl.search !== '') { reply(404); return; }
    let pathname: string;
    try { pathname = decodeURIComponent(requestUrl.pathname); }
    catch { reply(404); return; }
    if (pathname === '/') pathname = '/reading.html';
    if (!/^\/[a-zA-Z0-9_.\/-]+$/u.test(pathname) || pathname.split('/').includes('..')) {
      reply(404); return;
    }
    const type = TYPES[extname(pathname)];
    if (!type) { reply(404); return; }
    const target = resolve(staticRoot, '.' + pathname);
    if (!target.startsWith(staticRoot + sep)) { reply(404); return; }
    try {
      const trustedRoot = await realpath(staticRoot);
      const actualTarget = await realpath(target);
      // Do not allow an otherwise in-root symlink to serve files outside public assets.
      if (!actualTarget.startsWith(trustedRoot + sep)) { reply(404); return; }
      const bytes = await readFile(actualTarget);
      reply(200, req.method === 'HEAD' ? undefined : bytes, type);
    } catch { reply(404); }
  });
  return Object.freeze({
    start() {
      return new Promise<void>((done, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); done(); });
      });
    },
    close() {
      return new Promise<void>((done, reject) => {
        server.close(error => error ? reject(error) : done());
      });
    },
  });
}
