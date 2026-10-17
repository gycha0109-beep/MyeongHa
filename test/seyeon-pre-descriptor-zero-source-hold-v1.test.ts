import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  runCharacterDisclosurePreflightV2,
  type CharacterDisclosureTopicClassificationV2,
} from '../apps/api/src/character-disclosure-preflight-v2.js';
import {
  assertSeyeonZeroPrivateDescriptorBeforeReadV1,
  SeyeonPreflightSourceClosureHoldV1,
} from '../apps/api/src/seyeon-preflight-source-closure-hold-v1.js';

const NONE = { topicKey: null, questionContext: 'casual_curiosity' } as const;
const SENSITIVE = {
  topicKey: 'family_emotional_history',
  questionContext: 'relationship_relevant',
} as const;

const guard = (value: unknown) => () =>
  assertSeyeonZeroPrivateDescriptorBeforeReadV1(
    value as CharacterDisclosureTopicClassificationV2,
  );

describe('Se-yeon S3-C disclosure metadata lookup HOLD', () => {
  it('admits a validated non-sensitive classification only', () => {
    expect(guard(NONE)).not.toThrow();
    for (const value of [
      null, undefined, [], {},
      { topicKey: undefined, questionContext: 'casual_curiosity' },
      { topicKey: null, questionContext: 'unknown' },
      { ...NONE, extra: 'unexpected' },
      { topicKey: null },
      SENSITIVE,
      { ...SENSITIVE, topicKey: 'past_romance_detail' },
      { ...SENSITIVE, topicKey: 'deep_vulnerability' },
      { ...SENSITIVE, topicKey: 'past_romance_surface' },
    ]) {
      expect(guard(value)).toThrow(SeyeonPreflightSourceClosureHoldV1);
    }
  });

  it('denies sensitive topics BEFORE descriptor, fact-authority or retriever can read private material', async () => {
    const descriptor = vi.fn(async () => {
      throw new Error('UNAUTHORIZED_DESCRIPTOR_READ_CANARY');
    });
    const authority = vi.fn(async () => {
      throw new Error('UNAUTHORIZED_FACT_AUTHORITY_READ_CANARY');
    });
    const topic = vi.fn(async () => SENSITIVE);
    const gate = vi.fn(assertSeyeonZeroPrivateDescriptorBeforeReadV1);
    const attempt = runCharacterDisclosurePreflightV2({
      characterId: 'seyeon',
      userQuestion: 'tell me about your family',
      relationship: {
        gate: 'PUBLIC',
        trustBand: 'low',
        relevantSharedHistoryRefs: [],
      },
      classifier: { classify: topic },
      sourceDescriptor: { readDescriptor: descriptor },
      factAuthorityResolver: { resolve: authority },
      beforeSourceDescriptorRead: gate,
    });
    await expect(attempt).rejects.toThrow(SeyeonPreflightSourceClosureHoldV1);
    expect(topic).toHaveBeenCalledOnce();
    expect(gate).toHaveBeenCalledOnce();
    expect(descriptor).not.toHaveBeenCalled();
    expect(authority).not.toHaveBeenCalled();
  });

  it('non-sensitive zero-source decision does not invoke metadata readers', async () => {
    const descriptor = vi.fn(async () => {
      throw new Error('unexpected descriptor');
    });
    const authority = vi.fn(async () => {
      throw new Error('unexpected authority');
    });
    const decision = await runCharacterDisclosurePreflightV2({
      characterId: 'seyeon',
      userQuestion: 'hello',
      relationship: {
        gate: 'PUBLIC', trustBand: 'low', relevantSharedHistoryRefs: [],
      },
      classifier: { classify: async () => NONE },
      sourceDescriptor: { readDescriptor: descriptor },
      factAuthorityResolver: { resolve: authority },
      beforeSourceDescriptorRead: assertSeyeonZeroPrivateDescriptorBeforeReadV1,
    });
    expect(decision.status).toBe('not_sensitive');
    expect(descriptor).not.toHaveBeenCalled();
    expect(authority).not.toHaveBeenCalled();
  });

  it('generic non-Production callers retain the existing disclosure code path', async () => {
    const descriptor = vi.fn(async () => {
      throw new Error('generic-descriptor-was-called');
    });
    const action = runCharacterDisclosurePreflightV2({
      characterId: 'seyeon',
      userQuestion: 'family',
      relationship: {
        gate: 'PUBLIC', trustBand: 'low', relevantSharedHistoryRefs: [],
      },
      classifier: { classify: async () => SENSITIVE },
      sourceDescriptor: { readDescriptor: descriptor },
      factAuthorityResolver: { resolve: async () => null },
    });
    await expect(action).rejects.toThrow('generic-descriptor-was-called');
    expect(descriptor).toHaveBeenCalledOnce();
  });

  it('binds Production before descriptor and keeps S3-B/S3-A checks', async () => {
    const disclosure = await readFile(new URL(
      '../apps/api/src/character-disclosure-preflight-v2.ts', import.meta.url,
    ), 'utf8');
    const governed = await readFile(new URL(
      '../apps/api/src/character-governed-preflight-v1.ts', import.meta.url,
    ), 'utf8');
    const runtime = await readFile(new URL(
      '../apps/api/src/seyeon-character-runtime-v2.ts', import.meta.url,
    ), 'utf8');
    const production = await readFile(new URL(
      '../apps/api/src/seyeon-production-chat-execution-v1.ts', import.meta.url,
    ), 'utf8');
    const pre = disclosure.indexOf('await input.beforeSourceDescriptorRead(classification);');
    const descriptor = disclosure.indexOf('const source = await input.sourceDescriptor.readDescriptor({');
    const fact = disclosure.indexOf('const factAuthority = await input.factAuthorityResolver.resolve({');
    expect(pre).toBeGreaterThan(-1);
    expect(descriptor).toBeGreaterThan(pre);
    expect(fact).toBeGreaterThan(descriptor);
    expect(governed).toContain('beforeSourceDescriptorRead: input.beforeSourceDescriptorRead');
    expect(runtime).toContain('beforeSourceDescriptorRead: input.assertBeforePrivateSourceDescriptorRead');
    expect(production).toContain(
      'assertBeforePrivateSourceDescriptorRead: assertSeyeonZeroPrivateDescriptorBeforeReadV1,',
    );
    expect(production).toContain(
      'assertBeforePrivateSourceRetrieval: assertSeyeonZeroPrivateRetrievalBeforeReadV1,',
    );
    expect(production).toContain(
      'assertGovernedPreflightSourceClosure: assertSeyeonPreflightZeroPrivateSourceClosureV1,',
    );
  });
});
