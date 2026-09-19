import {
  parseProductionSajuRuntimeConfigV1,
  type ProductionSajuRuntimeEnvV1,
} from './production-saju-runtime-config.js';
import {
  createSajuProductionReadingHttpAdapterV1,
  type SajuProductReadingResponseAdmissionPortV1,
  type SajuProductionReadingHttpAdapterV1,
} from './saju-production-reading-http-adapter.js';
import type { SajuProductionCalculationHttpFetchV1 } from './saju-production-calculation-http-adapter.js';

export interface CreateProductionSajuReadingTransportInputV1<AdmittedResponse> {
  readonly env: ProductionSajuRuntimeEnvV1;
  /**
   * Optional defense-in-depth admission. Saju is the source authority and must attest
   * successful ProductReadingResponse admission on the authenticated HTTP response.
   */
  readonly admissionPort?: SajuProductReadingResponseAdmissionPortV1<AdmittedResponse>;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly sajuFetchImpl?: SajuProductionCalculationHttpFetchV1;
}

/**
 * Server-owned MyeongHa -> Saju Product Reading transport composition.
 *
 * This creates only the authenticated/source-attested transport dependency. It does not
 * expose a public MyeongHa route, grant Reading transport DB authority, or promote
 * a pending Reading to succeeded. Those remain separate production gates.
 */
export function createProductionSajuReadingTransportV1<AdmittedResponse>(
  input: CreateProductionSajuReadingTransportInputV1<AdmittedResponse>,
): SajuProductionReadingHttpAdapterV1<AdmittedResponse> {
  const config = parseProductionSajuRuntimeConfigV1(input.env);

  return createSajuProductionReadingHttpAdapterV1({
    baseUrl: config.serviceOrigin,
    bearerToken: config.serviceBearer,
    ...(input.admissionPort === undefined
      ? {}
      : { admissionPort: input.admissionPort }),
    ...(input.sajuFetchImpl === undefined
      ? {}
      : { fetchImpl: input.sajuFetchImpl }),
  });
}
