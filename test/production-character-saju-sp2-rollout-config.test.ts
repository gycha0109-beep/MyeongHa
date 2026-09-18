import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_CHARACTER_SAJU_SP2_OFF_POLICY_VERSION_V1,
  PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1,
  ProductionCharacterSajuSp2RolloutConfigErrorV1,
  parseProductionCharacterSajuSp2RolloutConfigV1,
  summarizeProductionCharacterSajuSp2RolloutConfigV1,
} from '../apps/api/src/production-character-saju-sp2-rollout-config.js';

function enabledEnv(
  mode: 'shadow' | 'controlled_reveal' = 'shadow',
): Record<string, string | undefined> {
  return {
    [PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.mode]: mode,
    [PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.policyVersion]:
      'sp2-internal-beta-v1',
    [PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedCharacterIds]:
      'taegyeom,baekheon',
    [PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedDomains]:
      'general,career',
    [PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedEvaluatorVersions]:
      'semantic-evaluator-v1',
    [PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedCohortKeys]:
      'internal_beta',
    [PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.minimumAllowedExamples]:
      '12',
    [PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.minimumForbiddenExamples]:
      '24',
  };
}

describe('production Character Saju SP-2 rollout config v1', () => {
  it('defaults to an explicit fail-closed off policy when rollout env is absent', () => {
    const config = parseProductionCharacterSajuSp2RolloutConfigV1({});

    expect(config).toEqual({
      mode: 'off',
      policy: {
        schemaVersion: 'myeongha-character-saju-sp2-rollout-policy-v1',
        policyVersion: PRODUCTION_CHARACTER_SAJU_SP2_OFF_POLICY_VERSION_V1,
        mode: 'off',
        allowedCharacterIds: [],
        allowedDomains: [],
        allowedEvaluatorVersions: [],
        allowedCohortKeys: [],
        minimumAllowedExamples: 1,
        minimumForbiddenExamples: 1,
      },
    });
  });

  it('keeps explicit off authoritative even if stale enable fields remain in the environment', () => {
    const env = enabledEnv('shadow');
    env[PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.mode] = 'off';

    const config = parseProductionCharacterSajuSp2RolloutConfigV1(env);

    expect(config.mode).toBe('off');
    expect(config.policy.policyVersion).toBe(
      PRODUCTION_CHARACTER_SAJU_SP2_OFF_POLICY_VERSION_V1,
    );
    expect(config.policy.allowedCharacterIds).toEqual([]);
    expect(config.policy.allowedCohortKeys).toEqual([]);
  });

  it.each(['shadow', 'controlled_reveal'] as const)(
    'requires a complete explicit policy for %s mode',
    (mode) => {
      const config = parseProductionCharacterSajuSp2RolloutConfigV1(
        enabledEnv(mode),
      );

      expect(config.mode).toBe(mode);
      expect(config.policy).toEqual({
        schemaVersion: 'myeongha-character-saju-sp2-rollout-policy-v1',
        policyVersion: 'sp2-internal-beta-v1',
        mode,
        allowedCharacterIds: ['taegyeom', 'baekheon'],
        allowedDomains: ['general', 'career'],
        allowedEvaluatorVersions: ['semantic-evaluator-v1'],
        allowedCohortKeys: ['internal_beta'],
        minimumAllowedExamples: 12,
        minimumForbiddenExamples: 24,
      });
    },
  );

  it.each([[''], ['on'], ['public'], ['CONTROLLED_REVEAL']])(
    'rejects unsupported rollout mode %s',
    ([mode]) => {
      expect(() =>
        parseProductionCharacterSajuSp2RolloutConfigV1({
          [PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.mode]: mode,
        }),
      ).toThrowError(ProductionCharacterSajuSp2RolloutConfigErrorV1);
    },
  );

  it.each([
    PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.policyVersion,
    PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedCharacterIds,
    PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedDomains,
    PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedEvaluatorVersions,
    PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedCohortKeys,
    PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.minimumAllowedExamples,
    PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.minimumForbiddenExamples,
  ])('fails closed when enabled mode is missing %s', (missingName) => {
    const env = enabledEnv('controlled_reveal');
    delete env[missingName];

    expect(() =>
      parseProductionCharacterSajuSp2RolloutConfigV1(env),
    ).toThrowError(ProductionCharacterSajuSp2RolloutConfigErrorV1);
  });

  it('rejects duplicate allowlist values, unsupported domains, and invalid corpus thresholds', () => {
    const duplicate = enabledEnv();
    duplicate[
      PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedCharacterIds
    ] = 'taegyeom,taegyeom';
    expect(() =>
      parseProductionCharacterSajuSp2RolloutConfigV1(duplicate),
    ).toThrow(/duplicate/u);

    const badDomain = enabledEnv();
    badDomain[
      PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedDomains
    ] = 'general,unknown_domain';
    expect(() =>
      parseProductionCharacterSajuSp2RolloutConfigV1(badDomain),
    ).toThrow(/unsupported Saju domain/u);

    const badThreshold = enabledEnv();
    badThreshold[
      PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.minimumForbiddenExamples
    ] = '0';
    expect(() =>
      parseProductionCharacterSajuSp2RolloutConfigV1(badThreshold),
    ).toThrow(/integer between 1 and 999999/u);
  });

  it('summarizes operational shape without exposing allowlist or evaluator values', () => {
    const config = parseProductionCharacterSajuSp2RolloutConfigV1(
      enabledEnv('controlled_reveal'),
    );
    const summary = summarizeProductionCharacterSajuSp2RolloutConfigV1(config);
    const serialized = JSON.stringify(summary);

    expect(summary).toEqual({
      configured: true,
      mode: 'controlled_reveal',
      policyVersion: 'sp2-internal-beta-v1',
      allowlistCounts: {
        characters: 2,
        domains: 2,
        evaluators: 1,
        cohorts: 1,
      },
      corpusThresholds: {
        allowedExamples: 12,
        forbiddenExamples: 24,
      },
    });
    expect(serialized).not.toContain('taegyeom');
    expect(serialized).not.toContain('baekheon');
    expect(serialized).not.toContain('semantic-evaluator-v1');
    expect(serialized).not.toContain('internal_beta');
  });
});
