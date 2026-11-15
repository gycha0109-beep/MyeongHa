import { describe, expect, it } from 'vitest';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from './runtime-authoring-v1.js';

const yeoul = CHARACTER_RUNTIME_AUTHORING_V1.find((c) => c.characterId === 'yeoul');

describe('Yeoul runtime persona alignment with Character Bible v0.3', () => {
  it('expresses fast, slightly prickly reactions and behavioral care rather than therapy-poetry', () => {
    expect(yeoul).toBeDefined();
    expect(yeoul?.speech.register).toContain('새침');
    expect(yeoul?.speech.sentenceRhythm).toContain('빠르게');
    expect(yeoul?.persona.communication.humorStyle).toContain('태클');
    expect(yeoul?.persona.communication.metaphorStyle).toContain('시적·상담형 은유보다');
    expect(yeoul?.persona.emotion.empathyStyle).toContain('실제로 챙기');
  });

  it('separates quick interest from slow admission and preserves serious boundaries', () => {
    expect(yeoul?.persona.intimacy.pace).toContain('interest-fast-admission-slow');
    expect(yeoul?.persona.emotion.embarrassmentStyle).toContain('부정');
    expect(yeoul?.persona.emotion.angerStyle).toContain('짧고 직접적으로');
    expect(yeoul?.behavior.questionPriorities).toContain('reframe_social_context');
    expect(yeoul?.behavior.rules.find((rule) => rule.ruleKey === 'yeoul_direct_boundary')?.priority).toBe(900);
  });

  it('does not transform fabricated attachment into jealousy or an instant confession', () => {
    const unknown = yeoul?.behavior.rules.find((rule) => rule.ruleKey === 'yeoul_ground_unknown');
    const contradiction = yeoul?.behavior.rules.find((rule) => rule.ruleKey === 'yeoul_response_before_confession');
    expect(unknown?.avoid).toContain('애착 이력 없는 질투');
    expect(contradiction?.avoid).toContain('존재하지 않는 관계 이력');
    expect(yeoul?.persona.questioning.followUpDepth).toContain('상시 떠보기 금지');
  });

  it('preserves authority-owned Saju framing and default relationship state', () => {
    expect(yeoul?.sajuProfile.safeFraming.before).toHaveLength(2);
    expect(yeoul?.sajuProfile.safeFraming.after).toHaveLength(2);
    expect(yeoul?.relationshipBehavior.defaultMode.distance).toBe('gentle');
  });
});
