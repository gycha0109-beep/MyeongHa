import { describe, expect, it } from 'vitest';

import { classifyOutOfScopeCanaryRedirect } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

const requestUrl = new URL(
  'https://myeongha-example-johnny-self.vercel.app/api/readiness',
);
const deploymentUrl = new URL(
  'https://myeongha-example-johnny-self.vercel.app',
);

function classify(target) {
  return classifyOutOfScopeCanaryRedirect({
    targetUrl: new URL(target),
    requestUrl,
    deploymentUrl,
  });
}

describe('Production PostgreSQL TLS peer canary redirect target classification', () => {
  it('classifies generated and canonical Production aliases without emitting raw locations', () => {
    expect(
      classify(
        'https://myeongha-johnny-self.vercel.app/api/readiness',
      ),
    ).toBe('CANARY_AUTOMATION_BYPASS_REDIRECT_TO_GENERATED_ALIAS');

    expect(
      classify('https://myeongha.vercel.app/api/readiness'),
    ).toBe('CANARY_AUTOMATION_BYPASS_REDIRECT_TO_PRODUCTION_ALIAS');
  });

  it('classifies Vercel auth and other Vercel aliases', () => {
    expect(
      classify('https://vercel.com/login'),
    ).toBe('CANARY_AUTOMATION_BYPASS_REDIRECT_TO_VERCEL_AUTH');

    expect(
      classify('https://auth.vercel.com/login'),
    ).toBe('CANARY_AUTOMATION_BYPASS_REDIRECT_TO_VERCEL_AUTH');

    expect(
      classify('https://some-other.vercel.app/api/readiness'),
    ).toBe('CANARY_AUTOMATION_BYPASS_REDIRECT_TO_OTHER_VERCEL_ALIAS');
  });

  it('classifies same-host path mutation and external hosts', () => {
    expect(
      classify(
        'https://myeongha-example-johnny-self.vercel.app/login',
      ),
    ).toBe('CANARY_AUTOMATION_BYPASS_REDIRECT_PATH_OUT_OF_SCOPE');

    expect(
      classify('https://example.com/api/readiness'),
    ).toBe('CANARY_AUTOMATION_BYPASS_REDIRECT_TO_EXTERNAL_HOST');
  });
});
