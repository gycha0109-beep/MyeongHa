import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SAJU_RUNTIME_ENV_V1,
  ProductionSajuRuntimeConfigErrorV1,
  parseProductionSajuRuntimeConfigV1,
  summarizeProductionSajuRuntimeConfigV1,
} from '../apps/api/src/production-saju-runtime-config.js';

function env(origin?: string): Record<string, string | undefined> {
  return {
    [PRODUCTION_SAJU_RUNTIME_ENV_V1.serviceOrigin]: origin,
  };
}

describe('production Saju runtime config v1', () => {
  it('accepts only an exact HTTPS service origin', () => {
    const config = parseProductionSajuRuntimeConfigV1(env('https://saju.internal.example'));
    expect(config).toEqual({ serviceOrigin: 'https://saju.internal.example' });
    expect(summarizeProductionSajuRuntimeConfigV1(config)).toEqual({
      serviceConfigured: true,
      serviceOrigin: 'https://saju.internal.example',
    });
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
