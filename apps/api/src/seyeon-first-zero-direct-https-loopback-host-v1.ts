// Watchtower-Track: security
// A REAL TLS-terminating Node host for synthetic/loopback acceptance only.
// Deliberately no executable production entrypoint, public listener, rewrite,
// reverse-proxy trust, or automatic Provider/DB credential composition.
import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpsServer } from 'node:https';
import type { TLSSocket } from 'node:tls';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { ProductionSeyeonChatRuntimeV1 } from './production-seyeon-chat-runtime-v1.js';
import { handleSeyeonFirstZeroDirectNodeHttpV1 } from './seyeon-first-zero-node-http-ingress-v1.js';

export const SEYEON_FIRST_ZERO_DIRECT_HTTPS_LOOPBACK_HOST_V1 = Object.freeze({
  schemaVersion: 'seyeon-first-zero-direct-https-loopback-host-v1',
  transport: 'node:https.TLSSocket+ServerResponse',
  bindAddress: '127.0.0.1',
  tlsMinimum: 'TLSv1.3',
  alpn: 'http/1.1',
  maxConcurrentConnections: 16,
  publicRouteMounted: false,
  vercelFetchSupported: false,
  reverseProxySupported: false,
  independentlyApprovedForProduction: false,
} as const);

const BIND_ADDRESS = SEYEON_FIRST_ZERO_DIRECT_HTTPS_LOOPBACK_HOST_V1.bindAddress;
const MAX_RAW_HEADER_ITEMS = 128;
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/u;
const CHAT_POST_PATH = /^\/api\/chat\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/turns$/iu;

function allowedOrigin(value: string | undefined): string | null {
  if (value === undefined) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash ||
        parsed.origin !== value || !HOSTNAME.test(parsed.hostname)) {
      throw new Error('invalid origin');
    }
    return value;
  } catch {
    throw new Error('Direct HTTPS browser origin must be one exact HTTPS origin.');
  }
}

function validBrowserPreflight(headers: import('node:http').IncomingHttpHeaders): boolean {
  const requested = headers['access-control-request-headers'];
  if (headers.authorization !== undefined ||
      headers.cookie !== undefined ||
      headers['access-control-request-method'] !== 'POST' ||
      typeof requested !== 'string') return false;
  const names = requested.split(',').map(v => v.trim().toLowerCase());
  return names.length === 2 && new Set(names).size === 2 &&
    names.includes('authorization') && names.includes('content-type');
}

export interface StartSeyeonFirstZeroDirectHttpsLoopbackInputV1 {
  /** TLS fixture/injected PEM bytes; never read secrets from request headers. */
  readonly certificatePem: string | Buffer;
  readonly privateKeyPem: string | Buffer;
  /** Exact server-side name: matching SNI and exactly one HTTP Host header. */
  readonly expectedDnsHost: string;
  /** One exact HTTPS web app origin. Optional; native direct clients need none. */
  readonly allowedBrowserOrigin?: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly runtime: Pick<ProductionSeyeonChatRuntimeV1, 'run'>;
}

export interface SeyeonFirstZeroDirectHttpsLoopbackLeaseV1 {
  readonly port: number;
  readonly server: HttpsServer;
  close(): Promise<void>;
}

function hasUntrustedProxyHeaders(headers: readonly string[]): boolean {
  if (headers.length % 2 !== 0) return true;
  let hostCount = 0;
  let authorizationCount = 0;
  let originCount = 0;
  let contentLengthCount = 0;
  let transferEncodingCount = 0;
  for (let i = 0; i < headers.length; i += 2) {
    const header = headers[i]?.toLowerCase();
    if (header === undefined) return true;
    if (header === 'host') hostCount++;
    if (header === 'authorization') authorizationCount++;
    if (header === 'origin') originCount++;
    if (header === 'content-length') contentLengthCount++;
    if (header === 'transfer-encoding') transferEncodingCount++;
    if (header === 'forwarded' || header === 'via' ||
        header === 'x-real-ip' || header === 'cf-connecting-ip' ||
        header === 'true-client-ip' || header === 'x-vercel-id' ||
        header.startsWith('x-forwarded-') ||
        header.startsWith('x-amzn-')) return true;
  }
  // Node can discard/combine duplicate authorization or Host headers.
  // Reject based on the raw wire header list, not its normalized copy.
  return hostCount !== 1 || authorizationCount > 1 || originCount > 1 ||
    contentLengthCount > 1 || transferEncodingCount > 1 ||
    (contentLengthCount > 0 && transferEncodingCount > 0);
}

function isDirectTlsRequest(
  request: import('node:http').IncomingMessage,
  response: import('node:http').ServerResponse,
  expectedDnsHost: string,
): boolean {
  const socket = request.socket as TLSSocket;
  const rawHeaders = request.rawHeaders;
  return socket !== null && socket.encrypted === true &&
    socket.servername === expectedDnsHost &&
    socket.alpnProtocol === 'http/1.1' &&
    request.headers.host === expectedDnsHost &&
    rawHeaders.length <= MAX_RAW_HEADER_ITEMS &&
    !hasUntrustedProxyHeaders(rawHeaders) &&
    response.socket === socket &&
    socket.remoteAddress === BIND_ADDRESS &&
    !response.headersSent && !response.writableEnded &&
    !response.destroyed;
}

function staticTlsHold(
  response: import('node:http').ServerResponse,
  requestId: string,
): void {
  if (response.headersSent || response.destroyed || response.writableEnded) {
    if (!response.destroyed) response.destroy();
    return;
  }
  const body = Buffer.from(JSON.stringify({
    ok: false,
    error: {
      code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
      messageKey: 'chat.secure_reveal_unavailable',
      retryable: false,
    },
    meta: { apiContractVersion: 'v0.9', requestId },
  }));
  response.shouldKeepAlive = false;
  response.statusCode = 503;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', body.byteLength);
  response.setHeader('Connection', 'close');
  response.end(body);
}

/**
 * Binds ONLY 127.0.0.1 with a kernel-selected port, never 0.0.0.0 or ::.
 * Positive response is permitted exclusively inside the injected direct-TLS
 * same-socket handler, after Member verification and fresh DB zero-source read.
 * TLS and Node 'finish' do NOT prove an external proxy/client has received data.
 */
export async function startSeyeonFirstZeroDirectHttpsLoopbackV1(
  input: StartSeyeonFirstZeroDirectHttpsLoopbackInputV1,
): Promise<SeyeonFirstZeroDirectHttpsLoopbackLeaseV1> {
  if (!HOSTNAME.test(input.expectedDnsHost) ||
      input.expectedDnsHost.includes('..') ||
      input.expectedDnsHost.includes(':') ||
      input.expectedDnsHost !== input.expectedDnsHost.toLowerCase()) {
    throw new Error('Loopback TLS admission requires one exact DNS host.');
  }
  const browserOrigin = allowedOrigin(input.allowedBrowserOrigin);
  const server = createServer({
    key: input.privateKeyPem,
    cert: input.certificatePem,
    minVersion: 'TLSv1.3',
    maxVersion: 'TLSv1.3',
    ALPNProtocols: ['http/1.1'],
    maxHeaderSize: 8_192,
    requestCert: false,
  }, (incoming, response) => {
    const requestId = randomUUID();
    response.shouldKeepAlive = false;
    if (!isDirectTlsRequest(incoming, response, input.expectedDnsHost)) {
      staticTlsHold(response, requestId);
      return;
    }

    // The web app is a different origin from this direct-TLS host. Origin
    // never replaces authenticated Member verification for the actual POST.
    if (incoming.headers.origin !== undefined || incoming.method === 'OPTIONS') {
      if (browserOrigin === null ||
          incoming.headers.origin !== browserOrigin ||
          incoming.headers.cookie !== undefined ||
          !CHAT_POST_PATH.test(incoming.url ?? '') ||
          (incoming.method !== 'POST' && incoming.method !== 'OPTIONS')) {
        staticTlsHold(response, requestId);
        return;
      }
      if (incoming.method === 'OPTIONS') {
        if (!validBrowserPreflight(incoming.headers)) {
          staticTlsHold(response, requestId);
          return;
        }
        response.statusCode = 204;
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Access-Control-Allow-Origin', browserOrigin);
        response.setHeader('Access-Control-Allow-Methods', 'POST');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        response.setHeader('Access-Control-Max-Age', '0');
        response.setHeader('Vary', 'Origin');
        response.setHeader('Content-Length', '0');
        response.end();
        return;
      }
      // Never emit Allow-Credentials or a wildcard origin. The existing
      // server-side Member verifier remains mandatory for the real POST.
      response.setHeader('Access-Control-Allow-Origin', browserOrigin);
      response.setHeader('Vary', 'Origin');
    }

    void handleSeyeonFirstZeroDirectNodeHttpV1({
      incoming,
      response,
      identityEvidenceVerifier: input.identityEvidenceVerifier,
      pool: input.pool,
      runtime: input.runtime,
      requestId,
    }).catch(() => {
      staticTlsHold(response, requestId);
    });
  });
  server.maxConnections = 16;
  server.maxRequestsPerSocket = 1;
  server.headersTimeout = 3_000;
  server.requestTimeout = 6_000;
  server.keepAliveTimeout = 1_000;
  server.timeout = 10_000;

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, BIND_ADDRESS, () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string' ||
        address.address !== BIND_ADDRESS || address.port < 1) {
      throw new Error('HTTPS listener did not bind the reserved loopback address.');
    }
    return Object.freeze({
      port: address.port,
      server,
      close: async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
        });
      },
    });
  } catch (error) {
    server.close();
    throw error;
  }
}
