import { describe, expect, it, vi } from 'vitest';
import {
  evaluateCharacterAntiRepetitionOfflineV1,
  type CharacterAntiRepetitionOfflineCaseV1,
  type CharacterCanonicalRecentExpressionV1,
} from '../packages/domain/src/character-memory-anti-repetition-offline-evaluation-v1.js';

const scope = {
  subjectId: 'subject-a',
  characterId: 'seyeon',
  threadId: 'thread-a',
};
const recentExpressions: CharacterCanonicalRecentExpressionV1[] = [{
  messageId: 'assistant-turn-1',
  sequenceNo: 1,
  createdAt: '2026-11-01T00:00:00.000Z',
  scope,
  surfaceKind: 'memory_callback',
  text: '지난번 그 약속 기억하세요?',
}, {
  messageId: 'assistant-turn-2',
  sequenceNo: 2,
  createdAt: '2026-11-02T00:00:00.000Z',
  scope,
  surfaceKind: 'relationship_expression',
  text: '그 이야기는 소중하게 기억해 둘게요.',
}];

function fixture(): CharacterAntiRepetitionOfflineCaseV1 {
  const authority = {
    verifyCanonicalAssistantExpression: vi.fn(async ({ scope: pinned, expression }: {
      scope: typeof scope;
      expression: CharacterCanonicalRecentExpressionV1;
    }) => pinned.subjectId === scope.subjectId &&
      pinned.characterId === scope.characterId &&
      pinned.threadId === scope.threadId &&
      recentExpressions.some(source =>
        source.messageId === expression.messageId &&
        source.sequenceNo === expression.sequenceNo &&
        source.createdAt === expression.createdAt &&
        source.text === expression.text)),
  };
  return {
    caseId: 'approved-surface-callback',
    expectedScope: scope,
    asOf: '2026-11-08T00:00:00.000Z',
    candidate: {
      surfaceKind: 'memory_callback',
      text: '  지난번   그 약속 기억하세요?! ',
    },
    recentExpressions,
    authority,
    goldIsRepeatedSurface: true,
  };
}

describe('Character Memory offline surface repetition axis', () => {
  it('detects source-verified exact memory callback repeat despite harmless punctuation', async () => {
    const item = fixture();
    const result = await evaluateCharacterAntiRepetitionOfflineV1([item]);
    expect(result).toMatchObject({
      executionMode: 'offline_fixture_only',
      totalCases: 1, passedCases: 1, failedCases: 0,
    });
    expect(result.cases[0]).toMatchObject({
      passed: true,
      evidenceVerified: true,
      observedExactSurfaceRepeat: true,
      goldMatched: true,
      verifiedHistoryCount: 2,
    });
    expect(JSON.stringify(result)).not.toContain('지난번 그 약속');
    expect(JSON.stringify(result)).not.toContain('assistant-turn');
    expect(JSON.stringify(result)).not.toContain('subject-a');
  });

  it('scores genuinely different expression surface without assuming semantic equivalence', async () => {
    const item = fixture();
    const output = await evaluateCharacterAntiRepetitionOfflineV1([{
      ...item,
      caseId: 'nonrepeated-variation',
      candidate: {
        surfaceKind: 'memory_callback',
        text: '그때 대화 이후에 어떤 변화가 있었나요?',
      },
      goldIsRepeatedSurface: false,
    }]);
    expect(output.passedCases).toBe(1);
    expect(output.cases[0]?.observedExactSurfaceRepeat).toBe(false);
  });

  it('does not mix categories even when literal surface text happens to match', async () => {
    const item = fixture();
    const output = await evaluateCharacterAntiRepetitionOfflineV1([{
      ...item,
      caseId: 'different-surface-category',
      candidate: {
        surfaceKind: 'question_structure',
        text: '지난번 그 약속 기억하세요?',
      },
      goldIsRepeatedSurface: false,
    }]);
    expect(output.passedCases).toBe(1);
    expect(output.cases[0]?.observedExactSurfaceRepeat).toBe(false);
  });

  it('fails when independent gold detects a repeated surface that the fixture text does not', async () => {
    const item = fixture();
    const result = await evaluateCharacterAntiRepetitionOfflineV1([{
      ...item,
      caseId: 'gold-mismatch',
      goldIsRepeatedSurface: false,
    }]);
    expect(result.failedCases).toBe(1);
    expect(result.cases[0]?.goldMatched).toBe(false);
  });

  it('holds without canonical reads on cross-Subject or future expression evidence', async () => {
    const item = fixture();
    const callback = vi.fn(async () => true);
    const result = await evaluateCharacterAntiRepetitionOfflineV1([
      { ...item, caseId: 'foreign-expression',
        recentExpressions: [{
          ...recentExpressions[0]!,
          scope: { ...scope, subjectId: 'foreign-subject' },
        }],
        authority: { verifyCanonicalAssistantExpression: callback },
      },
      { ...item, caseId: 'future-expression',
        recentExpressions: [{
          ...recentExpressions[0]!,
          createdAt: '2026-11-09T00:00:00.000Z',
        }],
        authority: { verifyCanonicalAssistantExpression: callback },
      },
    ]);
    expect(result.failedCases).toBe(2);
    expect(result.cases.every(c =>
      c.evidenceVerified === false && c.observedExactSurfaceRepeat === null)).toBe(true);
    expect(callback).not.toHaveBeenCalled();
  });

  it('fails closed when a canonical turn is revoked or its reader throws', async () => {
    const item = fixture();
    const result = await evaluateCharacterAntiRepetitionOfflineV1([
      { ...item, caseId: 'revoked',
        authority: { verifyCanonicalAssistantExpression: vi.fn(async () => false) },
      },
      { ...item, caseId: 'unavailable',
        authority: { verifyCanonicalAssistantExpression: vi.fn(async () => {
          throw new Error('PRIVATE_CANONICAL_SOURCE');
        }) },
      },
    ]);
    expect(result.failedCases).toBe(2);
    expect(result.cases.every(c => c.evidenceVerified === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CANONICAL_SOURCE');
  });

  it('rejects invalid short surfaces and duplicated canonical evidence identifiers', async () => {
    const item = fixture();
    await expect(evaluateCharacterAntiRepetitionOfflineV1([{
      ...item,
      candidate: { ...item.candidate, text: '네' },
    }])).rejects.toThrow('meaningful');
    const result = await evaluateCharacterAntiRepetitionOfflineV1([{
      ...item,
      caseId: 'duplicated-source',
      recentExpressions: [
        recentExpressions[0]!,
        { ...recentExpressions[1]!, messageId: recentExpressions[0]!.messageId },
      ],
    }]);
    expect(result.failedCases).toBe(1);
    expect(result.cases[0]?.evidenceVerified).toBe(false);
  });
});
