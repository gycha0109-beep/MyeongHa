import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createPostgresPortOneVerifiedAgeAdmissionPortV1,
  type PortOneVerifiedAgeAdmissionPortV1,
} from './portone-v2-verified-age-admission-v1.js';
import type { ProductionUserDataRuntimeEnvV1 } from './production-user-data-runtime-config.js';

/**
 * No database migration, public PortOne SDK, or provider network operation is
 * activated by this composition factory. An opt-in ENFORCE switch is allowed
 * only after the operator separately confirms DB application and Privacy
 * disposition. The database query itself remains fail-closed.
 */
export const PORTONE_VERIFIED_AGE_PRODUCTION_ACTIVATION_V1 = Object.freeze({
  enforcementSetting: 'MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT',
  migrationSetting: 'MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE',
  privacySetting: 'MYEONGHA_PORTONE_IDENTITY_PRIVACY_DISPOSITION_STATE',
  off: 'OFF',
  enforce: 'ENFORCE',
  applied: 'APPROVED_AND_APPLIED',
  privacyApproved: 'APPROVED',
} as const);

export function resolveProductionPortOneVerifiedAgeModeV1(
  env: ProductionUserDataRuntimeEnvV1,
): 'off' | 'enforce' {
  const setting = PORTONE_VERIFIED_AGE_PRODUCTION_ACTIVATION_V1;
  const raw = env[setting.enforcementSetting];
  if (raw === undefined || raw === setting.off) return 'off';
  if (raw !== setting.enforce) {
    throw new Error('PortOne verified-age enforcement setting is invalid.');
  }
  if (
    env[setting.migrationSetting] !== setting.applied ||
    env[setting.privacySetting] !== setting.privacyApproved
  ) {
    throw new Error('PortOne verified-age enforcement requires approved DB migration and Privacy disposition.');
  }
  return 'enforce';
}

export function createProductionPortOneVerifiedAgeAdmissionPortV1(input: Readonly<{
  env: ProductionUserDataRuntimeEnvV1;
  pool?: PostgresSubjectPoolV1;
}>): PortOneVerifiedAgeAdmissionPortV1 | undefined {
  if (resolveProductionPortOneVerifiedAgeModeV1(input.env) === 'off') return undefined;
  if (input.pool === undefined) {
    throw new Error('PortOne verified-age enforcement requires the governed subject PostgreSQL pool.');
  }
  return createPostgresPortOneVerifiedAgeAdmissionPortV1(input.pool);
}
