import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { runCharacterGovernedPreflightV1 } from '../apps/api/src/character-governed-preflight-v1.js';
import type { CharacterDisclosurePreflightResultV2 } from '../apps/api/src/character-disclosure-preflight-v2.js';
import {
  assertSeyeonZeroPrivateRetrievalBeforeReadV1,
  SeyeonPreflightSourceClosureHoldV1,
} from '../apps/api/src/seyeon-preflight-source-closure-hold-v1.js';

const nonSensitive = {
  schemaVersion: 'character-disclosure-preflight-v2',
  status: 'not_sensitive',
  classification: { topicKey: null, questionContext: 'casual_curiosity' },
  source: null,
  factAuthority: null,
  decision: null,
} as const;

function gated(candidate: unknown) {
  return () => assertSeyeonZeroPrivateRetrievalBeforeReadV1(
    candidate as CharacterDisclosurePreflightResultV2,
  );
}

describe('Se-yeon S3-B zero-only admission before private retrieval', () => {
  it('admits only an explicit not-sensitive zero-source declaration', () => {
    expect(gated(nonSensitive)).not.toThrow();
    expect(gated({ ...nonSensitive, decision: {} })).toThrow(SeyeonPreflightSourceClosureHoldV1);
    expect(gated({ ...nonSensitive, source: {} })).toThrow(SeyeonPreflightSourceClosureHoldV1);
    expect(gated({ ...nonSensitive, factAuthority: {} })).toThrow(SeyeonPreflightSourceClosureHoldV1);
  });

  it('admits only explicit none/null retrieval scope on sensitive disclosure', () => {
    const scope = { depth: 'none', sourceRef: null };
    const sensitive = {
      ...nonSensitive, status: 'sensitive',
      decision: { retrievalScope: scope },
    };
    expect(gated(sensitive)).not.toThrow();
    for (const bad of [
      { depth: 'full', sourceRef: 'private:canary' },
      { depth: 'none', sourceRef: 'private:canary' },
      { depth: 'summary', sourceRef: null },
      null, undefined, {}, { depth: null, sourceRef: null },
    ]) {
      expect(gated({ ...sensitive, decision: { retrievalScope: bad } }))
        .toThrow(SeyeonPreflightSourceClosureHoldV1);
    }
  });

  it('fails closed on malformed/unknown contract rather than guessing zero sources', () => {
    for (const value of [
      null, [], {}, { ...nonSensitive, schemaVersion: 'unknown' },
      { ...nonSensitive, status: 'unknown' },
      { ...nonSensitive, decision: { retrievalScope: { depth: 'none' } }, status: 'sensitive' },
      { ...nonSensitive, decision: null, status: 'sensitive' },
    ]) {
      expect(gated(value)).toThrow(SeyeonPreflightSourceClosureHoldV1);
    }
  });

  it('invokes the guard before the retriever and propagates a denial with zero private bytes', async () => {
    const before = vi.fn(() => { throw new SeyeonPreflightSourceClosureHoldV1(); });
    const retriever = vi.fn(async () => [{ text: 'PRIVATE_CANARY' }]);
    const input = {
      characterId: 'seyeon' as const,
      userMessageRef: 'message-1',
      userText: 'hello',
      relationship: { gate: 'PUBLIC', trustBand: 'low' } as const,
      integrity: {
        classifier: { classify: async () => ({ claims: [] }) },
        authorityResolver: { resolve: async () => { throw new Error('unused integrity authority'); } },
      },
      disclosure: {
        classifier: { classify: async () => ({
          topicKey: null, questionContext: 'casual_curiosity',
        }) },
        sourceDescriptor: { readDescriptor: async () => { throw new Error('unused source descriptor'); } },
        factAuthorityResolver: { resolve: async () => { throw new Error('unused fact authority'); } },
        retriever: { retrieve: retriever },
      },
      beforePrivateSourceRetrieval: before,
    } as const;
    await expect(runCharacterGovernedPreflightV1(input))
      .rejects.toThrow(SeyeonPreflightSourceClosureHoldV1);
    expect(before).toHaveBeenCalledOnce();
    expect(retriever).not.toHaveBeenCalled();
    expect(JSON.stringify(before.mock.calls)).not.toContain('PRIVATE_CANARY');
  });

  it('preserves ordinary zero-source generic governed preflight when the opt-in hook is absent', async () => {
    const retriever = vi.fn(async () => []);
    const out = await runCharacterGovernedPreflightV1({
      characterId: 'seyeon',
      userMessageRef: 'message-1',
      userText: 'hello',
      relationship: { gate: 'PUBLIC', trustBand: 'low' },
      integrity: {
        classifier: { classify: async () => ({ claims: [] }) },
        authorityResolver: { resolve: async () => { throw new Error('unused'); } },
      },
      disclosure: {
        classifier: { classify: async () => ({ topicKey: null, questionContext: 'casual_curiosity' }) },
        sourceDescriptor: { readDescriptor: async () => { throw new Error('unused'); } },
        factAuthorityResolver: { resolve: async () => { throw new Error('unused'); } },
        retriever: { retrieve: retriever },
      },
    });
    expect(out.retrievedPrivateSources).toEqual([]);
    expect(retriever).not.toHaveBeenCalled();
  });

  it('is wired only by Production before interpreter and post-Preflight inspection', () => {
    const governed = readFileSync(new URL(
      '../apps/api/src/character-governed-preflight-v1.ts', import.meta.url,
    ), 'utf8');
    const runtime = readFileSync(new URL(
      '../apps/api/src/seyeon-character-runtime-v2.ts', import.meta.url,
    ), 'utf8');
    const production = readFileSync(new URL(
      '../apps/api/src/seyeon-production-chat-execution-v1.ts', import.meta.url,
    ), 'utf8');
    const preRead = governed.indexOf('await input.beforePrivateSourceRetrieval(disclosure);');
    const retrieve = governed.indexOf('const retrievedPrivateSources = await retrieveAllowedCharacterDisclosureSourcesV2({');
    expect(preRead).toBeGreaterThan(-1);
    expect(retrieve).toBeGreaterThan(preRead);
    expect(runtime).toContain('beforePrivateSourceRetrieval: input.assertBeforePrivateSourceRetrieval');
    expect(production).toContain(
      'assertBeforePrivateSourceRetrieval: assertSeyeonZeroPrivateRetrievalBeforeReadV1,',
    );
    expect(production).toContain(
      'assertGovernedPreflightSourceClosure: assertSeyeonPreflightZeroPrivateSourceClosureV1,',
    );
  });
});
