import { handleCurrentSubjectSajuPreviewReadingRequestV1 } from './current-subject-saju-preview-reading-http.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionSajuRuntimeConfigV1,
  type ProductionSajuRuntimeEnvV1,
} from './production-saju-runtime-config.js';
import { parseProductionUserDataRuntimeConfigV1 } from './production-user-data-runtime-config.js';
import {
  createSajuPreviewReadingHttpAdapterV1,
} from './saju-production-reading-http-adapter.js';
import type { SajuProductionCalculationHttpFetchV1 } from './saju-production-calculation-http-adapter.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createSajuAbuseObservedIdentityVerifierV1,
  observeSajuAbuseOutcomeV1,
  type SajuAbuseObservationWriterV1,
  type SajuAbuseOutcomeObservationWriterV1,
} from './saju-abuse-observability.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';

export interface ProductionCurrentSubjectSajuPreviewReadingRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionCurrentSubjectSajuPreviewReadingRuntimeV1 {
  handleRequest(input: ProductionCurrentSubjectSajuPreviewReadingRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionCurrentSubjectSajuPreviewReadingRuntimeInputV1 {
  readonly env: ProductionSajuRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  readonly sajuFetchImpl?: SajuProductionCalculationHttpFetchV1;
  /** Observe-only baseline injection. Production defaults to the privacy-safe logger. */
  readonly sajuAbuseObservationWriter?: SajuAbuseObservationWriterV1;
  /** Observe-only outcome injection. Production defaults to the privacy-safe logger. */
  readonly sajuAbuseOutcomeWriter?: SajuAbuseOutcomeObservationWriterV1;
  /** Test/runtime clock injection only. */
  readonly now?: () => number;
}

export function createProductionCurrentSubjectSajuPreviewReadingRuntimeV1(
  input: CreateProductionCurrentSubjectSajuPreviewReadingRuntimeInputV1,
): ProductionCurrentSubjectSajuPreviewReadingRuntimeV1 {
  const userDataConfig = parseProductionUserDataRuntimeConfigV1(input.env);
  const sajuConfig = parseProductionSajuRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config: userDataConfig,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config: userDataConfig,
    ...(input.memberFetchImpl === undefined
      ? {}
      : { memberFetchImpl: input.memberFetchImpl }),
  });
  const sajuAdapter = createSajuPreviewReadingHttpAdapterV1({
    baseUrl: sajuConfig.serviceOrigin,
    bearerToken: sajuConfig.serviceBearer,
    ...(input.sajuFetchImpl === undefined ? {} : { fetchImpl: input.sajuFetchImpl }),
  });

  return Object.freeze({
    async handleRequest(requestInput: ProductionCurrentSubjectSajuPreviewReadingRequestV1) {
      const observedIdentityEvidenceVerifier = createSajuAbuseObservedIdentityVerifierV1({
        delegate: identityEvidenceVerifier,
        routeId: 'api.me.saju.preview-reading',
        requestId: requestInput.requestId,
        secret: userDataConfig.guestFingerprintSecret,
        ...(input.sajuAbuseObservationWriter === undefined
          ? {}
          : { eventWriter: input.sajuAbuseObservationWriter }),
        ...(input.now === undefined ? {} : { now: input.now }),
      });
      const response = await handleCurrentSubjectSajuPreviewReadingRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier: observedIdentityEvidenceVerifier,
        pool: poolLease.pool,
        sajuAdapter,
      });

      observeSajuAbuseOutcomeV1({
        routeId: 'api.me.saju.preview-reading',
        requestId: requestInput.requestId,
        httpStatus: response.status,
        ...(input.sajuAbuseOutcomeWriter === undefined
          ? {}
          : { eventWriter: input.sajuAbuseOutcomeWriter }),
        ...(input.now === undefined ? {} : { now: input.now }),
      });

      return response;
    },
    close() {
      return poolLease.close();
    },
  });
}
