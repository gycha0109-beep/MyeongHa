import { describe, expect, it } from 'vitest';
import {
  getC1PublicComparisonProfilesV1,
  buildC1PublicComparisonPlanV1,
} from '../scripts/character-c1-three-five-public-profile-adapter-v1.js';

const questions = [
  '친구가 잘못된 선택을 하고 있어도 그냥 지켜보는 게 맞나요?',
  '그건 네 기준으로 잘못됐다는 거잖아.',
  '내가 그 친구라면 조금 서운할 것 같은데.',
  '그럼 그냥 내 편이라고 말하면 안 돼?',
  '아까 한 말이랑 지금 생각이 달라진 거야?',
];

describe('C1 public three-character five-turn study projection', () => {
  const profiles = getC1PublicComparisonProfilesV1();

  it('selects only the source-authored Seyeon, Yeoul, Taegyeom public values and flaws', () => {
    expect(profiles.map(p => p.characterId)).toEqual(['seyeon', 'yeoul', 'taegyeom']);
    expect(profiles.map(p => p.displayName)).toEqual(['세연', '여울', '태겸']);
    for (const profile of profiles) {
      expect(profile.sourceKind).toBe('REVIEWED_PUBLIC_AUTHORING_NOT_LIVE_RUNTIME');
      expect(profile.publicIdentity.values.length).toBeGreaterThan(0);
      expect(profile.publicIdentity.flaws.length).toBeGreaterThan(0);
      expect(profile.behavior.rules.length).toBeGreaterThan(0);
      expect(JSON.stringify(profile.publicIdentity)).not.toMatch(/hiddenMotivation|origin|worldRole|occupation/);
    }
    expect(new Set(profiles.map(p => JSON.stringify(p.publicIdentity.values))).size).toBe(3);
    expect(new Set(profiles.map(p => JSON.stringify(p.publicIdentity.flaws))).size).toBe(3);
  });

  it.each(profiles)('$displayName uses actual shared continuity plans for turns 2–5', (profile) => {
    const history: { role: 'user' | 'assistant'; text: string }[] = [];
    questions.forEach((question, index) => {
      const turn = buildC1PublicComparisonPlanV1({
        profile, previousDialogue: history, currentUserText: question,
      });
      if (index === 0) {
        expect(turn.turnKind).toBe('FIRST_USER_TURN_NO_PRIOR_ASSISTANT');
        expect(turn.plan).toBeNull();
      } else {
        expect(turn.turnKind).toBe('C1_BOUNDED_CONTINUITY_RESEARCH');
        expect(turn.plan?.packet.characterId).toBe(profile.characterId);
        expect(turn.plan?.packet.previousAssistantMessageRefs.length).toBeLessThanOrEqual(2);
        expect(turn.plan?.packet.recentMessageRefs.length).toBe(2 * index + 1);
        expect(turn.plan?.decisionProfile.authoredBehaviorVersion).toBe(profile.behavior.policyVersion);
        expect(turn.plan?.decisionProfile.behaviorRules.length).toBe(profile.behavior.rules.length);
        expect(turn.plan?.packet.currentUserMessageRef).toBe(
          `research:${profile.characterId}:${2 * index}`,
        );
      }
      history.push({role:'user',text:question});
      history.push({role:'assistant',text:`확인 가능한 이전 답변 ${index+1}`});
    });
  });

  it('rejects invalid ordering or invented assistant histories', () => {
    const profile = profiles[1]!;
    expect(() => buildC1PublicComparisonPlanV1({
      profile,
      previousDialogue:[{role:'assistant',text:'실제 저장된 적 없는 답변'},
        {role:'user',text:'사용자'}],
      currentUserText:'왜?',
    })).toThrow('C1_COMPARISON_DIALOGUE_NOT_ELIGIBLE');
    expect(() => buildC1PublicComparisonPlanV1({
      profile,
      previousDialogue:[{role:'user',text:'질문만'}],
      currentUserText:'왜?',
    })).toThrow('C1_COMPARISON_DIALOGUE_NOT_ELIGIBLE');
    expect(() => buildC1PublicComparisonPlanV1({
      profile,
      previousDialogue:[],
      currentUserText:' ',
    })).toThrow('C1_COMPARISON_DIALOGUE_NOT_ELIGIBLE');
  });
});
