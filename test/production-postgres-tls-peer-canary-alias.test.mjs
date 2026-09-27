import { describe, expect, it } from 'vitest';

import { inspectSkipDomainAliasEvidence } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary alias contract', () => {
  it('allows only the documented generated CLI alias', () => {
    expect(
      inspectSkipDomainAliasEvidence({
        aliases: [{ alias: 'myeongha-johnny-self.vercel.app' }],
      }),
    ).toEqual({
      generatedCliAliasPresent: true,
      generatedCliAlias: 'myeongha-johnny-self.vercel.app',
      productionDomainAliased: false,
    });
  });

  it('rejects canonical Production and arbitrary custom aliases', () => {
    expect(() =>
      inspectSkipDomainAliasEvidence({
        aliases: [{ alias: 'myeongha.vercel.app' }],
      }),
    ).toThrow();

    expect(() =>
      inspectSkipDomainAliasEvidence({
        aliases: [
          { alias: 'myeongha-johnny-self.vercel.app' },
          { alias: 'example.com' },
        ],
      }),
    ).toThrow();
  });

  it('fails closed for an unrecognized alias payload', () => {
    expect(() => inspectSkipDomainAliasEvidence({})).toThrow();
  });
});
