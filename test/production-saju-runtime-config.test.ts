import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SAJU_RUNTIME_ENV_V1,
  ProductionSajuRuntimeConfigErrorV1,
  parseProductionSajuRuntimeConfigV1,
  summarizeProductionSajuRuntimeConfigV1,
} from '../apps/api/src/production-saju-runtime-config.js';

const SERVICE_BEARER = 'test-saju-service-bearer-secret';

function env(
  origin?: string,
  bearer: string | undefined = SERVICE_BEARER,
): Record<string, string | undefined> {
  return {
    [PRODUCTION_SAJU_RUNTIME_ENV_V1.serviceOrigin]: origin,
    [PRODUCTION_SAJU_RUNTIME_ENV_V1.serviceBearer]: bearer,
  };
}

describe('production Saju runtime config v1', () => {
  it('accepts only an exact HTTPS service origin with a non-empty service Bearer', () => {
    const config = parseProductionSajuRuntimeConfigV1(env('https://saju.internal.example'));
    expect(config).toEqual({
      serviceOrigin: 'https://saju.internal.example',
      serviceBearer: SERVICE_BEARER,
    });

    const summary = summarizeProductionSajuRuntimeConfigV1(config);
    expect(summary).toEqual({
      serviceConfigured: true,
      serviceOrigin: 'https://saju.internal.example',
    });
    expect(JSON.stringify(summary)).not.toContain(SERVICE_BEARER);
  });

  it.each([undefined, '', '   ', '\t\n'])('fails closed for missing service Bearer %s', (bearer) => {
    expect(() =>
      parseProductionSajuRuntimeConfigV1(env('https://saju.internal.example', bearer)),
    ).toThrowError(ProductionSajuRuntimeConfigErrorV1);
  });

  it.each([
    undefined,
    '',
    'http://saju.internal.example',
    'https://user:password@saju.internal.example',
    'https://saju.internal.example/api',
    'https://saju.internal.example?target=other',
    'https://saju.internal.example#fragment',
    'not-a-url',
  ])('fails closed for invalid production origin %s', (origin) => {
    expect(() => parseProductionSajuRuntimeConfigV1(env(origin))).toThrowError(
      ProductionSajuRuntimeConfigErrorV1,
    );
  });
});
