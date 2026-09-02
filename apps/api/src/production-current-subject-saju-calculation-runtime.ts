import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { handleCurrentSubjectSajuCalculationRequestV1 } from './current-subject-saju-calculation-http.js';
import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import {
  parseProductionSajuRuntimeConfigV1,
  type ProductionSajuRuntimeEnvV1,
} from './production-saju-runtime-config.js';
import { parseProductionUserDataRuntimeConfigV1 } from './production-user-data-runtime-config.js';
import {
  createSajuProductionCalculationHttpAdapterV1,
  type SajuProductionCalculationHttpFetchV1,
} from './saju-production-calculation-http-adapter.js';

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
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly fetchImpl?: SajuProductionCalculationHttpFetchV1;
}

/**
 * Production composition root for current-subject Saju calculation-only execution.
 *
 * Database credentials and the Saju service origin are read exclusively from server
 * environment configuration. The request cannot select a database, upstream origin,
 * calculation policy, Birth Profile, or Birth revision.
 *
 * The identity verifier remains an explicit dependency because this repository still
 * does not own an authoritative production Request credential verifier. Consequently
 * this runtime is ready for that deployment adapter but does not claim to provide it.
 */
export function createProductionCurrentSubjectSajuCalculationRuntimeV1(
  input: CreateProductionCurrentSubjectSajuCalculationRuntimeInputV1,
): ProductionCurrentSubjectSajuCalculationRuntimeV1 {
  const userDataConfig = parseProductionUserDataRuntimeConfigV1(input.env);
  const sajuConfig = parseProductionSajuRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(userDataConfig);
  const sajuAdapter = createSajuProductionCalculationHttpAdapterV1({
    baseUrl: sajuConfig.serviceOrigin,
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionCurrentSubjectSajuCalculationRequestV1) {
      return handleCurrentSubjectSajuCalculationRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier: input.identityEvidenceVerifier,
        pool,
        sajuAdapter,
      });
    },
    close() {
      return pool.close();
    },
  });
}
