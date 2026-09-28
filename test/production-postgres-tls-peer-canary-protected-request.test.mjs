import { describe, expect, it } from 'vitest';

import { buildProtectedCanaryCurlArgs } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary protected request contract', () => {
  it('uses vercel curl for the exact deployment without putting the canary token in argv', () => {
    const args = buildProtectedCanaryCurlArgs({
      deploymentUrl: 'https://myeongha-example-johnny-self.vercel.app',
      vercelToken: 'vercel-token-is-env-only',
      canaryToken: 'canary-token-must-be-stdin-only',
    });

    expect(args.slice(0, 7)).toEqual([
      '--yes',
      'vercel@59.16.0',
      'curl',
      '/api/readiness',
      '--deployment',
      'https://myeongha-example-johnny-self.vercel.app',
      '--',
    ]);
    expect(args).toContain('--request');
    expect(args).toContain('POST');
    expect(args).toContain('--header');
    expect(args).toContain('@-');
    expect(args).toContain('--data');
    expect(args).not.toContain('canary-token-must-be-stdin-only');
    expect(args).not.toContain('vercel-token-is-env-only');
  });
});
