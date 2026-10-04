import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildTemporaryCanaryAlias,
  inspectTemporaryCanaryAliasEvidence,
} from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary temporary alias contract', () => {
  it('builds a run-scoped temporary vercel.app alias', () => {
    expect(
      buildTemporaryCanaryAlias({ githubRunId: '36368744010' }),
    ).toBe(
      'myeongha-sec01-36368744010-johnny-self.vercel.app',
    );
  });

  it('verifies exactly the generated safety alias plus the temporary staged alias', () => {
    expect(
      inspectTemporaryCanaryAliasEvidence(
        {
          aliases: [
            {
              uid: 'alias_generated',
              alias: 'myeongha-johnny-self.vercel.app',
            },
            {
              uid: 'alias_temp',
              alias:
                'myeongha-sec01-36368744010-johnny-self.vercel.app',
              redirect: null,
            },
          ],
        },
        'myeongha-sec01-36368744010-johnny-self.vercel.app',
        'alias_temp',
      ),
    ).toEqual({
      temporaryCanaryAliasCreated: true,
      temporaryCanaryAliasVerified: true,
      temporaryCanaryAliasRedirect: false,
    });
  });

  it('keeps assignment and cleanup scoped to the temporary alias', () => {
    const source = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(source).toContain('/v2/deployments/');
    expect(source).toContain('/aliases?teamId=');
    expect(source).toContain('redirect: null');
    expect(source).toContain('/v2/aliases/');
    expect(source).toContain('canary_temporary_alias_deleted=');
  });
});
