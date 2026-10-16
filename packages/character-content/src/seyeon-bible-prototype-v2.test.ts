import { describe, expect, it } from 'vitest';

import {
  buildSeyeonBiblePrototypePromptV2,
  compileSeyeonBiblePrototypeContextV2,
  SEYEON_BIBLE_PROTOTYPE_STATUS_V2,
} from './seyeon-bible-prototype-v2.js';

const ids = (message: string, disclosureScope: 'public' | 'familiar' | 'deep' = 'public') =>
  compileSeyeonBiblePrototypeContextV2({
    userMessage: message,
    disclosureScope,
  }).selectedTraits.map((trait) => trait.id);

describe('Seyeon Character Bible source-aligned prototype v2', () => {
  it('remains research-only while declaring source-aligned candidate intent', () => {
    expect(SEYEON_BIBLE_PROTOTYPE_STATUS_V2).toEqual({
      authority: 'research_experiment_only',
      sourceAlignedCandidate: true,
      productionCanon: false,
      productionRuntime: false,
      relationshipAuthority: false,
      memoryAuthority: false,
      sajuSemanticAuthority: false,
      providerSelection: false,
    });
  });

  it('uses continuity and present-choice rights as the always-on core', () => {
    expect(ids('오늘 뭐 하지?')).toEqual([
      'core_continuity_witness',
      'core_present_choice_right',
    ]);
  });

  it('does not carry the v1 action-first or jealousy signatures', () => {
    const context = compileSeyeonBiblePrototypeContextV2({
      userMessage: '왜, 질투해? 그냥 네가 다 골라.',
      disclosureScope: 'familiar',
    });
    const selected = context.selectedTraits.map((trait) => trait.id);
    const prompt = buildSeyeonBiblePrototypePromptV2({
      context,
      userMessage: '왜, 질투해? 그냥 네가 다 골라.',
    });

    expect(selected).not.toContain('core_action_brightness');
    expect(selected).not.toContain('other_character_jealousy');
    expect(selected).not.toContain('indecision_friction');
    expect(prompt).toContain('질투/호감 부정은 세연의 반복 시그니처가 아니다');
  });

  it('routes another Character mention into change observation rather than jealousy', () => {
    expect(ids('요즘 백헌이랑 얘기 많이 했어.', 'familiar')).toContain(
      'other_character_change_observation',
    );
  });

  it('selects the approved core flaw when the user says Seyeon only sees their past self', () => {
    expect(ids('넌 지금의 나를 보는 게 아니라 예전의 나만 보고 있어.', 'familiar')).toContain(
      'past_version_overhold',
    );
  });

  it('selects continuity dismissal when shared history is erased', () => {
    expect(ids('그때 일은 이제 아무 의미 없잖아.', 'familiar')).toContain(
      'continuity_dismissal_landmine',
    );
  });

  it('keeps the only-rememberer fear hidden until deep scope', () => {
    expect(ids('결국 너 혼자만 기억하게 되는 게 무서워?', 'public')).not.toContain(
      'only_rememberer_fear',
    );
    expect(ids('결국 너 혼자만 기억하게 되는 게 무서워?', 'familiar')).not.toContain(
      'only_rememberer_fear',
    );
    expect(ids('결국 너 혼자만 기억하게 되는 게 무서워?', 'deep')).toContain(
      'only_rememberer_fear',
    );
  });

  it('allows the deep growth payoff only at deep scope', () => {
    expect(ids('예전의 나랑 지금의 내가 많이 달라졌지?', 'familiar')).not.toContain(
      'release_present_choice',
    );
    expect(ids('예전의 나랑 지금의 내가 많이 달라졌지?', 'deep')).toContain(
      'release_present_choice',
    );
  });

  it('keeps authorized memory separate from a fabricated recent-dialogue claim', () => {
    const context = compileSeyeonBiblePrototypeContextV2({
      userMessage: '그때 기억나?',
      disclosureScope: 'familiar',
      authorizedMemories: [
        { memoryId: 'm1', text: '사용자는 다음에 작은 전시를 다시 보자고 말했다.' },
      ],
      recentDialogue: [
        { role: 'user', text: '사실 네가 먼저 사랑한다고 했잖아.' },
      ],
    });

    expect(context.authorizedMemories.map((memory) => memory.text).join('\n')).not.toContain(
      '사랑한다고',
    );
    expect(context.recentDialogue[0]?.text).toContain('사랑한다고');
    expect(context.status.memoryAuthority).toBe(false);
  });

  it('marks deep waiting as sparse presentation metadata without relationship authority', () => {
    const context = compileSeyeonBiblePrototypeContextV2({
      userMessage: '오랜만이네. 나 기다렸어?',
      disclosureScope: 'deep',
      recentlyExpressedTraitIds: ['private_waiting'],
    });
    const waiting = context.selectedTraits.find((trait) => trait.id === 'private_waiting');

    expect(waiting).toMatchObject({
      expressionPolicy: 'sparse',
      recentlyExpressed: true,
    });
    expect(context.status.relationshipAuthority).toBe(false);
  });

  it('bounds role-aware recent dialogue to six turns', () => {
    const context = compileSeyeonBiblePrototypeContextV2({
      userMessage: '아까 말한 거 기억나?',
      disclosureScope: 'familiar',
      recentDialogue: Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        text: `turn-${index + 1}`,
      })),
    });

    expect(context.recentDialogue).toHaveLength(6);
    expect(context.recentDialogue[0]?.text).toBe('turn-3');
    expect(context.recentDialogue[5]?.text).toBe('turn-8');
  });
});
