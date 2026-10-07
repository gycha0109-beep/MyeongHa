import {
  parseProductionSajuRuntimeConfigV1,
  type ProductionSajuRuntimeEnvV1,
} from './production-saju-runtime-config.js';
import {
  createSajuGovernedFaceHandoffHttpAdapterV1,
  type SajuGovernedFaceHandoffHttpAdapterV1,
} from './saju-governed-face-handoff-http-adapter.js';
import type {
  SajuProductionCalculationHttpFetchV1,
} from './saju-production-calculation-http-adapter.js';

export interface CreateProductionSajuGovernedFaceHandoffTransportInputV1 {
  readonly env:
    ProductionSajuRuntimeEnvV1;
  /** Server-side test/runtime injection only. Never derived from client input. */
  readonly sajuFetchImpl?:
    SajuProductionCalculationHttpFetchV1;
}

/**
 * Server-owned MyeongHa -> Saju governed Face handoff transport.
 *
 * This composes only authenticated transport plus local defense-in-depth
 * admission. It does not create Face semantics, authorize a blocked source,
 * select Character lenses, or persist/reveal a Character artifact.
 */
export function createProductionSajuGovernedFaceHandoffTransportV1(
  input:
    CreateProductionSajuGovernedFaceHandoffTransportInputV1,
): SajuGovernedFaceHandoffHttpAdapterV1 {
  const config =
    parseProductionSajuRuntimeConfigV1(
      input.env,
    );

  return createSajuGovernedFaceHandoffHttpAdapterV1({
    baseUrl:
      config.serviceOrigin,
    bearerToken:
      config.serviceBearer,
    ...(input.sajuFetchImpl === undefined
      ? {}
      : {
          fetchImpl:
            input.sajuFetchImpl,
        }),
  });
}
