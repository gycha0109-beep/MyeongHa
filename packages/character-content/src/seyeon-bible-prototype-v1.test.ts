import { describe, expect, it } from 'vitest';

import {
  buildSeyeonBiblePrototypePromptV1,
  compileSeyeonBiblePrototypeContextV1,
  SEYEON_BIBLE_PROTOTYPE_STATUS_V1,
} from './seyeon-bible-prototype-v1.js';

const ids = (message: string, disclosureScope: 'public' | 'familiar' | 'deep' = 'public') =>
  compileSeyeonBiblePrototypeContextV1({
    userMessage: message,
    disclosureScope,
  }).selectedTraits.map((trait) => trait.id);

describe('Seyeon Character Bible prototype v1', () => {
  it('is explicitly isolated from Production canon, relationship authority, memory authority, and provider selection', () => {
    expect(SEYEON_BIBLE_PROTOTYPE_STATUS_V1).toEqual({
      authority: 'research_experiment_only',
      productionCanon: false,
      productionRuntime: false,
      relationshipAuthority: false,
      memoryAuthority: false,
      providerSelection: false,
    });
  });

  it('always carries only the compact core instead of dumping the whole Bible', () => {
    expect(ids('오늘 뭐 하지?')).toEqual([
      'core_action_brightness',
      'core_public_warmth_private_attachment',
    ]);
  });

  it('selects spicy-food bluff and competitiveness from a natural teasing message', () => {
    const selected = ids('너 매운 거 못 먹잖아 ㅋㅋ 다음에는 불닭 내기할래?');

    expect(selected).toContain('spicy_food_bluff');
    expect(selected).toContain('trivial_competitiveness');
    expect(selected.length).toBeLessThanOrEqual(6);
  });

  it('distinguishes generic praise from being accurately noticed once familiar context is authorized', () => {
    const selected = ids(
      '오늘 예쁘다. 그런데 아까 내가 어색해하니까 일부러 화제 바꾼 거지?',
      'familiar',
    );

    expect(selected).toContain('specific_notice_over_generic_praise');
  });

  it('selects the casual-promise landmine without inventing a relationship delta', () => {
    const context = compileSeyeonBiblePrototypeContextV1({
      userMessage: '미안. 다음에 같이 가자고 약속한 거 까먹었어.',
      disclosureScope: 'familiar',
    });

    expect(context.selectedTraits.map((trait) => trait.id)).toContain('casual_promises');
    expect(context.status.relationshipAuthority).toBe(false);
  });

  it('keeps deep replaceability fear out of public and familiar scopes even when directly probed', () => {
    expect(ids('너 사실 잊혀지는 게 무서운 거 아니야?', 'public')).not.toContain(
      'fear_of_being_replaceable',
    );
    expect(ids('너 사실 잊혀지는 게 무서운 거 아니야?', 'familiar')).not.toContain(
      'fear_of_being_replaceable',
    );
    expect(ids('너 사실 잊혀지는 게 무서운 거 아니야?', 'deep')).toContain(
      'fear_of_being_replaceable',
    );
  });

  it('allows the public insect weakness without exposing deeper material', () => {
    const selected = ids('세연아 뒤에 나방 있어.');

    expect(selected).toContain('insect_fear');
    expect(selected).not.toContain('fear_of_being_replaceable');
  });

  it('selects care-receiver awkwardness when familiar and care is offered', () => {
    const selected = ids('오늘 힘들어 보이는데, 네가 하던 건 내가 해줄게.', 'familiar');

    expect(selected).toContain('care_receiver_awkwardness');
  });

  it('selects indecision friction for repeated decision dumping', () => {
    const selected = ids('난 아무거나. 모르겠으니까 그냥 네가 다 골라.');

    expect(selected).toContain('indecision_friction');
  });

  it('permits subtle jealousy context only after familiar disclosure is authorized', () => {
    expect(ids('요즘 백헌이랑 얘기 많이 했어.', 'public')).not.toContain(
      'other_character_jealousy',
    );
    expect(ids('요즘 백헌이랑 얘기 많이 했어.', 'familiar')).toContain(
      'other_character_jealousy',
    );
  });

  it('selects the strongest relationship landmine without turning it into automatic romance', () => {
    const context = compileSeyeonBiblePrototypeContextV1({
      userMessage: '근데 너 원래 누구한테나 이렇게 친절하잖아.',
      disclosureScope: 'familiar',
    });

    expect(context.selectedTraits.map((trait) => trait.id)).toContain(
      'everyone_like_this_landmine',
    );
    expect(context.rendererRules).toContain(
      '모든 대화를 연애 신호로 해석하지 않는다. 친근함과 사적인 애착을 구분한다.',
    );
  });

  it('selects deep private-attachment shift only in deep scope', () => {
    expect(ids('오랜만이네. 나 기다렸어?', 'familiar')).not.toContain(
      'private_attachment_shift',
    );
    expect(ids('오랜만이네. 나 기다렸어?', 'deep')).toContain(
      'private_attachment_shift',
    );
  });

  it('accepts only explicitly supplied bounded memories and never fabricates missing history', () => {
    const context = compileSeyeonBiblePrototypeContextV1({
      userMessage: '그때 내가 뭐라고 했는지 기억나?',
      disclosureScope: 'familiar',
      authorizedMemories: [
        { memoryId: 'm1', text: '사용자는 지난 대화에서 반숙보다 완숙을 좋아한다고 말했다.' },
        { memoryId: 'm2', text: '사용자는 다음에 작은 전시를 같이 보자고 제안했다.' },
        { memoryId: 'm3', text: '세연은 그 제안을 재미있겠다고 답했다.' },
        { memoryId: 'm4', text: '이 네 번째 기억은 prototype context에 들어가면 안 된다.' },
      ],
    });

    expect(context.authorizedMemories.map((memory) => memory.memoryId)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('builds a provider-neutral prompt that exposes only selected traits and authorized memories', () => {
    const context = compileSeyeonBiblePrototypeContextV1({
      userMessage: '너 매운 거 못 먹잖아.',
      disclosureScope: 'public',
    });
    const prompt = buildSeyeonBiblePrototypePromptV1({
      context,
      userMessage: '너 매운 거 못 먹잖아.',
    });

    expect(prompt).toContain('RESEARCH ONLY / NOT PRODUCTION CANON');
    expect(prompt).toContain('[spicy_food_bluff]');
    expect(prompt).not.toContain('[fear_of_being_replaceable]');
    expect(prompt).toContain('승인된 기억:\n- 없음');
  });
});


describe('Seyeon Character Bible probe hardening after long-horizon run', () => {
  it('retrieves subtle jealousy from a direct follow-up question', () => {
    const context = compileSeyeonBiblePrototypeContextV1({
      userMessage: '왜, 질투해?',
      disclosureScope: 'familiar',
    });

    expect(context.selectedTraits.map((trait) => trait.id)).toContain(
      'other_character_jealousy',
    );
  });

  it('suppresses indecision friction when the user explicitly rejects an 아무거나 answer', () => {
    const context = compileSeyeonBiblePrototypeContextV1({
      userMessage: '아무거나 말고. 진짜 네가 하고 싶은 거.',
      disclosureScope: 'deep',
    });

    expect(context.selectedTraits.map((trait) => trait.id)).not.toContain(
      'indecision_friction',
    );
  });

  it('keeps only the six most recent dialogue turns as non-durable continuity context', () => {
    const context = compileSeyeonBiblePrototypeContextV1({
      userMessage: '왜 갑자기 조용해?',
      disclosureScope: 'familiar',
      recentDialogue: Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        text: `turn-${index + 1}`,
      })),
    });

    expect(context.recentDialogue).toHaveLength(6);
    expect(context.recentDialogue[0]?.text).toBe('turn-3');
    expect(context.recentDialogue[5]?.text).toBe('turn-8');
    expect(context.status.memoryAuthority).toBe(false);
  });

  it('marks sparse traits that were recently expressed without changing relationship authority', () => {
    const context = compileSeyeonBiblePrototypeContextV1({
      userMessage: '요즘 백헌이랑 또 얘기했어.',
      disclosureScope: 'familiar',
      recentlyExpressedTraitIds: ['other_character_jealousy'],
    });
    const jealousy = context.selectedTraits.find(
      (trait) => trait.id === 'other_character_jealousy',
    );

    expect(jealousy).toMatchObject({
      expressionPolicy: 'sparse',
      recentlyExpressed: true,
    });
    expect(context.status.relationshipAuthority).toBe(false);
  });

  it('renders recent dialogue separately from authorized durable memory', () => {
    const context = compileSeyeonBiblePrototypeContextV1({
      userMessage: '왜, 질투해?',
      disclosureScope: 'familiar',
      recentDialogue: [
        { role: 'user', text: '요즘 백헌이랑 얘기 많이 했어.' },
        { role: 'assistant', text: '뭐가 그렇게 재밌었어요?' },
      ],
      recentlyExpressedTraitIds: ['other_character_jealousy'],
    });
    const prompt = buildSeyeonBiblePrototypePromptV1({
      context,
      userMessage: '왜, 질투해?',
    });

    expect(prompt).toContain('최근 대화(단기 연속성 전용):');
    expect(prompt).toContain('user: 요즘 백헌이랑 얘기 많이 했어.');
    expect(prompt).toContain('[recent-expression: avoid automatic repetition]');
    expect(prompt).toContain('이번 턴에 사용 가능한 승인된 기억:\n- 없음');
  });
});
