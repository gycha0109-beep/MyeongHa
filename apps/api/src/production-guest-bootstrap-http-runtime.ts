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
    handleRequest(requestInput: ProductionGuestBootstrapHttpRequestV1) {
      const runtimePorts = createProductionGuestBootstrapRuntimePortsV1({
        request: requestInput.request,
        config,
        pool,
        ...(input.memberFetchImpl === undefined
          ? {}
          : { memberFetchImpl: input.memberFetchImpl }),
      });

      return handleGuestBootstrapRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityResolverPort: runtimePorts.identityResolverPort,
        credentialIssuerPort,
        tokenFingerprintPort: runtimePorts.tokenFingerprintPort,
        authorityPort: runtimePorts.authorityPort,
      });
    },
    close() {
      return pool.close();
    },
  });
}
