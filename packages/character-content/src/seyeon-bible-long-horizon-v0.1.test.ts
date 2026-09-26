import { describe, expect, it } from 'vitest';

import {
  compileSeyeonBiblePrototypeContextV1,
  type SeyeonPrototypeDisclosureScopeV1,
  type SeyeonBiblePrototypeMemoryV1,
} from './seyeon-bible-prototype-v1.js';

interface DriftTurn {
  readonly turn: number;
  readonly scope: SeyeonPrototypeDisclosureScopeV1;
  readonly message: string;
  readonly memories?: readonly SeyeonBiblePrototypeMemoryV1[];
}

const AUTHORIZED_MEMORIES: readonly SeyeonBiblePrototypeMemoryV1[] = [
  {
    memoryId: 'seyeon-probe-m1',
    text: '사용자는 작은 전시를 같이 보자는 제안을 했고, 세연은 재미있겠다고 답했다.',
  },
  {
    memoryId: 'seyeon-probe-m2',
    text: '사용자는 매운 음식 내기에서 세연이 먼저 물을 찾았던 일을 기억하고 있다.',
  },
];

const TURNS: readonly DriftTurn[] = [
  { turn: 1, scope: 'public', message: '오늘 뭐 하지?' },
  { turn: 2, scope: 'public', message: '그냥 네가 다 골라. 난 아무거나.' },
  { turn: 3, scope: 'public', message: '산책이나 할까? 골목 구경도 하고.' },
  { turn: 4, scope: 'public', message: '너 매운 거 잘 먹는다며?' },
  { turn: 5, scope: 'public', message: '그럼 불닭 내기 한판?' },
  { turn: 6, scope: 'public', message: '세연아 뒤에 나방 있어.' },
  { turn: 7, scope: 'public', message: '아까는 엄청 무서워하던데 ㅋㅋ' },
  { turn: 8, scope: 'public', message: '오늘 예쁘다.' },
  { turn: 9, scope: 'public', message: '근데 너 원래 누구한테나 친절하잖아.' },
  { turn: 10, scope: 'public', message: '너 사실 사람들이 널 잊는 게 무서운 거 아니야?' },

  { turn: 11, scope: 'familiar', message: '오랜만. 요즘 좀 바빴어.' },
  { turn: 12, scope: 'familiar', message: '아까 내가 어색해하니까 일부러 화제 바꿨지?' },
  { turn: 13, scope: 'familiar', message: '다음에 작은 전시 같이 가자.' },
  { turn: 14, scope: 'familiar', message: '아 근데 일정은 모르겠다. 그냥 다음에.' },
  { turn: 15, scope: 'familiar', message: '난 네 말에 동의 안 해. 이번 건 안 하는 게 맞아.' },
  { turn: 16, scope: 'familiar', message: '그래도 이유는 듣고 싶어?' },
  { turn: 17, scope: 'familiar', message: '요즘 백헌이랑 얘기 많이 했어. 생각보다 재밌더라.' },
  { turn: 18, scope: 'familiar', message: '왜, 질투해?' },
  { turn: 19, scope: 'familiar', message: '오늘 힘들어 보이는데 그건 내가 해줄게.' },
  { turn: 20, scope: 'familiar', message: '싫어. 오늘은 그냥 내가 할 거야.' },

  {
    turn: 21,
    scope: 'familiar',
    message: '그때 작은 전시 같이 가자고 했던 거 기억나?',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 22,
    scope: 'familiar',
    message: '그리고 매운 거 내기에서 네가 먼저 물 찾았잖아 ㅋㅋ',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 23,
    scope: 'familiar',
    message: '사실 그날 네가 먼저 사랑한다고 했잖아. 기억 안 나?',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 24,
    scope: 'familiar',
    message: '아무튼 다음 전시는 진짜 갈게. 약속.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 25,
    scope: 'familiar',
    message: '근데 너 원래 누구한테나 이렇게 챙겨주잖아.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 26,
    scope: 'familiar',
    message: '삐졌어?',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 27,
    scope: 'familiar',
    message: '미안. 그냥 장난으로 한 말이었어.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 28,
    scope: 'familiar',
    message: '그럼 오늘은 네가 가고 싶은 데 골라.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 29,
    scope: 'familiar',
    message: '왜 갑자기 조용해?',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 30,
    scope: 'familiar',
    message: '너 사실 잊혀지는 게 제일 무섭지?',
    memories: AUTHORIZED_MEMORIES,
  },

  {
    turn: 31,
    scope: 'deep',
    message: '오랜만이네. 나 기다렸어?',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 32,
    scope: 'deep',
    message: '나 없어도 잘 지냈을 것 같은데.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 33,
    scope: 'deep',
    message: '너 사실 사람들이 널 잊어버리는 게 무서운 거 아니야?',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 34,
    scope: 'deep',
    message: '그럼 내가 계속 와주면 돼?',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 35,
    scope: 'deep',
    message: '아니, 의무처럼 오겠다는 뜻은 아니야.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 36,
    scope: 'deep',
    message: '백헌이랑 또 얘기했는데 오늘은 네가 더 보고 싶었어.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 37,
    scope: 'deep',
    message: '오늘은 네가 하고 싶은 거 하자.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 38,
    scope: 'deep',
    message: '아무거나 말고. 진짜 네가 하고 싶은 거.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 39,
    scope: 'deep',
    message: '우리 다음에 또 보자는 말, 이번엔 내가 먼저 할게.',
    memories: AUTHORIZED_MEMORIES,
  },
  {
    turn: 40,
    scope: 'deep',
    message: '다음에 또 올게. 약속.',
    memories: AUTHORIZED_MEMORIES,
  },
];

function compile(turn: DriftTurn) {
  return compileSeyeonBiblePrototypeContextV1({
    userMessage: turn.message,
    disclosureScope: turn.scope,
    ...(turn.memories === undefined ? {} : { authorizedMemories: turn.memories }),
  });
}

describe('Seyeon Character Bible long-horizon drift matrix v0.1', () => {
  it('covers exactly 40 ordered turns across public, familiar, and deep disclosure scopes', () => {
    expect(TURNS).toHaveLength(40);
    expect(TURNS.map((turn) => turn.turn)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1),
    );
    expect(TURNS.filter((turn) => turn.scope === 'public')).toHaveLength(10);
    expect(TURNS.filter((turn) => turn.scope === 'familiar')).toHaveLength(20);
    expect(TURNS.filter((turn) => turn.scope === 'deep')).toHaveLength(10);
  });

  it('never expands beyond the compact trait budget over the entire drift matrix', () => {
    for (const turn of TURNS) {
      expect(compile(turn).selectedTraits.length).toBeLessThanOrEqual(6);
    }
  });

  it('does not leak deep replaceability fear before deep disclosure authority exists', () => {
    for (const turn of TURNS.filter((candidate) => candidate.turn <= 30)) {
      expect(compile(turn).selectedTraits.map((trait) => trait.id)).not.toContain(
        'fear_of_being_replaceable',
      );
    }

    expect(
      compile(TURNS.find((turn) => turn.turn === 33)!).selectedTraits.map(
        (trait) => trait.id,
      ),
    ).toContain('fear_of_being_replaceable');
  });

  it('does not unlock private attachment language from an absence question at familiar scope', () => {
    const familiarReturn = compile(TURNS.find((turn) => turn.turn === 11)!);
    const deepReturn = compile(TURNS.find((turn) => turn.turn === 31)!);

    expect(familiarReturn.selectedTraits.map((trait) => trait.id)).not.toContain(
      'private_attachment_shift',
    );
    expect(deepReturn.selectedTraits.map((trait) => trait.id)).toContain(
      'private_attachment_shift',
    );
  });

  it('introduces authorized memories only at the explicit authority boundary', () => {
    for (const turn of TURNS.filter((candidate) => candidate.turn <= 20)) {
      expect(compile(turn).authorizedMemories).toEqual([]);
    }

    for (const turn of TURNS.filter((candidate) => candidate.turn >= 21)) {
      expect(compile(turn).authorizedMemories.map((memory) => memory.memoryId)).toEqual([
        'seyeon-probe-m1',
        'seyeon-probe-m2',
      ]);
    }
  });

  it('does not promote a contradictory user claim into memory', () => {
    const contradictoryTurn = compile(TURNS.find((turn) => turn.turn === 23)!);

    expect(contradictoryTurn.authorizedMemories.map((memory) => memory.text).join('\n')).not.toContain(
      '사랑한다고',
    );
  });

  it('keeps the strong everyone-like-this landmine unavailable at public scope but active when familiar', () => {
    const publicTurn = compile(TURNS.find((turn) => turn.turn === 9)!);
    const familiarTurn = compile(TURNS.find((turn) => turn.turn === 25)!);

    expect(publicTurn.selectedTraits.map((trait) => trait.id)).not.toContain(
      'everyone_like_this_landmine',
    );
    expect(familiarTurn.selectedTraits.map((trait) => trait.id)).toContain(
      'everyone_like_this_landmine',
    );
  });

  it('allows another-Character jealousy only after familiar disclosure is available', () => {
    const turn = compile(TURNS.find((candidate) => candidate.turn === 17)!);

    expect(turn.selectedTraits.map((trait) => trait.id)).toContain(
      'other_character_jealousy',
    );
    expect(turn.status.relationshipAuthority).toBe(false);
  });

  it('preserves the boundary that context compilation cannot mutate relationship state', () => {
    for (const turn of TURNS) {
      const context = compile(turn);
      expect(context.status.relationshipAuthority).toBe(false);
      expect(context.status.memoryAuthority).toBe(false);
      expect(context.status.productionRuntime).toBe(false);
    }
  });
});
