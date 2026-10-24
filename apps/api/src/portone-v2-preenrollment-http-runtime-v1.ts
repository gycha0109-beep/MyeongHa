import { createPostgresPortOnePreenrollmentAgeAuthorityV1,
  extractPortOnePreenrollmentCookieV1,
  fingerprintPortOnePreenrollmentBindingV1,
  issuePortOnePreenrollmentHttpOnlyNonceV1,
  serializePortOnePreenrollmentCookieV1,
} from './portone-v2-preenrollment-age-authority-v1.js';
import { finalizePortOneV2PreenrollmentAgeV1 } from './portone-v2-preenrollment-finalization-v1.js';
import { resolveProductionPortOneIdentityHttpModeV1,
  PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1,
} from './portone-v2-production-identity-http-runtime-v1.js';
import { createPortOneV2IdentityLookupAdapterV1,
  type PortOneV2IdentityLookupAdapterV1,
} from './portone-v2-identity-verification-lookup-v1.js';
import { readChatOpenJsonRequestBodyV1 } from './chat-open-request-body.js';
import {
  fingerprintMemberAuthClientV1,
  readTrustedVercelClientIpV1,
} from './member-auth-client-network-key.js';
import type { MemberAuthRateLimitAdmissionPortV1 } from './member-auth-rate-limit.js';
import { PostgresMemberAuthRateLimitAdmissionPortV1 } from './postgres-member-auth-rate-limit.js';
import { AuthenticatedJsonRequestBodyTooLargeV1 } from './authenticated-json-request-resource.js';
import { IngressRequestBodyCompletionDeadlineExceededV1 } from './ingress-request-body-deadline.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { ProductionUserDataRuntimeEnvV1 } from './production-user-data-runtime-config.js';

export const PORTONE_PREENROLLMENT_HTTP_RELEASE_V1 = Object.freeze({
  issueRoute: '/api/identity-verifications/pre-enrollment/attempts',
  completeRoute: '/api/identity-verifications/pre-enrollment/complete',
  capabilityRoute: '/api/identity-verifications/pre-enrollment/capability',
  modeSetting: 'MYEONGHA_PORTONE_PREENROLLMENT_HTTP_MODE',
  migrationSetting: 'MYEONGHA_PORTONE_PREENROLLMENT_MIGRATION_STATE',
  privacySetting: 'MYEONGHA_PORTONE_PREENROLLMENT_PRIVACY_STATE',
  bindingKeySetting: 'MYEONGHA_PORTONE_PREENROLLMENT_BINDING_SECRET',
  off: 'OFF', enforce: 'ENFORCE',
  applied: 'APPROVED_AND_APPLIED', approved: 'APPROVED',
  origin: 'https://myeongha.vercel.app',
} as const);

type Action = 'issue' | 'complete';
const ID = /^iv[a-f0-9]{32}$/u;
function fail(status: number, code: string): Response {
  return Response.json({ ok: false, error: { code, retryable: status >= 500 } },
    { status, headers: { 'Cache-Control': 'no-store' } });
}
function accepted(data: unknown, cookie?: string): Response {
  return Response.json({ ok: true, data }, { status: 200, headers: {
    'Cache-Control': 'no-store', ...(cookie === undefined ? {} : { 'Set-Cookie': cookie }),
  } });
}

/** Any partial/malformed approval FAILS CLOSED; OFF performs no I/O. */
export function resolveProductionPortOnePreenrollmentModeV1(
  env: ProductionUserDataRuntimeEnvV1,
): 'off' | 'enforce' {
  const g = PORTONE_PREENROLLMENT_HTTP_RELEASE_V1;
  const value = env[g.modeSetting];
  if (value === undefined || value === g.off) return 'off';
  if (value !== g.enforce) throw new Error('Preenrollment activation setting is invalid.');
  if (resolveProductionPortOneIdentityHttpModeV1(env) !== 'enforce' ||
      env[g.migrationSetting] !== g.applied ||
      env[g.privacySetting] !== g.approved) {
    throw new Error('Preenrollment requires approved PortOne, age, Privacy and DB.');
  }
  const secret = env[g.bindingKeySetting];
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 4096 ||
      secret.trim() !== secret || /[\r\n]/u.test(secret)) {
    throw new Error('Preenrollment server-only cookie HMAC key is missing.');
  }
  // The public capability response must never advertise readiness when the
  // cost-abuse limiter lacks its server-only HMAC key.
  const limiterKey = env.MYEONGHA_AUTH_RATE_LIMIT_SECRET;
  if (typeof limiterKey !== 'string' || limiterKey.trim() !== limiterKey ||
      limiterKey.length < 32) {
    throw new Error('Preenrollment identity request limiter is not approved.');
  }
  return 'enforce';
}

export function createProductionPortOnePreenrollmentHttpRuntimeV1(input: Readonly<{
  env: ProductionUserDataRuntimeEnvV1;
  pool: PostgresSubjectPoolV1;
  providerLookup?: Pick<PortOneV2IdentityLookupAdapterV1, 'verify'>;
  nonceFactory?: () => string;
  /** Test-seam only. Production uses existing PostgreSQL Auth limiter. */
  rateLimitAdmissionPort?: MemberAuthRateLimitAdmissionPortV1;
}>) {
  if (resolveProductionPortOnePreenrollmentModeV1(input.env) !== 'enforce') {
    throw new Error('Preenrollment HTTP must not be constructed while disabled.');
  }
  const g = PORTONE_PREENROLLMENT_HTTP_RELEASE_V1;
  const bindingKey = input.env[g.bindingKeySetting]!;
  const providerLookup = input.providerLookup ?? createPortOneV2IdentityLookupAdapterV1({
    apiSecret: input.env[PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1.apiSecret]!,
  });
  const authority = createPostgresPortOnePreenrollmentAgeAuthorityV1(input.pool);
  const rateLimitAdmissionPort = input.rateLimitAdmissionPort
    ?? new PostgresMemberAuthRateLimitAdmissionPortV1(input.pool);
  // Conservative shared 'sign-up' bucket protects both issue and completion
  // without inventing an additional identity/IP table or exposure route.
  const rateLimitSecret = input.env.MYEONGHA_AUTH_RATE_LIMIT_SECRET;
  if (typeof rateLimitSecret !== 'string' || rateLimitSecret.length < 32) {
    throw new Error('Preenrollment identity rate-limit key is unavailable.');
  }

  return Object.freeze({
    async handleRequest(inputRequest: Readonly<{
      request: Request;
      requestId: string;
      serverTime: string;
      action: Action;
    }>): Promise<Response> {
      const { request, action, serverTime } = inputRequest;
      const route = action === 'issue' ? g.issueRoute : g.completeRoute;
      if (new URL(request.url).pathname !== route) return fail(404, 'NOT_FOUND');
      if (request.method !== 'POST') {
        return new Response(null, { status: 405,
          headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
      }
      // A fresh actor cannot present an already-authenticated Subject.
      // Same-origin browser initiation and HttpOnly possession are mandatory.
      if (request.headers.get('origin') !== g.origin ||
          request.headers.has('authorization')) return fail(403, 'IDENTITY_VERIFICATION_REQUIRED');

      // Protect unauthenticated identity attempts AND provider GET completions
      // against cost amplification. Bad/missing forwarded IP or DB rate-limit
      // authority fails closed before PortOne SDK/provider or new attempt writes.
      try {
        const clientIp = readTrustedVercelClientIpV1(request);
        const clientFingerprint = fingerprintMemberAuthClientV1({
          clientIp, action: 'sign-up', secret: rateLimitSecret,
        });
        const admission = await rateLimitAdmissionPort.admit({
          action: 'sign-up', clientFingerprint,
        });
        if (!admission.allowed) {
          const resetMs = Date.parse(admission.resetAt);
          if (!Number.isFinite(resetMs)) throw new Error('Rate-limit reset is invalid.');
          const after = Math.max(1, Math.min(60,
            Math.ceil((resetMs - Date.now()) / 1000)));
          return Response.json({
            ok: false, error: { code: 'RATE_LIMITED', retryable: false },
          }, { status: 429, headers: {
            'Cache-Control': 'no-store', 'Retry-After': String(after),
          } });
        }
      } catch {
        return fail(503, 'IDENTITY_VERIFICATION_UNAVAILABLE');
      }

      try {
        const body = await readChatOpenJsonRequestBodyV1(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return fail(400, 'INVALID_REQUEST');
        }
        if (action === 'issue') {
          if (Object.keys(body).length !== 0) return fail(400, 'INVALID_REQUEST');
          const nonce = input.nonceFactory?.() ?? issuePortOnePreenrollmentHttpOnlyNonceV1();
          const digest = fingerprintPortOnePreenrollmentBindingV1({
            rawNonce: nonce, secret: bindingKey,
          });
          const issued = await authority.issue(digest);
          return accepted({
            ...issued,
            storeId: input.env[PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1.storeId]!,
            channelKey: input.env[PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1.channelKey]!,
          }, serializePortOnePreenrollmentCookieV1(nonce));
        }
        const payload = body as Record<string, unknown>;
        const id = payload.identityVerificationId;
        if (Object.keys(payload).length !== 1 || typeof id !== 'string' ||
            !ID.test(id)) return fail(400, 'INVALID_REQUEST');
        const nonce = extractPortOnePreenrollmentCookieV1(request);
        if (nonce === null) return fail(403, 'IDENTITY_VERIFICATION_REQUIRED');
        const digest = fingerprintPortOnePreenrollmentBindingV1({
          rawNonce: nonce, secret: bindingKey,
        });
        const verified = await finalizePortOneV2PreenrollmentAgeV1({
          bindingDigest: digest, identityVerificationId: id, serverTime,
          authority, providerLookup,
        });
        return verified.kind === 'verified'
          ? accepted({ ageBand: verified.ageBand })
          : fail(403, 'IDENTITY_VERIFICATION_NOT_ACCEPTED');
      } catch (error) {
        if (error instanceof AuthenticatedJsonRequestBodyTooLargeV1) {
          return fail(413, 'REQUEST_TOO_LARGE');
        }
        if (error instanceof IngressRequestBodyCompletionDeadlineExceededV1) {
          return fail(408, 'REQUEST_BODY_TIMEOUT');
        }
        if (error instanceof SyntaxError) return fail(400, 'INVALID_REQUEST');
        return fail(503, 'IDENTITY_VERIFICATION_UNAVAILABLE');
      }
    },
  });
}
