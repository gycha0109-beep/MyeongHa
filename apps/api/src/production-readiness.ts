import {
  parseProductionSajuRuntimeConfigV1,
  ProductionSajuRuntimeConfigErrorV1,
  type ProductionSajuRuntimeEnvV1,
} from './production-saju-runtime-config.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  ProductionUserDataRuntimeConfigErrorV1,
} from './production-user-data-runtime-config.js';

export type ProductionReadinessStatusV1 = 'ready' | 'degraded' | 'unready';
export type ProductionCapabilityReadinessV1 = 'ready' | 'degraded' | 'unready';

export interface ProductionReadinessReportV1 {
  readonly status: ProductionReadinessStatusV1;
  readonly capabilities: Readonly<{
    userData: ProductionCapabilityReadinessV1;
    sajuCalculation: ProductionCapabilityReadinessV1;
  }>;
}

function hasValidUserDataConfig(env: ProductionSajuRuntimeEnvV1): boolean {
  try {
    parseProductionUserDataRuntimeConfigV1(env);
    return true;
  } catch (error) {
    if (error instanceof ProductionUserDataRuntimeConfigErrorV1) {
      return false;
    }
    throw error;
  }
}

function hasValidSajuConfig(env: ProductionSajuRuntimeEnvV1): boolean {
  try {
    parseProductionSajuRuntimeConfigV1(env);
    return true;
  } catch (error) {
    if (error instanceof ProductionSajuRuntimeConfigErrorV1) {
      return false;
    }
    throw error;
  }
}

/**
 * Local production configuration preflight only.
 *
 * This deliberately does not contact PostgreSQL, Supabase Auth, Saju, or any other
 * network dependency. Dependency availability is measured separately so a health
 * probe cannot amplify an upstream outage.
 */
export function evaluateProductionReadinessV1(
  env: ProductionSajuRuntimeEnvV1,
): ProductionReadinessReportV1 {
  const userDataReady = hasValidUserDataConfig(env);
  const sajuReady = hasValidSajuConfig(env);

  const status: ProductionReadinessStatusV1 = !userDataReady
    ? 'unready'
    : sajuReady
      ? 'ready'
      : 'degraded';

  return Object.freeze({
    status,
    capabilities: Object.freeze({
      userData: userDataReady ? 'ready' : 'unready',
      sajuCalculation: sajuReady ? 'ready' : 'degraded',
    }),
  });
}
