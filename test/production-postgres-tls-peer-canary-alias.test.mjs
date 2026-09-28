import { describe, expect, it } from 'vitest';

import { inspectSkipDomainAliasEvidence } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary alias contract', () => {
  it('allows only the generated CLI alias and preserves its exact alias UID', () => {
    expect(
      inspectSkipDomainAliasEvidence({
        aliases: [
          {
            uid: 'alias_generated_exact',
            alias: 'myeongha-johnny-self.vercel.app',
          },
        ],
      }),
    ).toEqual({
      generatedCliAliasPresent: true,
      generatedCliAlias: 'myeongha-johnny-self.vercel.app',
      generatedCliAliasId: 'alias_generated_exact',
      productionDomainAliased: false,
    });
  });

  it('rejects missing alias UID, canonical Production, and arbitrary custom aliases', () => {
    expect(() =>
      inspectSkipDomainAliasEvidence({
        aliases: [{ alias: 'myeongha-johnny-self.vercel.app' }],
      }),
    ).toThrow();

    expect(() =>
      inspectSkipDomainAliasEvidence({
        aliases: [{ uid: 'alias_prod', alias: 'myeongha.vercel.app' }],
      }),
    ).toThrow();

    expect(() =>
      inspectSkipDomainAliasEvidence({
        aliases: [
          { uid: 'alias_generated', alias: 'myeongha-johnny-self.vercel.app' },
          { uid: 'alias_custom', alias: 'example.com' },
        ],
      }),
    ).toThrow();
  });

  it('fails closed for an unrecognized alias payload', () => {
    expect(() => inspectSkipDomainAliasEvidence({})).toThrow();
  });
});
