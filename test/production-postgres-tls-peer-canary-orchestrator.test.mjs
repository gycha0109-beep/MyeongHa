import { describe, expect, it } from 'vitest';

import { buildSkipDomainDeploymentArgs } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary Vercel CLI contract', () => {
  it('targets the linked project only through Vercel CI environment variables', () => {
    const args = buildSkipDomainDeploymentArgs({
      rootCertificateBase64: 'certificate-b64',
      canaryToken: 'canary-token',
      githubSha: '1234567890abcdef1234567890abcdef12345678',
    });

    expect(args.slice(0, 7)).toEqual([
      '--yes',
      'vercel@59.16.0',
      'deploy',
      '.',
      '--prod',
      '--skip-domain',
      '--yes',
    ]);
    expect(args).not.toContain('--project');
    expect(args).not.toContain('--team');
    expect(args).not.toContain('--scope');
    expect(args).toContain('--env');
    expect(args).toContain('--meta');
  });
});
