import { randomUUID } from 'node:crypto';
import { APPROVED_SAJU_SANDBOX_ROUTES_V1 as ROUTES } from '../../../packages/contracts/src/approved-saju-sandbox-routes.js';
import type { CommercePaymentVerificationAdapterV1 } from './commerce-payment-verification-execution.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { readOwnerAdminAccessV1 } from './myeongha-owner-admin-access-v1.js';
import { handlePaymentAttemptCreateRequestV1 } from './payment-attempt-create-http.js';
import { handlePaymentAttemptHandoffContextRequestV1 } from './payment-attempt-handoff-context-http.js';
import { handlePaymentAttemptServerVerificationRequestV1 } from './payment-attempt-server-verification-http.js';
import { derivePortOneKcpV2SandboxPaymentIdV1 } from './portone-kcp-v2-sandbox-payment-id-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { handlePurchaseIntentCreateRequestV3 } from './purchase-intent-create-http-v3.js';
import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';

const PATHS = new Set<string>(Object.values(ROUTES));
const STORE = /^store-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const CHANNEL = /^channel-key-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const PRIVATE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function unavailable(status = 503) {
  return Response.json({ ok: false }, { status, headers: PRIVATE_HEADERS });
}

/** The isolated host supplies its origin, TEST channel and two DB roles. */
export function createApprovedSajuSandboxHttpRuntimeV1(input: {
  readonly origin: string;
  readonly channel: Readonly<{ environment: 'sandbox'; storeId: string; channelKey: string }>;
  readonly pool: PostgresSubjectPoolV1;
  readonly commercePool: PostgresSubjectPoolV1;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly verificationAdapter: CommercePaymentVerificationAdapterV1;
}) {
  const origin = new URL(input.origin);
  if (origin.origin !== input.origin
    || (origin.protocol !== 'https:' && (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1'))
    || input.channel.environment !== 'sandbox'
    || !STORE.test(input.channel.storeId) || !CHANNEL.test(input.channel.channelKey)
    || input.pool === input.commercePool) {
    throw new Error('Approved Saju sandbox HTTP authority is incomplete.');
  }
  const channel = Object.freeze({ ...input.channel });

  return Object.freeze({
    async handleRequest(request: Request): Promise<Response | null> {
      const url = new URL(request.url);
      if (!PATHS.has(url.pathname)) return null;
      if (url.origin !== input.origin || url.search !== '' || url.hash !== '') return unavailable(404);
      const method = url.pathname === ROUTES.access ? 'GET' : 'POST';
      if (request.method !== method) {
        return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: method } });
      }
      if (method === 'POST' && request.headers.get('Origin') !== input.origin) return unavailable(403);
      try {
        const evidence = await input.identityEvidenceVerifier.verifyRequestIdentity(request);
        if (evidence?.kind !== 'member') return unavailable(404);
        const owner = await readOwnerAdminAccessV1(input.pool, evidence);
        if (!owner.isOwnerAdmin || !owner.sandboxCheckoutAllowed) return unavailable(404);
        if (method === 'GET') return Response.json({ ok: true, data: channel }, { headers: PRIVATE_HEADERS });

        if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
          return unavailable(400);
        }
        let body: string;
        try {
          body = await readBoundedUpstreamJsonTextV1(request, {
            maximumBodyBytes: 1024, signal: request.signal,
          });
        } catch {
          return unavailable(400);
        }
        const common = {
          request: new Request(request.url, { method, body, headers: { 'Content-Type': 'application/json' } }),
          requestId: randomUUID(),
          serverTime: new Date().toISOString(),
          identityEvidenceVerifier: { async verifyRequestIdentity() { return evidence; } },
          pool: input.pool,
        };
        switch (url.pathname) {
          case ROUTES.order:
            return await handlePurchaseIntentCreateRequestV3({
              ...common, privateApprovedSajuCheckoutEnabled: true, idPort: { nextPurchaseIntentId: randomUUID },
            });
          case ROUTES.attempt:
            return await handlePaymentAttemptCreateRequestV1({
              ...common, approvedSajuSandbox: true, environment: 'sandbox',
              identityPort: { nextPaymentAttemptId: randomUUID, providerRequestIdFor: derivePortOneKcpV2SandboxPaymentIdV1 },
            });
          case ROUTES.handoff:
            return await handlePaymentAttemptHandoffContextRequestV1({ ...common, approvedSajuSandbox: true });
          case ROUTES.verify:
            return await handlePaymentAttemptServerVerificationRequestV1({
              ...common, approvedSajuSandbox: true, commercePool: input.commercePool,
              verificationAdapter: input.verificationAdapter,
            });
          default:
            return unavailable(404);
        }
      } catch {
        return unavailable();
      }
    },
  });
}
