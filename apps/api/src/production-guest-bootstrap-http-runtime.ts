import { handleGuestBootstrapRequestV1 } from './guest-bootstrap-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
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
  /** Server-owned request pool injection; defaults to existing Vercel ownership. */
  readonly pool?: PostgresSubjectPoolV1;
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
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const pool = poolLease.pool;
  const credentialIssuerPort = createProductionGuestBootstrapCredentialIssuerPortV1({
    config: activationConfig,
  });

  return Object.freeze({
    async handleRequest(requestInput: ProductionGuestBootstrapHttpRequestV1) {
      const runtimePorts = createProductionGuestBootstrapRuntimePortsV1({
        request: requestInput.request,
        config,
        pool,
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
      return poolLease.close();
    },
  });
}
