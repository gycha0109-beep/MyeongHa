import { describe, expect, it } from 'vitest';
import {
  PORTONE_VERIFIED_AGE_PRODUCTION_ACTIVATION_V1,
  createProductionPortOneVerifiedAgeAdmissionPortV1,
  resolveProductionPortOneVerifiedAgeModeV1,
} from '../apps/api/src/portone-v2-age-enforcement-activation-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

describe('PortOne verified-age production admission activation', () => {
  const { enforcementSetting: mode, migrationSetting: migration, privacySetting: privacy } =
    PORTONE_VERIFIED_AGE_PRODUCTION_ACTIVATION_V1;
  const pool: PostgresSubjectPoolV1 = {
    connect: async () => { throw new Error('DB must not connect during composition'); },
  };

  it('is OFF with no flags and does not open a DB connection', () => {
    expect(resolveProductionPortOneVerifiedAgeModeV1({})).toBe('off');
    expect(createProductionPortOneVerifiedAgeAdmissionPortV1({ env: {}, pool })).toBeUndefined();
    expect(createProductionPortOneVerifiedAgeAdmissionPortV1({
      env: { [mode]: 'OFF', [migration]: 'APPROVED_AND_APPLIED', [privacy]: 'APPROVED' },
      pool,
    })).toBeUndefined();
  });

  it('refuses invalid flags and missing DB/Privacy approvals', () => {
    for (const env of [
      { [mode]: 'true' },
      { [mode]: 'ENFORCE' },
      { [mode]: 'ENFORCE', [migration]: 'APPROVED_AND_APPLIED' },
      { [mode]: 'ENFORCE', [privacy]: 'APPROVED' },
      { [mode]: 'ENFORCE', [migration]: 'PENDING', [privacy]: 'APPROVED' },
    ]) {
      expect(() => createProductionPortOneVerifiedAgeAdmissionPortV1({ env, pool })).toThrow();
    }
  });

  it('composes the canonical trusted-subject DB adapter only with both approvals and a pool', () => {
    const env = { [mode]: 'ENFORCE', [migration]: 'APPROVED_AND_APPLIED', [privacy]: 'APPROVED' };
    expect(resolveProductionPortOneVerifiedAgeModeV1(env)).toBe('enforce');
    expect(() => createProductionPortOneVerifiedAgeAdmissionPortV1({ env })).toThrow();
    const admission = createProductionPortOneVerifiedAgeAdmissionPortV1({ env, pool });
    expect(admission?.admitFreePersonalization).toEqual(expect.any(Function));
    expect(admission?.admitAdultDirectPurchase).toEqual(expect.any(Function));
  });
});
