import { handleCurrentSubjectSajuPreviewReadingRequestV1 } from './current-subject-saju-preview-reading-http.js';
import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
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
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  readonly sajuFetchImpl?: SajuProductionCalculationHttpFetchV1;
}

export function createProductionCurrentSubjectSajuPreviewReadingRuntimeV1(
  input: CreateProductionCurrentSubjectSajuPreviewReadingRuntimeInputV1,
): ProductionCurrentSubjectSajuPreviewReadingRuntimeV1 {
  const userDataConfig = parseProductionUserDataRuntimeConfigV1(input.env);
  const sajuConfig = parseProductionSajuRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(userDataConfig);
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
    handleRequest(requestInput: ProductionCurrentSubjectSajuPreviewReadingRequestV1) {
      return handleCurrentSubjectSajuPreviewReadingRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool,
        sajuAdapter,
      });
    },
    close() {
      return pool.close();
    },
  });
}
