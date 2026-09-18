import type { SajuDomain } from '../../../packages/contracts/src/index.js';
import {
  CHARACTER_SAJU_SP2_ROLLOUT_POLICY_SCHEMA_VERSION_V1,
  type CharacterSajuSp2RolloutModeV1,
  type CharacterSajuSp2RolloutPolicyV1,
} from '../../../packages/domain/src/index.js';

export const PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1 = Object.freeze({
  mode: 'MYEONGHA_CHARACTER_SAJU_SP2_MODE',
  policyVersion: 'MYEONGHA_CHARACTER_SAJU_SP2_POLICY_VERSION',
  allowedCharacterIds: 'MYEONGHA_CHARACTER_SAJU_SP2_ALLOWED_CHARACTER_IDS',
  allowedDomains: 'MYEONGHA_CHARACTER_SAJU_SP2_ALLOWED_DOMAINS',
  allowedEvaluatorVersions:
    'MYEONGHA_CHARACTER_SAJU_SP2_ALLOWED_EVALUATOR_VERSIONS',
  allowedCohortKeys: 'MYEONGHA_CHARACTER_SAJU_SP2_ALLOWED_COHORT_KEYS',
  minimumAllowedExamples:
    'MYEONGHA_CHARACTER_SAJU_SP2_MIN_ALLOWED_EXAMPLES',
  minimumForbiddenExamples:
    'MYEONGHA_CHARACTER_SAJU_SP2_MIN_FORBIDDEN_EXAMPLES',
} as const);

export const PRODUCTION_CHARACTER_SAJU_SP2_OFF_POLICY_VERSION_V1 =
  'production-character-saju-sp2-off-v1' as const;

export type ProductionCharacterSajuSp2RolloutEnvV1 = Readonly<
  Record<string, string | undefined>
>;

export interface ProductionCharacterSajuSp2RolloutConfigV1 {
  readonly mode: CharacterSajuSp2RolloutModeV1;
  readonly policy: CharacterSajuSp2RolloutPolicyV1;
}

export interface ProductionCharacterSajuSp2RolloutConfigSummaryV1 {
  readonly configured: true;
  readonly mode: CharacterSajuSp2RolloutModeV1;
  readonly policyVersion: string;
  readonly allowlistCounts: Readonly<{
    characters: number;
    domains: number;
    evaluators: number;
    cohorts: number;
  }>;
  readonly corpusThresholds: Readonly<{
    allowedExamples: number;
    forbiddenExamples: number;
  }>;
}

export class ProductionCharacterSajuSp2RolloutConfigErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionCharacterSajuSp2RolloutConfigErrorV1';
  }
}

const SAJU_DOMAINS = Object.freeze([
  'general',
  'family',
  'relationship',
  'compatibility',
  'career',
  'business',
  'wealth',
  'life_stage',
  'question_specific',
] as const satisfies readonly SajuDomain[]);

function fail(message: string): never {
  throw new ProductionCharacterSajuSp2RolloutConfigErrorV1(message);
}

function optionalMode(
  env: ProductionCharacterSajuSp2RolloutEnvV1,
): CharacterSajuSp2RolloutModeV1 {
  const raw = env[PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.mode];
  if (raw === undefined) return 'off';
  const value = raw.trim();
  if (
    value !== 'off' &&
    value !== 'shadow' &&
    value !== 'controlled_reveal'
  ) {
    return fail(
      'MYEONGHA_CHARACTER_SAJU_SP2_MODE must be off, shadow, or controlled_reveal.',
    );
  }
  return value;
}

function requiredEnv(
  env: ProductionCharacterSajuSp2RolloutEnvV1,
  name: string,
): string {
  const raw = env[name];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fail('Required Character Saju SP-2 rollout setting is missing: ' + name + '.');
  }
  return raw.trim();
}

function parseCsv(
  env: ProductionCharacterSajuSp2RolloutEnvV1,
  name: string,
): readonly string[] {
  const value = requiredEnv(env, name);
  const items = value.split(',').map((item) => item.trim());
  if (
    items.length === 0 ||
    items.length > 128 ||
    items.some((item) => item.length === 0 || item.length > 256)
  ) {
    return fail(name + ' must contain 1-128 non-empty comma-separated values.');
  }
  if (new Set(items).size !== items.length) {
    return fail(name + ' must not contain duplicate values.');
  }
  return Object.freeze(items);
}

function parseDomains(
  env: ProductionCharacterSajuSp2RolloutEnvV1,
): readonly SajuDomain[] {
  const items = parseCsv(
    env,
    PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedDomains,
  );
  return Object.freeze(
    items.map((item) => {
      if (!SAJU_DOMAINS.includes(item as SajuDomain)) {
        return fail(
          'MYEONGHA_CHARACTER_SAJU_SP2_ALLOWED_DOMAINS contains an unsupported Saju domain.',
        );
      }
      return item as SajuDomain;
    }),
  );
}

function parsePositiveInteger(
  env: ProductionCharacterSajuSp2RolloutEnvV1,
  name: string,
): number {
  const raw = requiredEnv(env, name);
  if (!/^[1-9][0-9]{0,5}$/u.test(raw)) {
    return fail(name + ' must be an integer between 1 and 999999.');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 999999) {
    return fail(name + ' must be an integer between 1 and 999999.');
  }
  return value;
}

function offConfig(): ProductionCharacterSajuSp2RolloutConfigV1 {
  return Object.freeze({
    mode: 'off' as const,
    policy: Object.freeze({
      schemaVersion: CHARACTER_SAJU_SP2_ROLLOUT_POLICY_SCHEMA_VERSION_V1,
      policyVersion: PRODUCTION_CHARACTER_SAJU_SP2_OFF_POLICY_VERSION_V1,
      mode: 'off' as const,
      allowedCharacterIds: Object.freeze([]),
      allowedDomains: Object.freeze([]),
      allowedEvaluatorVersions: Object.freeze([]),
      allowedCohortKeys: Object.freeze([]),
      minimumAllowedExamples: 1,
      minimumForbiddenExamples: 1,
    }),
  });
}

export function parseProductionCharacterSajuSp2RolloutConfigV1(
  env: ProductionCharacterSajuSp2RolloutEnvV1,
): ProductionCharacterSajuSp2RolloutConfigV1 {
  const mode = optionalMode(env);
  if (mode === 'off') return offConfig();

  const policy = Object.freeze({
    schemaVersion: CHARACTER_SAJU_SP2_ROLLOUT_POLICY_SCHEMA_VERSION_V1,
    policyVersion: requiredEnv(
      env,
      PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.policyVersion,
    ),
    mode,
    allowedCharacterIds: parseCsv(
      env,
      PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedCharacterIds,
    ),
    allowedDomains: parseDomains(env),
    allowedEvaluatorVersions: parseCsv(
      env,
      PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedEvaluatorVersions,
    ),
    allowedCohortKeys: parseCsv(
      env,
      PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.allowedCohortKeys,
    ),
    minimumAllowedExamples: parsePositiveInteger(
      env,
      PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.minimumAllowedExamples,
    ),
    minimumForbiddenExamples: parsePositiveInteger(
      env,
      PRODUCTION_CHARACTER_SAJU_SP2_ROLLOUT_ENV_V1.minimumForbiddenExamples,
    ),
  }) satisfies CharacterSajuSp2RolloutPolicyV1;

  return Object.freeze({ mode, policy });
}

export function summarizeProductionCharacterSajuSp2RolloutConfigV1(
  config: ProductionCharacterSajuSp2RolloutConfigV1,
): ProductionCharacterSajuSp2RolloutConfigSummaryV1 {
  return Object.freeze({
    configured: true as const,
    mode: config.mode,
    policyVersion: config.policy.policyVersion,
    allowlistCounts: Object.freeze({
      characters: config.policy.allowedCharacterIds.length,
      domains: config.policy.allowedDomains.length,
      evaluators: config.policy.allowedEvaluatorVersions.length,
      cohorts: config.policy.allowedCohortKeys.length,
    }),
    corpusThresholds: Object.freeze({
      allowedExamples: config.policy.minimumAllowedExamples,
      forbiddenExamples: config.policy.minimumForbiddenExamples,
    }),
  });
}
