import { describe, expect, it, vi } from 'vitest';
import {
  compactCharacterCanonicalTurnExcerptsOfflineV1,
  type CharacterOfflineCanonicalTurnAuthorityV1,
} from '../packages/domain/src/character-offline-evidence-excerpt-compaction-v1.js';
import {
  evaluateCharacterOfflineEpisodeQualityV1,
  type CharacterOfflineEpisodeQualityFixtureV1,
} from '../packages/domain/src/character-offline-episode-quality-evaluation-v1.js';

const scope = Object.freeze({
  subjectId: 'offline-subject',
  characterId: 'baekheon',
  threadId: 'offline-thread',
});
const sourceIds = ['turn-1', 'turn-4', 'turn-9', 'turn-16', 'turn-23', 'turn-31', 'turn-40'];
const protectedIds = ['turn-16', 'turn-31'];

function harness() {
  const canonicalTurns = Array.from({ length: 40 }, (_, i) => ({
    messageId: 'turn-' + (i + 1),
    sequenceNo: i + 1,
    role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
    speakerCharacterId: i % 2 === 0 ? null : 'baekheon',
    createdAt: new Date(Date.parse('2026-09-01T00:00:00.000Z') +
      i * 24 * 60 * 60 * 1000).toISOString(),
    text: 'private-fixture-utterance-' + (i + 1) + ':' +
      String((i % 9) + 1).repeat(300),
  }));
  const sourceAuthority: CharacterOfflineCanonicalTurnAuthorityV1 = {
    verifyCanonicalTurn: vi.fn(async ({ scope: authorized, turn }) =>
      authorized.subjectId === scope.subjectId &&
      authorized.characterId === scope.characterId &&
      authorized.threadId === scope.threadId &&
      canonicalTurns.some(source => source.messageId === turn.messageId &&
        source.text === turn.text &&
        source.createdAt === turn.createdAt &&
        source.role === turn.role &&
        source.speakerCharacterId === turn.speakerCharacterId &&
        source.sequenceNo === turn.sequenceNo)),
  };
  const gold = {
    expectedRetainedMessageIds: sourceIds,
    forbiddenRetainedMessageIds: ['turn-2', 'turn-18'],
    mustPreserveMessageIds: protectedIds,
  };
  return { canonicalTurns, sourceAuthority, gold };
}

async function fixture(): Promise<CharacterOfflineEpisodeQualityFixtureV1> {
  const { canonicalTurns, sourceAuthority, gold } = harness();
  const output = await compactCharacterCanonicalTurnExcerptsOfflineV1({
    scope, canonicalTurns,
    selectedMessageIds: sourceIds,
    protectedMessageIds: protectedIds,
    maximumEpisodeBytes: 7500,
    authority: sourceAuthority,
  });
  if (output.privateEpisode === null) throw new Error('Synthetic fixture requires beneficial compaction');
  return {
    caseId: 'forty-turn-long-session',
    expectedScope: scope,
    canonicalTurns,
    privateEpisode: output.privateEpisode,
    sourceAuthority,
    independentGold: gold,
  };
}

describe('40-turn offline compaction source quality evaluation', () => {
  it('measures bounded long-session evidence savings without false source selection', async () => {
    const input = await fixture();
    const result = await evaluateCharacterOfflineEpisodeQualityV1([input]);
    expect(result).toMatchObject({
      executionMode: 'offline_synthetic_only',
      totalCases: 1, passedCases: 1, failedCases: 0,
    });
    expect(result.cases[0]?.checks).toEqual({
      currentSourceReverified: true,
      expectedSelectionExact: true,
      noForbiddenSelection: true,
      protectedEvidencePreserved: true,
      chronologicalVerbatimIntegrity: true,
      reducedSerializedBytes: true,
    });
    expect(result.cases[0]?.counts).toMatchObject({
      totalCanonicalTurns: 40,
      expectedRetained: 7,
      authorizedRetained: 7,
      missingExpected: 0,
      unexpectedRetained: 0,
    });
    expect(result.cases[0]?.counts.savedSerializedBytes).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('private-fixture-utterance');
    expect(JSON.stringify(result)).not.toContain('turn-16');
  });

  it('fails independent-gold comparison when a protected expected turn is omitted', async () => {
    const input = await fixture();
    const result = await evaluateCharacterOfflineEpisodeQualityV1([{
      ...input,
      independentGold: {
        ...input.independentGold,
        expectedRetainedMessageIds: [...sourceIds, 'turn-19'],
      },
    }]);
    expect(result.failedCases).toBe(1);
    expect(result.cases[0]?.checks.currentSourceReverified).toBe(true);
    expect(result.cases[0]?.checks.expectedSelectionExact).toBe(false);
    expect(result.cases[0]?.counts.missingExpected).toBe(1);
  });

  it('fails without private leakage after tampering, revoked source or foreign Subject', async () => {
    const input = await fixture();
    const forged = {
      ...input,
      caseId: 'changed-private-excerpt',
      privateEpisode: {
        ...input.privateEpisode,
        verbatimExcerptBody: input.privateEpisode.verbatimExcerptBody.replace(
          'private-fixture-utterance-16', 'forged-private-utterance-16',
        ),
      },
    };
    const revoked = {
      ...input,
      caseId: 'revoked-source',
      sourceAuthority: {
        verifyCanonicalTurn: vi.fn(async ({ turn }: {
          turn: (typeof input.canonicalTurns)[number];
        }) => turn.messageId !== 'turn-16'),
      },
    };
    const foreign = {
      ...input,
      caseId: 'foreign-subject',
      expectedScope: { ...scope, subjectId: 'foreign-tenant' },
    };
    const result = await evaluateCharacterOfflineEpisodeQualityV1([
      forged, revoked, foreign,
    ]);
    expect(result.failedCases).toBe(3);
    expect(result.cases.every(item =>
      item.checks.currentSourceReverified === false)).toBe(true);
    expect(result.cases.every(item => item.counts.authorizedRetained === 0)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-fixture-utterance');
  });

  it('rejects contradictory or non-canonical gold before assigning a score', async () => {
    const input = await fixture();
    await expect(evaluateCharacterOfflineEpisodeQualityV1([{
      ...input,
      independentGold: {
        ...input.independentGold,
        expectedRetainedMessageIds: sourceIds,
        forbiddenRetainedMessageIds: ['turn-16'],
      },
    }])).rejects.toThrow('contradictory');

    await expect(evaluateCharacterOfflineEpisodeQualityV1([{
      ...input,
      independentGold: {
        ...input.independentGold,
        expectedRetainedMessageIds: ['turn-outside-source'],
      },
    }])).rejects.toThrow('contradictory');
  });
});
