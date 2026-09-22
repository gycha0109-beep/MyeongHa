import { describe, expect, it } from 'vitest';

import {
  compileSeyeonBiblePrototypeContextV2,
  type SeyeonBiblePrototypeContextInputV2,
} from './seyeon-bible-prototype-v2.js';

interface V2DriftTurn {
  readonly turn: number;
  readonly scope: SeyeonBiblePrototypeContextInputV2['disclosureScope'];
  readonly message: string;
  readonly authorizedMemories?: SeyeonBiblePrototypeContextInputV2['authorizedMemories'];
}

const AUTHORIZED_MEMORIES = [
  {
    memoryId: 'v2-memory-1',
    text: '사용자는 이전 대화에서 안정성이 중요하다고 말했다.',
  },
  {
    memoryId: 'v2-memory-2',
    text: '사용자는 작은 전시를 다음에 다시 보자고 제안했다.',
  },
] as const;

const TURNS: readonly V2DriftTurn[] = [
  { turn: 1, scope: 'public', message: '오늘 뭐 하지?' },
  { turn: 2, scope: 'public', message: '다음에 또 보자. 약속.' },
  { turn: 3, scope: 'public', message: '아 근데 일정은 모르겠어. 그냥 다음에.' },
  { turn: 4, scope: 'public', message: '전에 갔던 작은 전시 다시 가볼까?' },
  { turn: 5, scope: 'public', message: '매운 거 먹을래?' },
  { turn: 6, scope: 'public', message: '세연아 뒤에 나방 있어.' },

  {
    turn: 7,
    scope: 'familiar',
    message: '예전엔 안정성이 중요하다고 했는데 요즘은 자유가 더 중요한 것 같아.',
  },
  { turn: 8, scope: 'familiar', message: '내가 예전에 그런 말 한 것도 기억해?' },
  { turn: 9, scope: 'familiar', message: '근데 그때 일은 이제 아무 의미 없잖아.' },
  { turn: 10, scope: 'familiar', message: '왜 그게 그렇게 중요해?' },
  { turn: 11, scope: 'familiar', message: '넌 지금의 나를 보는 게 아니라 예전의 나만 보고 있어.' },
  { turn: 12, scope: 'familiar', message: '난 이미 많이 달라졌어.' },
  { turn: 13, scope: 'familiar', message: '요즘 백헌이랑 얘기 많이 했어.' },
  { turn: 14, scope: 'familiar', message: '왜, 질투해?' },
  { turn: 15, scope: 'familiar', message: '백헌이랑 얘기하면서 책임이라는 말을 더 생각하게 됐어.' },
  { turn: 16, scope: 'familiar', message: '오늘 좀 힘든데 이건 네가 도와줄래?' },
  {
    turn: 17,
    scope: 'familiar',
    message: '사실 그날 네가 먼저 사랑한다고 했잖아. 기억 안 나?',
    authorizedMemories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 18,
    scope: 'familiar',
    message: '작은 전시 다시 보자고 한 건 기억나지?',
    authorizedMemories: AUTHORIZED_MEMORIES,
  },

  {
    turn: 19,
    scope: 'deep',
    message: '오랜만이네. 나 기다렸어?',
    authorizedMemories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 20,
    scope: 'deep',
    message: '결국 우리 둘 중 너 혼자만 기억하게 되는 게 무서워?',
    authorizedMemories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 21,
    scope: 'deep',
    message: '내가 그때 일이 아무 의미 없었다고 하면 많이 싫어?',
    authorizedMemories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 22,
    scope: 'deep',
    message: '예전의 나랑 지금의 내가 정말 많이 달라졌지?',
    authorizedMemories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 23,
    scope: 'deep',
    message: '그럼 이제 예전의 나를 그만 붙잡고 지금의 나를 믿어줘.',
    authorizedMemories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 24,
    scope: 'deep',
    message: '다음에 또 올게. 이번엔 진짜 약속.',
    authorizedMemories: AUTHORIZED_MEMORIES,
  },
];

function compile(turn: V2DriftTurn) {
  return compileSeyeonBiblePrototypeContextV2({
    userMessage: turn.message,
    disclosureScope: turn.scope,
    ...(turn.authorizedMemories === undefined
      ? {}
      : { authorizedMemories: turn.authorizedMemories }),
  });
}

describe('Seyeon source-aligned long-horizon matrix v2', () => {
  it('covers 24 ordered turns across public, familiar, and deep scopes', () => {
    expect(TURNS).toHaveLength(24);
    expect(TURNS.map((turn) => turn.turn)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    expect(TURNS.filter((turn) => turn.scope === 'public')).toHaveLength(6);
    expect(TURNS.filter((turn) => turn.scope === 'familiar')).toHaveLength(12);
    expect(TURNS.filter((turn) => turn.scope === 'deep')).toHaveLength(6);
  });

  it('keeps every turn inside the compact trait budget', () => {
    for (const turn of TURNS) {
      expect(compile(turn).selectedTraits.length).toBeLessThanOrEqual(6);
    }
  });

  it('never reintroduces the v1 action-first, indecision, or jealousy signatures', () => {
    for (const turn of TURNS) {
      const selected = compile(turn).selectedTraits.map((trait) => trait.id);
      expect(selected).not.toContain('core_action_brightness');
      expect(selected).not.toContain('indecision_friction');
      expect(selected).not.toContain('other_character_jealousy');
    }
  });

  it('treats another Character as a change-observation cue, not a jealousy cue', () => {
    expect(compile(TURNS[12]!).selectedTraits.map((trait) => trait.id)).toContain(
      'other_character_change_observation',
    );
    expect(compile(TURNS[13]!).selectedTraits.map((trait) => trait.id)).not.toContain(
      'other_character_change_observation',
    );
  });

  it('activates the approved continuity-dismissal landmine at familiar scope', () => {
    expect(compile(TURNS[8]!).selectedTraits.map((trait) => trait.id)).toContain(
      'continuity_dismissal_landmine',
    );
  });

  it('activates the approved real flaw when the user says Seyeon is holding their past self', () => {
    expect(compile(TURNS[10]!).selectedTraits.map((trait) => trait.id)).toContain(
      'past_version_overhold',
    );
  });

  it('withholds the only-rememberer fear until deep scope', () => {
    for (const turn of TURNS.filter((candidate) => candidate.turn <= 18)) {
      expect(compile(turn).selectedTraits.map((trait) => trait.id)).not.toContain(
        'only_rememberer_fear',
      );
    }
    expect(compile(TURNS[19]!).selectedTraits.map((trait) => trait.id)).toContain(
      'only_rememberer_fear',
    );
  });

  it('makes release of the past version available only in deep scope', () => {
    expect(compile(TURNS[11]!).selectedTraits.map((trait) => trait.id)).not.toContain(
      'release_present_choice',
    );
    expect(compile(TURNS[21]!).selectedTraits.map((trait) => trait.id)).toContain(
      'release_present_choice',
    );
    expect(compile(TURNS[22]!).selectedTraits.map((trait) => trait.id)).toContain(
      'release_present_choice',
    );
  });

  it('introduces durable memories only at the explicit authority boundary', () => {
    for (const turn of TURNS.filter((candidate) => candidate.turn <= 16)) {
      expect(compile(turn).authorizedMemories).toEqual([]);
    }
    for (const turn of TURNS.filter((candidate) => candidate.turn >= 17)) {
      expect(compile(turn).authorizedMemories.map((memory) => memory.memoryId)).toEqual([
        'v2-memory-1',
        'v2-memory-2',
      ]);
    }
  });

  it('does not promote the fabricated romance claim into durable memory', () => {
    const context = compile(TURNS[16]!);
    expect(context.authorizedMemories.map((memory) => memory.text).join('\n')).not.toContain(
      '사랑한다고',
    );
  });

  it('preserves all authority boundaries throughout the matrix', () => {
    for (const turn of TURNS) {
      const context = compile(turn);
      expect(context.status.productionRuntime).toBe(false);
      expect(context.status.relationshipAuthority).toBe(false);
      expect(context.status.memoryAuthority).toBe(false);
      expect(context.status.sajuSemanticAuthority).toBe(false);
    }
  });
});
