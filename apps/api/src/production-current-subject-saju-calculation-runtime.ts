import { handleCurrentSubjectSajuCalculationRequestV1 } from './current-subject-saju-calculation-http.js';
import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionSajuRuntimeConfigV1,
  type ProductionSajuRuntimeEnvV1,
} from './production-saju-runtime-config.js';
import { parseProductionUserDataRuntimeConfigV1 } from './production-user-data-runtime-config.js';
import {
  createSajuProductionCalculationHttpAdapterV1,
  type SajuProductionCalculationHttpFetchV1,
} from './saju-production-calculation-http-adapter.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';
import {
  createSajuAbuseObservedIdentityVerifierV1,
  type SajuAbuseObservationWriterV1,
} from './saju-abuse-observability.js';

export interface ProductionCurrentSubjectSajuCalculationRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionCurrentSubjectSajuCalculationRuntimeV1 {
  handleRequest(input: ProductionCurrentSubjectSajuCalculationRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionCurrentSubjectSajuCalculationRuntimeInputV1 {
  readonly env: ProductionSajuRuntimeEnvV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly sajuFetchImpl?: SajuProductionCalculationHttpFetchV1;
  /** Observe-only baseline injection. Production defaults to the privacy-safe logger. */
  readonly sajuAbuseObservationWriter?: SajuAbuseObservationWriterV1;
  /** Test/runtime clock injection only. */
  readonly now?: () => number;
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
 * Production composition root for current-subject Saju calculation-only execution.
 *
 * Database credentials, Member/Guest request verification, and the Saju service origin
 * and credential are server-owned. The request cannot inject trusted subject evidence,
 * select an upstream origin or credential, calculation policy, Birth Profile, or Birth revision.
 */
export function createProductionCurrentSubjectSajuCalculationRuntimeV1(
  input: CreateProductionCurrentSubjectSajuCalculationRuntimeInputV1,
): ProductionCurrentSubjectSajuCalculationRuntimeV1 {
  const userDataConfig = parseProductionUserDataRuntimeConfigV1(input.env);
  const sajuConfig = parseProductionSajuRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(userDataConfig);
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config: userDataConfig,
    ...(input.memberFetchImpl === undefined
      ? {}
      : { memberFetchImpl: input.memberFetchImpl }),
  });
  const sajuAdapter = createSajuProductionCalculationHttpAdapterV1({
    baseUrl: sajuConfig.serviceOrigin,
    bearerToken: sajuConfig.serviceBearer,
    ...(input.sajuFetchImpl === undefined ? {} : { fetchImpl: input.sajuFetchImpl }),
  });

  return Object.freeze({
    async handleRequest(requestInput: ProductionCurrentSubjectSajuCalculationRequestV1) {
      const observedIdentityEvidenceVerifier = createSajuAbuseObservedIdentityVerifierV1({
        delegate: identityEvidenceVerifier,
        routeId: 'api.me.saju.calculation',
        requestId: requestInput.requestId,
        secret: userDataConfig.guestFingerprintSecret,
        ...(input.sajuAbuseObservationWriter === undefined
          ? {}
          : { eventWriter: input.sajuAbuseObservationWriter }),
        ...(input.now === undefined ? {} : { now: input.now }),
      });
      const response = await handleCurrentSubjectSajuCalculationRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier: observedIdentityEvidenceVerifier,
        pool,
        sajuAdapter,
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
