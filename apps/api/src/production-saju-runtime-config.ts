export const PRODUCTION_SAJU_RUNTIME_ENV_V1 = Object.freeze({
  serviceOrigin: 'MYEONGHA_SAJU_SERVICE_ORIGIN',
  serviceBearer: 'MYEONGHA_SAJU_SERVICE_BEARER',
} as const);

export type ProductionSajuRuntimeEnvV1 = Readonly<Record<string, string | undefined>>;

export interface ProductionSajuRuntimeConfigV1 {
  readonly serviceOrigin: string;
  readonly serviceBearer: string;
}

export interface ProductionSajuRuntimeConfigSummaryV1 {
  readonly serviceConfigured: true;
  readonly serviceOrigin: string;
}

export class ProductionSajuRuntimeConfigErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionSajuRuntimeConfigErrorV1';
  }
}

function fail(message: string): never {
  throw new ProductionSajuRuntimeConfigErrorV1(message);
}

function requiredEnv(env: ProductionSajuRuntimeEnvV1, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(`Required production Saju runtime setting is missing: ${name}.`);
  }
  return value.trim();
}

function parseServiceOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('MYEONGHA_SAJU_SERVICE_ORIGIN must be a valid HTTPS origin.');
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hostname.length === 0 ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.origin !== value
  ) {
    return fail(
      'MYEONGHA_SAJU_SERVICE_ORIGIN must be an exact HTTPS origin without credentials, path, query, or fragment.',
    );
  }

  return url.origin;
}

export function parseProductionSajuRuntimeConfigV1(
  env: ProductionSajuRuntimeEnvV1,
): ProductionSajuRuntimeConfigV1 {
  return Object.freeze({
    serviceOrigin: parseServiceOrigin(
      requiredEnv(env, PRODUCTION_SAJU_RUNTIME_ENV_V1.serviceOrigin),
    ),
    serviceBearer: requiredEnv(env, PRODUCTION_SAJU_RUNTIME_ENV_V1.serviceBearer),
  });
}

export function summarizeProductionSajuRuntimeConfigV1(
  config: ProductionSajuRuntimeConfigV1,
): ProductionSajuRuntimeConfigSummaryV1 {
  return Object.freeze({
    serviceConfigured: true,
    serviceOrigin: config.serviceOrigin,
  });
}
