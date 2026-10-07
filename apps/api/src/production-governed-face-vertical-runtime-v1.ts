import type {
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import {
  createPostgresCharacterFaceGovernedReadingDurableCommitPortV1,
} from './postgres-character-face-governed-reading-artifact-commit.js';
import {
  createProductionGovernedFaceVerticalV1,
  type GovernedFaceBaseRuntimeProviderV1,
  type GovernedFacePresentationProviderV1,
  type ProductionGovernedFaceVerticalV1,
} from './production-governed-face-vertical-v1.js';
import {
  createProductionSajuGovernedFaceHandoffTransportV1,
} from './production-saju-governed-face-handoff-transport.js';
import type {
  ProductionSajuRuntimeEnvV1,
} from './production-saju-runtime-config.js';
import type {
  SajuProductionCalculationHttpFetchV1,
} from './saju-production-calculation-http-adapter.js';

export const PRODUCTION_GOVERNED_FACE_VERTICAL_RUNTIME_VERSION_V1 =
  'production-governed-face-vertical-runtime-v1' as const;

export interface CreateProductionGovernedFaceVerticalRuntimeInputV1 {
  readonly sajuEnv:
    ProductionSajuRuntimeEnvV1;
  readonly databaseClient:
    PostgresTransactionQueryV1;
  readonly baseRuntimeProvider:
    GovernedFaceBaseRuntimeProviderV1;
  readonly presentationProvider:
    GovernedFacePresentationProviderV1;
  /** Server-side test/runtime injection only. Never derived from browser input. */
  readonly sajuFetchImpl?:
    SajuProductionCalculationHttpFetchV1;
}

/**
 * Server-only composition root for the governed Face vertical.
 *
 * No browser/client payload can provide semantic authority, Character profiles,
 * runtime context, transport credentials, or the durable commit port.
 */
export function createProductionGovernedFaceVerticalRuntimeV1(
  input:
    CreateProductionGovernedFaceVerticalRuntimeInputV1,
): ProductionGovernedFaceVerticalV1 {
  const transport =
    createProductionSajuGovernedFaceHandoffTransportV1({
      env:
        input.sajuEnv,
      ...(input.sajuFetchImpl === undefined
        ? {}
        : {
            sajuFetchImpl:
              input.sajuFetchImpl,
          }),
    });

  const commitPort =
    createPostgresCharacterFaceGovernedReadingDurableCommitPortV1(
      input.databaseClient,
    );

  return createProductionGovernedFaceVerticalV1({
    transport,
    baseRuntimeProvider:
      input.baseRuntimeProvider,
    presentationProvider:
      input.presentationProvider,
    commitPort,
  });
}
