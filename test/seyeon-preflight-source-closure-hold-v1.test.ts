import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { CharacterGovernedPreflightResultV1 } from '../apps/api/src/character-governed-preflight-v1.js';
import {
  assertSeyeonPreflightZeroPrivateSourceClosureV1,
  SeyeonPreflightSourceClosureHoldV1,
} from '../apps/api/src/seyeon-preflight-source-closure-hold-v1.js';

function preflight(): CharacterGovernedPreflightResultV1 {
  return {
    schemaVersion: 'character-governed-preflight-v1',
    integrity: { decisions: [] },
    disclosure: {
      schemaVersion: 'character-disclosure-preflight-v2',
      status: 'not_sensitive',
      source: null,
      decision: null,
    },
    retrievedPrivateSources: [],
  } as unknown as CharacterGovernedPreflightResultV1;
}

describe('Se-yeon G1 post-Preflight private source closure (zero-only)', () => {
  it('allows an explicit empty private-source retrieval but grants no positive/reveal authority', () => {
    const result = assertSeyeonPreflightZeroPrivateSourceClosureV1(preflight());
    expect(result).toEqual({
      version: 'seyeon-preflight-source-closure-hold-v1',
      sourceState: 'explicit_zero_private_retrieval',
      permitsPositiveSourcePin: false,
      permitsHttpReveal: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('holds one or more private sources even when preflight describes them as safe', () => {
    const p = preflight();
    for (const retrievedPrivateSources of [
      [{ sourceRef: 'private:unapproved', text: 'UNAPPROVED_PRIVATE_CANARY' }],
      [{ sourceRef: 'a' }, { sourceRef: 'b' }],
    ]) {
      const changed = { ...p, retrievedPrivateSources };
      expect(() => assertSeyeonPreflightZeroPrivateSourceClosureV1(
        changed as unknown as CharacterGovernedPreflightResultV1,
      )).toThrow(SeyeonPreflightSourceClosureHoldV1);
      try {
        assertSeyeonPreflightZeroPrivateSourceClosureV1(
          changed as unknown as CharacterGovernedPreflightResultV1,
        );
        throw new Error('Expected zero-source hold');
      } catch (error) {
        expect(String(error)).not.toContain('UNAPPROVED_PRIVATE_CANARY');
      }
    }
  });

  it('does not treat missing, malformed, or unknown provenance as empty', () => {
    const p = preflight();
    const invalid: unknown[] = [
      null, {},
      { ...p, schemaVersion: 'unexpected-version' },
      { ...p, disclosure: null },
      { ...p, disclosure: { schemaVersion: 'unrecognized' } },
      { ...p, retrievedPrivateSources: undefined },
      { ...p, retrievedPrivateSources: null },
      { ...p, retrievedPrivateSources: {} },
      { ...p, retrievedPrivateSources: { length: 0 } },
    ];
    for (const candidate of invalid) {
      expect(() => assertSeyeonPreflightZeroPrivateSourceClosureV1(
        candidate as CharacterGovernedPreflightResultV1,
      )).toThrow(SeyeonPreflightSourceClosureHoldV1);
    }
  });

  it('binds Production to the post-Preflight check before all 3 main provider stages', async () => {
    const runtime = await readFile(new URL(
      '../apps/api/src/seyeon-character-runtime-v2.ts', import.meta.url,
    ), 'utf8');
    const production = await readFile(new URL(
      '../apps/api/src/seyeon-production-chat-execution-v1.ts', import.meta.url,
    ), 'utf8');
    const preflight = runtime.indexOf('governedPreflight = await runCharacterGovernedPreflightV1({');
    const closure = runtime.indexOf('await input.assertGovernedPreflightSourceClosure(governedPreflight);');
    const assembly = runtime.indexOf('context = assembleSeyeonRuntimeContextV2({');
    const interpreter = runtime.indexOf('const rawInterpretation = await generate(');
    const renderer = runtime.indexOf('const rawRendererDraft = await generate(');
    const reviewer = runtime.indexOf('const rawSemanticReview = await generate(');
    expect(preflight).toBeGreaterThan(-1);
    expect(closure).toBeGreaterThan(preflight);
    expect(assembly).toBeGreaterThan(closure);
    expect(interpreter).toBeGreaterThan(assembly);
    expect(renderer).toBeGreaterThan(interpreter);
    expect(reviewer).toBeGreaterThan(renderer);
    expect(production).toContain(
      'assertGovernedPreflightSourceClosure: assertSeyeonPreflightZeroPrivateSourceClosureV1,',
    );
    const zeroPin = production.indexOf('await input.persistencePort.markContextReady({');
    const model = production.indexOf('const runtime = await runSeyeonCharacterTurnV2({');
    expect(zeroPin).toBeGreaterThan(-1);
    expect(model).toBeGreaterThan(zeroPin);
    expect(production).toContain('SEYEON_PRODUCTION_CHAT_EXECUTION_VERSION_V1');
  });
});
