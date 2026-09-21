import { createHash } from 'node:crypto';

import {
  runReaderInterpretationPreviewHttpV1,
  type ReaderInterpretationPreviewHttpResponseV1,
} from './reader-interpretation-preview-http.js';

export const PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1 = Object.freeze({
  mode: 'MYEONGHA_READER_INTERPRETATION_MODE',
  policyVersion: 'MYEONGHA_READER_INTERPRETATION_POLICY_VERSION',
  allowedSubjectHashes: 'MYEONGHA_READER_INTERPRETATION_ALLOWED_SUBJECT_HASHES',
  hostedCanaryRunId: 'MYEONGHA_READER_INTERPRETATION_HOSTED_CANARY_RUN_ID',
  expectedSajuSha: 'MYEONGHA_READER_INTERPRETATION_EXPECTED_SAJU_SHA',
  expectedMyeonghaSha: 'MYEONGHA_READER_INTERPRETATION_EXPECTED_MYEONGHA_SHA',
} as const);

export const PRODUCTION_READER_INTERPRETATION_OFF_POLICY_VERSION_V1 =
  'production-reader-interpretation-off-v1' as const;

export const READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1 = Object.freeze({
  runId: '35624392882',
  sajuSha: '54667c70e46140b004d3b81c5797191538f6cbc3',
  myeonghaSha: 'a2873e4546e5a7cea822ce9ccc2878f4de5e9711',
} as const);

export type ProductionReaderInterpretationActivationModeV1 =
  | 'off'
  | 'internal_preview';

export type ProductionReaderInterpretationActivationEnvV1 = Readonly<
  Record<string, string | undefined>
>;

export type ProductionReaderInterpretationActivationConfigV1 =
  | Readonly<{
      mode: 'off';
      policyVersion: typeof PRODUCTION_READER_INTERPRETATION_OFF_POLICY_VERSION_V1;
      allowedSubjectHashes: readonly [];
      hostedCanaryEvidence: null;
    }>
  | Readonly<{
      mode: 'internal_preview';
      policyVersion: string;
      allowedSubjectHashes: readonly string[];
      hostedCanaryEvidence: typeof READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1;
    }>;

export interface ProductionReaderInterpretationActivationSummaryV1 {
  readonly configured: true;
  readonly mode: ProductionReaderInterpretationActivationModeV1;
  readonly policyVersion: string;
  readonly allowedSubjectCount: number;
  readonly hostedCanaryRunId: string | null;
  readonly expectedSajuSha: string | null;
  readonly expectedMyeonghaSha: string | null;
  readonly publicRouteEnabled: false;
}

export class ProductionReaderInterpretationActivationConfigErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionReaderInterpretationActivationConfigErrorV1';
  }
}

export class ProductionReaderInterpretationActivationErrorV1 extends Error {
  constructor(
    readonly code: 'AUTH_REQUIRED' | 'ACTIVATION_DISABLED' | 'SUBJECT_NOT_ALLOWED',
    message: string,
  ) {
    super(message);
    this.name = 'ProductionReaderInterpretationActivationErrorV1';
  }
}

function failConfig(message: string): never {
  throw new ProductionReaderInterpretationActivationConfigErrorV1(message);
}

function requiredEnv(
  env: ProductionReaderInterpretationActivationEnvV1,
  name: string,
): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return failConfig(
      'Required Reader Interpretation activation setting is missing: ' + name + '.',
    );
  }
  return value.trim();
}

function parseMode(
  env: ProductionReaderInterpretationActivationEnvV1,
): ProductionReaderInterpretationActivationModeV1 {
  const raw = env[PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.mode];
  if (raw === undefined) return 'off';
  const mode = raw.trim();
  if (mode !== 'off' && mode !== 'internal_preview') {
    return failConfig(
      'MYEONGHA_READER_INTERPRETATION_MODE must be off or internal_preview.',
    );
  }
  return mode;
}

function offConfig(): ProductionReaderInterpretationActivationConfigV1 {
  return Object.freeze({
    mode: 'off' as const,
    policyVersion: PRODUCTION_READER_INTERPRETATION_OFF_POLICY_VERSION_V1,
    allowedSubjectHashes: Object.freeze([]) as readonly [],
    hostedCanaryEvidence: null,
  });
}

function parseAllowedSubjectHashes(
  env: ProductionReaderInterpretationActivationEnvV1,
): readonly string[] {
  const raw = requiredEnv(
    env,
    PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.allowedSubjectHashes,
  );
  const hashes = raw.split(',').map((value) => value.trim());
  if (
    hashes.length < 1 ||
    hashes.length > 3 ||
    hashes.some((value) => !/^[0-9a-f]{64}$/u.test(value))
  ) {
    return failConfig(
      'MYEONGHA_READER_INTERPRETATION_ALLOWED_SUBJECT_HASHES must contain 1-3 lowercase SHA-256 hashes.',
    );
  }
  if (new Set(hashes).size !== hashes.length) {
    return failConfig(
      'MYEONGHA_READER_INTERPRETATION_ALLOWED_SUBJECT_HASHES must not contain duplicates.',
    );
  }
  return Object.freeze(hashes);
}

function requirePinnedEvidence(
  env: ProductionReaderInterpretationActivationEnvV1,
): typeof READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1 {
  const runId = requiredEnv(
    env,
    PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.hostedCanaryRunId,
  );
  const sajuSha = requiredEnv(
    env,
    PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.expectedSajuSha,
  );
  const myeonghaSha = requiredEnv(
    env,
    PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.expectedMyeonghaSha,
  );

  if (
    runId !== READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.runId ||
    sajuSha !== READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.sajuSha ||
    myeonghaSha !== READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.myeonghaSha
  ) {
    return failConfig(
      'Reader Interpretation internal_preview must pin the reviewed Hosted Canary evidence exactly.',
    );
  }
  return READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1;
}

export function parseProductionReaderInterpretationActivationConfigV1(
  env: ProductionReaderInterpretationActivationEnvV1,
): ProductionReaderInterpretationActivationConfigV1 {
  const mode = parseMode(env);
  if (mode === 'off') return offConfig();

  const policyVersion = requiredEnv(
    env,
    PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.policyVersion,
  );
  if (policyVersion.length > 128) {
    return failConfig(
      'MYEONGHA_READER_INTERPRETATION_POLICY_VERSION exceeds the supported bound.',
    );
  }

  return Object.freeze({
    mode: 'internal_preview' as const,
    policyVersion,
    allowedSubjectHashes: parseAllowedSubjectHashes(env),
    hostedCanaryEvidence: requirePinnedEvidence(env),
  });
}

function requireSubject(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0 || value.trim().length > 512) {
    throw new ProductionReaderInterpretationActivationErrorV1(
      'AUTH_REQUIRED',
      'Reader Interpretation activation requires an authenticated subject.',
    );
  }
  return value.trim();
}

export function hashReaderInterpretationActivationSubjectV1(
  subjectId: string,
): string {
  const normalized = requireSubject(subjectId);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function assertProductionReaderInterpretationActivationV1(input: {
  readonly config: ProductionReaderInterpretationActivationConfigV1;
  readonly resolvedSubjectId: string | undefined;
}): void {
  const subjectId = requireSubject(input.resolvedSubjectId);
  if (input.config.mode === 'off') {
    throw new ProductionReaderInterpretationActivationErrorV1(
      'ACTIVATION_DISABLED',
      'Production Reader Interpretation is disabled.',
    );
  }

  const subjectHash = hashReaderInterpretationActivationSubjectV1(subjectId);
  if (!input.config.allowedSubjectHashes.includes(subjectHash)) {
    throw new ProductionReaderInterpretationActivationErrorV1(
      'SUBJECT_NOT_ALLOWED',
      'Authenticated subject is outside the bounded Reader Interpretation internal preview cohort.',
    );
  }
}

export function summarizeProductionReaderInterpretationActivationConfigV1(
  config: ProductionReaderInterpretationActivationConfigV1,
): ProductionReaderInterpretationActivationSummaryV1 {
  return Object.freeze({
    configured: true as const,
    mode: config.mode,
    policyVersion: config.policyVersion,
    allowedSubjectCount: config.allowedSubjectHashes.length,
    hostedCanaryRunId: config.hostedCanaryEvidence?.runId ?? null,
    expectedSajuSha: config.hostedCanaryEvidence?.sajuSha ?? null,
    expectedMyeonghaSha: config.hostedCanaryEvidence?.myeonghaSha ?? null,
    publicRouteEnabled: false as const,
  });
}

export type RunProductionReaderInterpretationPreviewHttpInputV1 =
  Parameters<typeof runReaderInterpretationPreviewHttpV1>[0] & {
    readonly activationEnv: ProductionReaderInterpretationActivationEnvV1;
  };

export async function runProductionReaderInterpretationPreviewHttpV1(
  input: RunProductionReaderInterpretationPreviewHttpInputV1,
): Promise<ReaderInterpretationPreviewHttpResponseV1> {
  const config = parseProductionReaderInterpretationActivationConfigV1(
    input.activationEnv,
  );
  assertProductionReaderInterpretationActivationV1({
    config,
    resolvedSubjectId: input.resolvedSubjectId,
  });

  const { activationEnv: _activationEnv, ...previewInput } = input;
  return runReaderInterpretationPreviewHttpV1(previewInput);
}
