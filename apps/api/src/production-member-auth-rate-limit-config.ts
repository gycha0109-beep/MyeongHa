import {
  parseProductionPostgresRuntimeConfigV1,
  type ProductionPostgresRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';

export const PRODUCTION_MEMBER_AUTH_RATE_LIMIT_ENV_V1 = Object.freeze({
  secret: 'MYEONGHA_AUTH_RATE_LIMIT_SECRET',
} as const);

export interface ProductionMemberAuthRateLimitConfigV1
  extends ProductionPostgresRuntimeConfigV1 {
  readonly authRateLimitSecret: string;
}

export function parseProductionMemberAuthRateLimitConfigV1(
  env: ProductionUserDataRuntimeEnvV1,
): ProductionMemberAuthRateLimitConfigV1 {
  const postgres = parseProductionPostgresRuntimeConfigV1(env);
  const rawSecret = env[PRODUCTION_MEMBER_AUTH_RATE_LIMIT_ENV_V1.secret];
  if (typeof rawSecret !== 'string' || rawSecret.trim().length < 32) {
    throw new Error('MYEONGHA_AUTH_RATE_LIMIT_SECRET is missing or shorter than 32 characters.');
  }

  return Object.freeze({
    ...postgres,
    authRateLimitSecret: rawSecret.trim(),
  });
}
