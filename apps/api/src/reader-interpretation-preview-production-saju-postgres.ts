import {
  executeReaderInterpretationPreviewPostgresV1,
  type ExecuteReaderInterpretationPreviewPostgresInputV1,
} from './reader-interpretation-preview-postgres-execution.js';
import type {
  OfficialReadingCharacterGroundingProjectionInputV1,
  OfficialReadingCharacterGroundingProjectionPortV1,
} from './reader-interpretation-preview-runtime-v1.js';
import {
  createProductionSajuCharacterGroundingProjectionPortV1,
} from './saju-character-grounding-http-adapter.js';
import type { SajuProductionCalculationHttpFetchV1 } from './saju-production-calculation-http-adapter.js';
import type { ProductionSajuRuntimeEnvV1 } from './production-saju-runtime-config.js';

export type ExecuteProductionReaderInterpretationPostgresInputV1 =
  Omit<ExecuteReaderInterpretationPreviewPostgresInputV1, 'groundingProjectionPort'> & {
    readonly sajuRuntimeEnv: ProductionSajuRuntimeEnvV1;
    readonly sajuTimeoutMs?: number;
    readonly sajuHttpFetchImpl?: SajuProductionCalculationHttpFetchV1;
  };

/**
 * Dormant server-only Production dependency composition for Reader Preview.
 *
 * Reuses the existing transaction-local canonical Subject/Reader access checks.
 * The authenticated Saju projection adapter is instantiated lazily: disabled
 * modes, out-of-cohort subjects and unauthorized Official Readings never require
 * Saju configuration and never issue an upstream grounding request.
 *
 * This function DOES NOT register a route, issue entitlement, persist a paid
 * Interpretation, or activate any public Reader.
 */
export function executeProductionReaderInterpretationPreviewPostgresV1(
  input: ExecuteProductionReaderInterpretationPostgresInputV1,
): ReturnType<typeof executeReaderInterpretationPreviewPostgresV1> {
  const { sajuRuntimeEnv, sajuTimeoutMs, sajuHttpFetchImpl, ...postgresInput } = input;
  let port: OfficialReadingCharacterGroundingProjectionPortV1 | undefined;

  return executeReaderInterpretationPreviewPostgresV1({
    ...postgresInput,
    groundingProjectionPort: Object.freeze({
      projectGrounding(projectionInput: OfficialReadingCharacterGroundingProjectionInputV1) {
        port ??= createProductionSajuCharacterGroundingProjectionPortV1({
          env: sajuRuntimeEnv,
          ...(sajuTimeoutMs === undefined ? {} : { timeoutMs: sajuTimeoutMs }),
          ...(sajuHttpFetchImpl === undefined ? {} : { fetchImpl: sajuHttpFetchImpl }),
        });
        return port.projectGrounding(projectionInput);
      },
    }),
  });
}
