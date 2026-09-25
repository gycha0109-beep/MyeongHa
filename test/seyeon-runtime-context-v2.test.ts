import { describe, expect, it } from 'vitest';

import {
  assembleSeyeonRuntimeContextV2,
  resolveSeyeonBibleSliceSelectionV2,
} from '../packages/domain/src/seyeon-runtime-context-v2.js';

describe('Se-yeon runtime context v2', () => {
  it('assembles a bounded packet with authored source identity and authority boundaries', () => {
    const context = assembleSeyeonRuntimeContextV2({
      relationship: {
        stageKey: 'familiar',
        closenessBand: 'medium',
        trustBand: 'medium',
        frictionBand: 'low',
        revision: 7,
        policyVersion: 'relationship-policy-v1',
      },
      recentMessages: [
        { messageId: 'm1', role: 'user', text: 'A랑 B 중 아직도 못 정했어요.' },
        { messageId: 'm2', role: 'assistant', text: '지난번에는 A 쪽을 더 보셨죠.' },
      ],
      disclosure: { decision: null, retrievedSources: [] },
      retrievedMemories: [
        {
          memoryId: 'memory-1',
          kind: 'memory',
          claimKind: 'fact',
          summary: '사용자는 이전에 B보다 A를 선호한다고 직접 말했다.',
          sourceRef: 'turn:184/message:901',
          relevance: 0.95,
          salience: 0.7,
        },
      ],
      focuses: ['choice', 'memory'],
    });

    expect(context.character.characterId).toBe('seyeon');
    expect(context.character.sourceBibleBlobSha).toBe(
      '03ec32f43e56c2efbca75461c24a19a4690f683e',
    );
    expect(context.authorityBoundaries.hypothesisMayBeUsedAsAutobiographicalFact).toBe(false);
    expect(context.bibleSlices.map((slice) => slice.id)).toEqual(
      expect.arrayContaining([
        'C7_real_flaw',
        'C8_choice_style',
        'R12_memory_behavior',
        'R14_guards',
      ]),
    );
    expect(context.retrievedMemories[0]?.sourceRef).toBe('turn:184/message:901');
    expect(context.retrievalPolicy.callbackRequiresSourceRef).toBe(true);
    expect(context.retrievalPolicy.privateCharacterContentRequiresDisclosureDecision).toBe(true);
  });

  it('keeps fact and Character interpretation distinct instead of flattening both into memory truth', () => {
    const context = assembleSeyeonRuntimeContextV2({
      relationship: null,
      recentMessages: [],
      disclosure: { decision: null, retrievedSources: [] },
      retrievedMemories: [
        {
          memoryId: 'fact-1',
          kind: 'relationship_event',
          claimKind: 'fact',
          summary: '사용자는 A라고 말한 뒤 B를 선택했다.',
          sourceRef: 'turn:20',
          relevance: 0.8,
          salience: 0.8,
        },
        {
          memoryId: 'interpretation-1',
          kind: 'relationship_event',
          claimKind: 'character_interpretation',
          summary: '세연은 말과 행동의 차이를 의식했다.',
          sourceRef: 'turn:20/interpretation:seyeon',
          relevance: 0.7,
          salience: 0.7,
        },
      ],
      focuses: ['memory'],
    });

    expect(context.retrievedMemories.map((memory) => memory.claimKind)).toEqual([
      'fact',
      'character_interpretation',
    ]);
    expect(context.retrievalPolicy.factAndInterpretationRemainDistinct).toBe(true);
  });

  it('bounds recent conversation and retrieved memories instead of allowing unbounded context growth', () => {
    const recentMessages = Array.from({ length: 30 }, (_, index) => ({
      messageId: `m-${index}`,
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `message-${index}`,
    }));
    const retrievedMemories = Array.from({ length: 20 }, (_, index) => ({
      memoryId: `memory-${index}`,
      kind: 'memory' as const,
      claimKind: 'fact' as const,
      summary: `summary-${index}`,
      sourceRef: `turn:${index}`,
      relevance: index / 20,
      salience: (20 - index) / 20,
    }));

    const context = assembleSeyeonRuntimeContextV2({
      relationship: null,
      recentMessages,
      retrievedMemories,
    });

    expect(context.recentConversation).toHaveLength(12);
    expect(context.recentConversation[0]?.messageId).toBe('m-18');
    expect(context.retrievedMemories).toHaveLength(8);
    expect(context.retrievedMemories[0]?.memoryId).toBe('memory-19');
  });

  it('selects focus slices deterministically and always retains relationship/drift/guard boundaries', () => {
    const slices = resolveSeyeonBibleSliceSelectionV2({
      focuses: ['care', 'conflict'],
      hasRetrievedMemories: false,
    });

    expect(slices).toEqual(
      expect.arrayContaining([
        'A_character_compass',
        'F3_care',
        'F4_receiving_help',
        'F6_triggers',
        'R9_conflict_repair',
        'R11_relationship_reveal',
        'R13_drift_risks',
        'R14_guards',
      ]),
    );
  });

  it('fails closed when a retrieved memory has no provenance', () => {
    expect(() =>
      assembleSeyeonRuntimeContextV2({
        relationship: null,
        recentMessages: [],
        retrievedMemories: [
          {
            memoryId: 'memory-1',
            kind: 'memory',
            claimKind: 'fact',
            summary: '근거 없는 callback 후보',
            sourceRef: '   ',
            relevance: 1,
            salience: 1,
          },
        ],
      }),
    ).toThrow(/sourceRef/);
  });
});