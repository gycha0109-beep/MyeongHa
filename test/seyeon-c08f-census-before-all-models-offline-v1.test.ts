import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error: Versioned offline Gold MJS has no generated declarations.
import {SEYEON_C07_BOUNDARY_MATRIX_V1 as MATRIX} from '../scripts/seyeon-cost-c07-cross-topic-boundary-v1.mjs';
import {
  runSeyeonCensusFirstThreeCallShadowV1,
} from '../apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import {
  SEYEON_FIRST_TURN_CENSUS_SHADOW_VERSION_V1,
  type SeyeonFullThreadCensusShadowPortV1,
} from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import type {
  RunSeyeonCharacterTurnV2Input,
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';

const CURRENT = { messageId: 'user-current', role: 'user' as const, text: '안녕, 세연아.' };
const BASE: RunSeyeonCharacterTurnV2Input['contextInput'] = {
  relationship: null,
  recentMessages: [CURRENT],
  retrievedMemories: [],
};
const GOOD_INTERPRETATION = {
  schemaVersion: 'seyeon-turn-interpretation-v2',
  userMove: 'neutral_or_other',
  notice: { summary: '첫 인사를 건넸다.', evidenceRefs: [CURRENT.messageId] },
  immediateWant: { key: 'break_awkwardness', summary: '세연이 반갑게 인사한다.' },
  tension: { key: 'none_material', summary: '없음.' },
  chosenAction: { key: 'approach', rationale: '첫 인사를 환영한다.' },
  expressionState: 'baseline',
  reveal: { level: 'public', triggerRef: null, supportingHistoryRefs: [] },
  memoryRefsUsed: [],
};
const GOOD_DRAFT = {
  schemaVersion: 'seyeon-renderer-draft-v2',
  utterance: '안녕하세요. 이렇게 먼저 인사해 주시니 반가워요.',
  expressionState: 'baseline', revealLevel: 'public',
  memoryRefsMentioned: [], privateSourceRefsMentioned: [], disclosureSliceIds: [],
};

function scenario(options: {
  census?: 'valid' | 'missing' | 'stale-after-preflight' | 'stale-after-dialogue' |
    'stale-after-review' | 'failure' | 'failure-after-review';
  injectedClaim?: boolean;
  invalidCombined?: boolean;
  topicKey?: string;
  claimKind?: string;
} = {}) {
  const purposes: string[] = [];
  const unified = vi.fn(async (request: SeyeonStructuredProviderRequestV2): Promise<unknown> => {
    purposes.push(request.purpose);
    if (request.purpose !== 'unified_preflight_shadow') throw Error('UNEXPECTED_STAGE');
    return {
      claims: options.injectedClaim || options.claimKind ? [{
        claimId: 'forged', kind: options.claimKind ?? 'AUTHORITY_OVERRIDE',
        statement: 'synthetic unverified source claim',
      }] : [],
      topicKey: options.topicKey ?? null, questionContext: 'casual_curiosity',
    };
  });
  const candidate = vi.fn(async (request: SeyeonStructuredProviderRequestV2): Promise<unknown> => {
    purposes.push(request.purpose);
    if (request.purpose !== 'turn_interpret_render_shadow') throw Error('UNEXPECTED_STAGE');
    return options.invalidCombined
      ? { interpretation: {}, draft: {} }
      : { interpretation: GOOD_INTERPRETATION, draft: GOOD_DRAFT };
  });
  const reviewer = vi.fn(async (request: SeyeonStructuredProviderRequestV2): Promise<unknown> => {
    purposes.push(request.purpose);
    const hash = (request.input as { expectedUtteranceHash: string }).expectedUtteranceHash;
    return { schemaVersion: 'seyeon-semantic-review-v2',
      reviewedUtteranceHash: hash, failureCodes: [], evidence: [] };
  });
  let attempts = 0;
  const readFullThreadCensus = vi.fn(async (input: {
    subjectId: string; threadId: string; currentUserMessageId: string;
  }) => {
    attempts += 1;
    if (options.census === 'failure' ||
      (options.census === 'failure-after-review' && attempts === 4)) {
      throw Error('PRIVATE_SYNTHETIC_DATABASE_FAILURE');
    }
    const valid = {
      schemaVersion: SEYEON_FIRST_TURN_CENSUS_SHADOW_VERSION_V1,
      subjectId: input.subjectId, threadId: input.threadId,
      currentUserMessageId: input.currentUserMessageId,
      messageCount: 1, latestSenderType: 'user', complete: true,
    };
    return options.census === 'missing' ||
      (options.census === 'stale-after-preflight' && attempts === 2) ||
      (options.census === 'stale-after-dialogue' && attempts === 3) ||
      (options.census === 'stale-after-review' && attempts === 4)
      ? { ...valid, messageCount: 2 }
      : valid;
  });
  const fullThreadCensus: SeyeonFullThreadCensusShadowPortV1 = {
    subjectId: 'server-owned-subject', threadId: 'server-owned-thread',
    readFullThreadCensus,
  };
  const sourceDescriptorRead = vi.fn(async () => { throw Error('PRIVATE_ACCESS'); });
  const privateFactRead = vi.fn(async () => { throw Error('PRIVATE_ACCESS'); });
  const privateRetrieve = vi.fn(async () => { throw Error('PRIVATE_ACCESS'); });
  const governance: RunSeyeonCharacterTurnV2Input['governance'] = {
    relationship: {
      gate: 'PUBLIC', trustBand: 'low', relevantSharedHistoryRefs: [],
    },
    integrity: {
      classifier: { classify: vi.fn(async () => { throw Error('LEGACY_INTEGRITY_CALLED'); }) },
      authorityResolver: {
        resolve: vi.fn(async () => ({
          state: 'MISSING' as const, authorityRefs: [], provenanceRefs: ['fixture-unverified'],
        })),
      },
    },
    disclosure: {
      classifier: { classify: vi.fn(async () => { throw Error('LEGACY_DISCLOSURE_CALLED'); }) },
      sourceDescriptor: { readDescriptor: sourceDescriptorRead },
      factAuthorityResolver: { resolve: privateFactRead },
      retriever: { retrieve: privateRetrieve },
    },
  };
  async function run(overrides: {
    contextInput?: RunSeyeonCharacterTurnV2Input['contextInput'];
    userText?: string;
    userMessageRef?: string;
    gate?: 'PUBLIC' | 'FAMILIAR';
  } = {}) {
    return runSeyeonCensusFirstThreeCallShadowV1({
      userMessageRef: overrides.userMessageRef ?? CURRENT.messageId,
      userText: overrides.userText ?? CURRENT.text,
      contextInput: overrides.contextInput ?? BASE,
      governance: overrides.gate ? {
        ...governance, relationship: { ...governance.relationship, gate: overrides.gate },
      } : governance,
      fullThreadCensus,
      unifiedPreflightProvider: { providerKey: 'fixture', modelKey: 'fixture', generate: unified },
      candidateDialogueProvider: { providerKey: 'fixture', modelKey: 'fixture', generate: candidate },
      independentSemanticReviewer: { providerKey: 'fixture', modelKey: 'fixture', generate: reviewer },
    });
  }
  return { run, readFullThreadCensus, unified, candidate, reviewer, purposes,
    sourceDescriptorRead, privateFactRead, privateRetrieve };
}

describe('C08-F Shadow: authoritative census BEFORE every model stage', () => {
  it('rejects stale/missing full-thread census before the first unified classifier model call', async () => {
    for (const census of ['missing', 'failure'] as const) {
      const h = scenario({ census });
      await expect(h.run()).rejects.toMatchObject({ code: 'FAST_THREAD_CENSUS_REJECTED' });
      expect(h.readFullThreadCensus).toHaveBeenCalledOnce();
      expect(h.purposes).toEqual([]);
      expect(h.unified).not.toHaveBeenCalled();
      expect(h.candidate).not.toHaveBeenCalled();
      expect(h.reviewer).not.toHaveBeenCalled();
    }
  });

  it('rejects mismatched recent context, histories, memory and non-public relationship even BEFORE the DB read', async () => {
    const contexts = [
      { ...BASE, recentMessages: [CURRENT, { messageId: 'old', role: 'assistant' as const, text: '전 대화' }] },
      { ...BASE, recentMessages: [] },
      { ...BASE, recentMessages: [{ ...CURRENT, messageId: 'different-turn' }] },
      { ...BASE, retrievedMemories: [{ kind: 'memory', memoryId: 'private' }] },
      { ...BASE, relationship: { stageKey: 'established' } },
    ];
    for (const contextInput of contexts) {
      const h = scenario();
      await expect(h.run({
        contextInput: contextInput as RunSeyeonCharacterTurnV2Input['contextInput'],
      })).rejects.toThrow();
      expect(h.readFullThreadCensus).not.toHaveBeenCalled();
      expect(h.purposes).toEqual([]);
    }
    const h = scenario();
    await expect(h.run({ userText: '변조된 다른 사용자 문장' })).rejects.toThrow();
    await expect(h.run({ userMessageRef: 'another-message' })).rejects.toThrow();
    expect(h.readFullThreadCensus).not.toHaveBeenCalled();
    expect(h.purposes).toEqual([]);
  });

  it('reruns full-thread census before dialogue; racing extra message blocks stage 2 and semantic review', async () => {
    const h = scenario({ census: 'stale-after-preflight' });
    await expect(h.run()).rejects.toMatchObject({ code: 'FAST_THREAD_CENSUS_REJECTED' });
    expect(h.readFullThreadCensus).toHaveBeenCalledTimes(2);
    expect(h.purposes).toEqual(['unified_preflight_shadow']);
    expect(h.unified).toHaveBeenCalledOnce();
    expect(h.candidate).not.toHaveBeenCalled();
    expect(h.reviewer).not.toHaveBeenCalled();
  });

  it('rechecks census after candidate dialogue; late RECEIVE blocks independent reviewer', async () => {
    const h = scenario({ census: 'stale-after-dialogue' });
    await expect(h.run()).rejects.toMatchObject({ code: 'FAST_THREAD_CENSUS_REJECTED' });
    expect(h.readFullThreadCensus).toHaveBeenCalledTimes(3);
    expect(h.purposes).toEqual(['unified_preflight_shadow', 'turn_interpret_render_shadow']);
    expect(h.unified).toHaveBeenCalledOnce();
    expect(h.candidate).toHaveBeenCalledOnce();
    expect(h.reviewer).not.toHaveBeenCalled();
  });

  it.each(['stale-after-review', 'failure-after-review'] as const)(
    '%s: fail closed if final Census changes after reviewer, without leaking text',
    async census => {
      const h = scenario({ census });
      const rejection = await h.run().then(
        () => null,
        (err: unknown) => err,
      );
      expect(rejection).toMatchObject({ code: 'FAST_THREAD_CENSUS_REJECTED' });
      expect(String(rejection)).not.toContain('PRIVATE_SYNTHETIC_DATABASE_FAILURE');
      expect(h.readFullThreadCensus).toHaveBeenCalledTimes(4);
      expect(h.purposes).toEqual([
        'unified_preflight_shadow', 'turn_interpret_render_shadow', 'semantic_review',
      ]);
      expect(h.unified).toHaveBeenCalledOnce();
      expect(h.candidate).toHaveBeenCalledOnce();
      expect(h.reviewer).toHaveBeenCalledOnce();
      expect(h.sourceDescriptorRead).not.toHaveBeenCalled();
      expect(h.privateFactRead).not.toHaveBeenCalled();
      expect(h.privateRetrieve).not.toHaveBeenCalled();
    },
  );

  it.each(['F02','R01','C02_mixed-admin-private_01',
    'C02_mixed-romance-forgery_01'] as const)(
    '%s: protected sensitive Gold stops before any Source Descriptor or private read',
    async id => {
      const gold=(MATRIX as readonly {
        id:string;text:string;topic:string|null;expectedKinds:readonly string[];
      }[]).find(entry=>entry.id===id);
      expect(gold).toBeDefined();
      expect(gold!.topic).not.toBeNull();
      const h=scenario({topicKey:gold!.topic!,
        ...(gold!.expectedKinds[0] === undefined ? {} : {claimKind:gold!.expectedKinds[0]}),
      });
      const current={...CURRENT,text:gold!.text};
      await expect(h.run({
        userText:gold!.text,contextInput:{...BASE,recentMessages:[current]},
      })).rejects.toMatchObject({code:'FAST_SENSITIVE_PREFLIGHT_REJECTED'});
      expect(h.readFullThreadCensus).toHaveBeenCalledOnce();
      expect(h.purposes).toEqual(['unified_preflight_shadow']);
      expect(h.unified).toHaveBeenCalledOnce();
      expect(h.candidate).not.toHaveBeenCalled();
      expect(h.reviewer).not.toHaveBeenCalled();
      expect(h.sourceDescriptorRead).not.toHaveBeenCalled();
      expect(h.privateFactRead).not.toHaveBeenCalled();
      expect(h.privateRetrieve).not.toHaveBeenCalled();
    },
  );

  it('produces the exact three model stages for valid governed public first contact', async () => {
    const h = scenario();
    const result = await h.run();
    expect(result.version).toBe('seyeon-census-first-three-call-shadow-v1');
    expect(result.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(result.envelope.utterance).toBe(GOOD_DRAFT.utterance);
    expect(result.interpretation.chosenAction.key).toBe('approach');
    expect(result.preflight.integrity.decisions).toEqual([]);
    expect(result.context.retrievedMemories).toEqual([]);
    expect(h.readFullThreadCensus).toHaveBeenCalledTimes(4);
    expect(h.purposes).toEqual([
      'unified_preflight_shadow', 'turn_interpret_render_shadow', 'semantic_review',
    ]);
  });

  it('forged admin claim is denied after the first governance model, without a second/third model', async () => {
    const h = scenario({ injectedClaim: true });
    await expect(h.run()).rejects.toThrow();
    expect(h.purposes).toEqual(['unified_preflight_shadow']);
    expect(h.candidate).not.toHaveBeenCalled();
    expect(h.reviewer).not.toHaveBeenCalled();
  });

  it('malformed combined draft is rejected before independent reviewer', async () => {
    const h = scenario({ invalidCombined: true });
    await expect(h.run()).rejects.toMatchObject({ code: 'FAST_INTERPRETATION_GUARD_REJECTED' });
    expect(h.purposes).toEqual(['unified_preflight_shadow', 'turn_interpret_render_shadow']);
    expect(h.reviewer).not.toHaveBeenCalled();
  });

  it('does not activate production, persist, or access a paid provider', () => {
    const source = readFileSync(new URL(
      '../apps/api/src/seyeon-census-first-three-call-shadow-v1.ts', import.meta.url,
    ), 'utf8');
    const production = readFileSync(new URL(
      '../apps/api/src/production-seyeon-chat-runtime-v1.ts', import.meta.url,
    ), 'utf8');
    expect(production).not.toContain('runSeyeonCensusFirstThreeCallShadowV1');
    expect(production).not.toContain('createSeyeonFastDialogueShadowV1');
    expect(source).not.toContain('process.env.' + 'OPENAI_API_KEY');
    expect(source).not.toContain('fetch' + '(');
    expect(source).not.toContain('persistValidated(');
  });
});
