import { denyUnverifiedInitialIdentityAdmissionV1 } from './portone-v2-preidentity-admission-v1.js';
import { resolveProductionPortOneVerifiedAgeModeV1 } from './portone-v2-age-enforcement-activation-v1.js';
import {
  extractPortOnePreenrollmentCookieV1,
  fingerprintPortOnePreenrollmentBindingV1,
} from './portone-v2-preenrollment-age-authority-v1.js';
import { handleGuestBootstrapRequestV1 } from './guest-bootstrap-http.js';
import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import {
  createProductionGuestBootstrapCredentialIssuerPortV1,
  parseProductionGuestBootstrapActivationConfigV1,
} from './production-guest-bootstrap-credential-issuer.js';
import { createProductionGuestBootstrapRuntimePortsV1 } from './production-guest-bootstrap-runtime.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionGuestBootstrapHttpRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionGuestBootstrapHttpRuntimeV1 {
  handleRequest(input: ProductionGuestBootstrapHttpRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionGuestBootstrapHttpRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

function cancelUnusedRequestBodyBestEffort(request: Request): void {
  const body = request.body;
  if (body === null || request.bodyUsed) return;

  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // Method rejection is authoritative; best-effort cleanup must never replace it.
  }
}

/**
 * Production composition root for the Guest bootstrap HTTP boundary.
 *
 * Merely importing/constructing this module does not expose a network route. A
 * concrete route adapter must still be added separately. Construction fails
 * closed unless the Guest TTL policy has been explicitly configured, so the
 * route cannot silently inherit an invented/default retention duration.
 */
export function createProductionGuestBootstrapHttpRuntimeV1(
  input: CreateProductionGuestBootstrapHttpRuntimeInputV1,
): ProductionGuestBootstrapHttpRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const activationConfig = parseProductionGuestBootstrapActivationConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(config);
  const credentialIssuerPort = createProductionGuestBootstrapCredentialIssuerPortV1({
    config: activationConfig,
  });

  return Object.freeze({
    async handleRequest(requestInput: ProductionGuestBootstrapHttpRequestV1) {
      let preenrollmentBindingDigest: string | undefined;
      // Existing authenticated Member/Guest bootstrap is a read-only resume,
      // never a fresh Subject creation; keep it reachable without a second
      // pre-registration proof. Invalid Authorization is rejected by the
      // canonical request-identity resolver before any Guest write.
      if (requestInput.request.method === 'POST' &&
          requestInput.request.headers.get('authorization') === null) {
        const mode = resolveProductionPortOneVerifiedAgeModeV1(input.env);
        if (mode === 'enforce') {
          // Do not trust the browser's birth date, bearer, or checked consent.
          // Only a fresh HttpOnly cookie with an operator-configured server HMAC
          // may enter the atomic Guest+age DB command.
          const rawNonce = extractPortOnePreenrollmentCookieV1(requestInput.request);
          const secret = input.env.MYEONGHA_PORTONE_PREENROLLMENT_BINDING_SECRET;
          if (rawNonce === null || typeof secret !== 'string' ||
              input.env.MYEONGHA_PORTONE_PREENROLLMENT_MIGRATION_STATE !== 'APPROVED_AND_APPLIED' ||
              input.env.MYEONGHA_PORTONE_PREENROLLMENT_PRIVACY_STATE !== 'APPROVED') {
            return denyUnverifiedInitialIdentityAdmissionV1({
              env: input.env, surface: 'guest-bootstrap',
            })!;
          }
          try {
            preenrollmentBindingDigest = fingerprintPortOnePreenrollmentBindingV1({
              rawNonce, secret,
            });
          } catch {
            return denyUnverifiedInitialIdentityAdmissionV1({
              env: input.env, surface: 'guest-bootstrap',
            })!;
          }
        }
      }
      const runtimePorts = createProductionGuestBootstrapRuntimePortsV1({
        request: requestInput.request,
        config,
        pool,
        ...(preenrollmentBindingDigest === undefined
          ? {} : { preenrollmentBindingDigest }),
        ...(input.memberFetchImpl === undefined
          ? {}
          : { memberFetchImpl: input.memberFetchImpl }),
      });

      const response = await handleGuestBootstrapRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityResolverPort: runtimePorts.identityResolverPort,
        credentialIssuerPort,
        tokenFingerprintPort: runtimePorts.tokenFingerprintPort,
        authorityPort: runtimePorts.authorityPort,
      });

      if (response.status === 405) {
        cancelUnusedRequestBodyBestEffort(requestInput.request);
      }
      return response;
    },
    close() {
      return pool.close();
    },
  });
}
