import {
  parseProductionCharacterSajuSp2RolloutConfigV1,
  ProductionCharacterSajuSp2RolloutConfigErrorV1,
} from './production-character-saju-sp2-rollout-config.js';
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
export type SajuProductReadingProductionReadinessV1 = 'blocked_by_authority';
export type CharacterSajuSp2ProductionReadinessV1 =
  | 'disabled'
  | 'blocked_by_product_reading_authority'
  | 'misconfigured';

export interface ProductionReadinessReportV1 {
  readonly status: ProductionReadinessStatusV1;
  readonly capabilities: Readonly<{
    userData: ProductionCapabilityReadinessV1;
    sajuCalculation: ProductionCapabilityReadinessV1;
    sajuProductReading: SajuProductReadingProductionReadinessV1;
    characterSajuSp2: CharacterSajuSp2ProductionReadinessV1;
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

function characterSajuSp2Readiness(
  env: ProductionSajuRuntimeEnvV1,
): CharacterSajuSp2ProductionReadinessV1 {
  try {
    const config = parseProductionCharacterSajuSp2RolloutConfigV1(env);
    return config.mode === 'off'
      ? 'disabled'
      : 'blocked_by_product_reading_authority';
  } catch (error) {
    if (error instanceof ProductionCharacterSajuSp2RolloutConfigErrorV1) {
      return 'misconfigured';
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
 *
 * ProductReadingResponse v2 admission is source-owned and ready, but the Saju
 * Production Interpretation Authority and public Production Reading runtime remain
 * blocked. Keep Product Reading explicitly fail-closed here without making that
 * semantic-authority hold degrade otherwise healthy calculation/user-data runtime.
 */
export function evaluateProductionReadinessV1(
  env: ProductionSajuRuntimeEnvV1,
): ProductionReadinessReportV1 {
  const userDataReady = hasValidUserDataConfig(env);
  const sajuReady = hasValidSajuConfig(env);
  const characterSajuSp2 = characterSajuSp2Readiness(env);

  const status: ProductionReadinessStatusV1 = !userDataReady
    ? 'unready'
    : !sajuReady || characterSajuSp2 === 'misconfigured'
      ? 'degraded'
      : 'ready';

  return Object.freeze({
    status,
    capabilities: Object.freeze({
      userData: userDataReady ? 'ready' : 'unready',
      sajuCalculation: sajuReady ? 'ready' : 'degraded',
      sajuProductReading: 'blocked_by_authority',
      characterSajuSp2,
    }),
  });
}
