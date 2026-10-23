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
    integrity: {
      schemaVersion: 'character-integrity-preflight-v1',
      characterId: 'seyeon',
      userMessageRef: 'current-user-message',
      classification: { claims: [] },
      decisions: [],
    },
    disclosure: {
      schemaVersion: 'character-disclosure-preflight-v2',
      status: 'not_sensitive',
      classification: { topicKey: null, questionContext: 'casual_curiosity' },
      source: null,
      factAuthority: null,
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
      { ...p, integrity: null },
      { ...p, integrity: { decisions: [] } },
      { ...p, integrity: { ...p.integrity, classification: { claims: [{}] } } },
    ];
    for (const candidate of invalid) {
      expect(() => assertSeyeonPreflightZeroPrivateSourceClosureV1(
        candidate as CharacterGovernedPreflightResultV1,
      )).toThrow(SeyeonPreflightSourceClosureHoldV1);
    }
  });

  it('refuses integrity authority that would introduce unpinned facts into model context', () => {
    const p = preflight();
    const claim = {
      claimId: 'claim-1',
      kind: 'CHARACTER_FACT_CLAIM',
      statement: 'private biography claim',
      sourceRef: 'current-user-message',
    };
    const normal = {
      schemaVersion: 'character-integrity-decision-v1',
      claim,
      result: 'UNVERIFIED',
      authorityRefs: [],
      provenanceRefs: [
        'current-user-message',
        'production-governance:unresolved:CHARACTER_FACT_CLAIM',
      ],
      mayEnterWorkingContextAsFact: false,
      mayEnterWorkingContextAsUserAssertion: false,
      mayProposeUserMemory: false,
      mayCreateRelationshipEvent: false,
      mayMutateRelationshipState: false,
    };
    const make = (decision: unknown) => ({
      ...p,
      integrity: {
        ...p.integrity,
        classification: { claims: [{
          claimId: claim.claimId, kind: claim.kind, statement: claim.statement,
        }] },
        decisions: [decision],
      },
    }) as CharacterGovernedPreflightResultV1;

    // Current Production resolver only reports explicit MISSING.
    expect(() => assertSeyeonPreflightZeroPrivateSourceClosureV1(make(normal)))
      .not.toThrow();

    for (const forged of [
      { ...normal, result: 'VERIFIED', mayEnterWorkingContextAsFact: true,
        authorityRefs: ['private:UNAPPROVED_CANARY'] },
      { ...normal, result: 'CONTRADICTED' },
      { ...normal, authorityRefs: ['private:UNAPPROVED_CANARY'] },
      { ...normal, provenanceRefs: ['current-user-message', 'private:UNAPPROVED_CANARY'] },
      { ...normal, provenanceRefs: ['current-user-message'] },
      { ...normal, mayCreateRelationshipEvent: true },
      { ...normal, claim: { ...claim, sourceRef: 'another-turn' } },
      { ...normal, claim: { ...claim, statement: 'changed by resolver' } },
    ]) {
      expect(() => assertSeyeonPreflightZeroPrivateSourceClosureV1(make(forged)))
        .toThrow(SeyeonPreflightSourceClosureHoldV1);
      try {
        assertSeyeonPreflightZeroPrivateSourceClosureV1(make(forged));
      } catch (error) {
        expect(String(error)).not.toContain('UNAPPROVED_CANARY');
      }
    }
  });

  it('keeps legitimate user self-report without promoting it to a proven private fact', () => {
    const p = preflight();
    const claim = {
      claimId: 'self-1', kind: 'USER_SELF_REPORT',
      statement: 'I feel tired', sourceRef: 'current-user-message',
    };
    const c = {
      ...p,
      integrity: {
        ...p.integrity,
        classification: { claims: [{
          claimId: claim.claimId, kind: claim.kind, statement: claim.statement,
        }] },
        decisions: [{
          schemaVersion: 'character-integrity-decision-v1',
          claim, result: 'USER_ASSERTED',
          authorityRefs: [], provenanceRefs: ['current-user-message'],
          mayEnterWorkingContextAsFact: false,
          mayEnterWorkingContextAsUserAssertion: true,
          mayProposeUserMemory: true,
          mayCreateRelationshipEvent: false,
          mayMutateRelationshipState: false,
        }],
      },
    } as unknown as CharacterGovernedPreflightResultV1;
    expect(() => assertSeyeonPreflightZeroPrivateSourceClosureV1(c)).not.toThrow();
  });

  it('rejects positive/malformed disclosure even when the retrieved list is empty', () => {
    const p = preflight();
    for (const bad of [
      { ...p.disclosure, status: 'sensitive' },
      { ...p.disclosure, classification: { topicKey: 'past_romance_detail', questionContext: 'continuation' } },
      { ...p.disclosure, factAuthority: { private: 'UNAPPROVED_CANARY' } },
      { ...p.disclosure, decision: { retrievalScope: { depth: 'none', sourceRef: null } } },
      { ...p.disclosure, source: { private: 'UNAPPROVED_CANARY' } },
    ]) {
      expect(() => assertSeyeonPreflightZeroPrivateSourceClosureV1({
        ...p, disclosure: bad,
      } as CharacterGovernedPreflightResultV1))
        .toThrow(SeyeonPreflightSourceClosureHoldV1);
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
