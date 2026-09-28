import { describe, expect, it } from 'vitest';

import { buildProtectedCanaryCurlArgs } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary protected request contract', () => {
  it('uses the unique full deployment URL without putting either secret in argv', () => {
    const args = buildProtectedCanaryCurlArgs({
      deploymentUrl: 'https://myeongha-example-johnny-self.vercel.app',
      vercelToken: 'vercel-token-is-env-only',
      canaryToken: 'canary-token-must-be-stdin-only',
    });

    expect(args.slice(0, 5)).toEqual([
      '--yes',
      'vercel@59.16.0',
      'curl',
      'https://myeongha-example-johnny-self.vercel.app/api/readiness',
      '--',
    ]);
    expect(args).not.toContain('--deployment');
    expect(args).toContain('--request');
    expect(args).toContain('POST');
    expect(args).toContain('--header');
    expect(args).toContain('@-');
    expect(args).toContain('--data');
    expect(args).not.toContain('canary-token-must-be-stdin-only');
    expect(args).not.toContain('vercel-token-is-env-only');
  });
});
