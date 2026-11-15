import { describe, expect, it, vi } from 'vitest';
import {
  compactCharacterCanonicalTurnExcerptsOfflineV1,
  revalidateCharacterCanonicalTurnEpisodeOfflineV1,
  type CharacterOfflineEvidenceExcerptCompactionInputV1,
} from '../packages/domain/src/character-offline-evidence-excerpt-compaction-v1.js';

const scope = Object.freeze({
  subjectId: 'subject-approved',
  characterId: 'baekheon',
  threadId: 'thread-approved',
});
function fixture(): CharacterOfflineEvidenceExcerptCompactionInputV1 {
  const canonicalTurns = Array.from({ length: 6 }, (_, i) => ({
    messageId: 'canonical-' + (i + 1),
    sequenceNo: i + 1,
    role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
    speakerCharacterId: i % 2 === 0 ? null : 'baekheon',
    createdAt: '2026-11-0' + (i + 1) + 'T10:00:00.000Z',
    text: 'Canonical utterance '+(i + 1)+': ' + String(i + 1).repeat(260),
  }));
  return {
    scope,
    canonicalTurns,
    selectedMessageIds: ['canonical-1', 'canonical-4', 'canonical-6'],
    protectedMessageIds: ['canonical-4'],
    maximumEpisodeBytes: 1600,
    authority: {
      verifyCanonicalTurn: vi.fn(async ({ scope: claimed, turn }) =>
        claimed.subjectId === scope.subjectId &&
        claimed.characterId === scope.characterId &&
        claimed.threadId === scope.threadId &&
        canonicalTurns.some(row =>
          row.messageId === turn.messageId &&
          row.text === turn.text &&
          row.createdAt === turn.createdAt)),
    },
  };
}

describe('source-verified, extractive offline episode compaction v1', () => {
  it('retains verbatim protected turns, chronology and full canonical source IDs with smaller bytes', async () => {
    const input = fixture();
    const result = await compactCharacterCanonicalTurnExcerptsOfflineV1(input);
    expect(result.disposition).toBe('compacted');
    expect(result.executionMode).toBe('offline_extractive_only');
    expect(input.authority.verifyCanonicalTurn).toHaveBeenCalledTimes(6);
    expect(result.privateEpisode?.sourceMessageIds).toEqual([
      'canonical-1', 'canonical-2', 'canonical-3',
      'canonical-4', 'canonical-5', 'canonical-6',
    ]);
    expect(result.privateEpisode?.protectedMessageIds).toEqual(['canonical-4']);
    const excerpt = JSON.parse(result.privateEpisode!.verbatimExcerptBody);
    expect(excerpt.derivation).toBe('verbatim_no_paraphrase_or_semantic_inference');
    expect(excerpt.turns.map((x: { messageId: string }) => x.messageId))
      .toEqual(['canonical-1', 'canonical-4', 'canonical-6']);
    expect(excerpt.turns[1].text).toBe(input.canonicalTurns[3]!.text);
    expect(excerpt.turns[1].speakerCharacterId).toBe('baekheon');
    expect(result.trace.excerptSerializedBytes).toBeLessThan(
      result.trace.canonicalSerializedBytes,
    );
    expect(JSON.stringify(result.trace)).not.toContain('Canonical utterance');
    expect(JSON.stringify(result.trace)).not.toContain('canonical-4');
  });

  it('returns no episode when the excerpt does not reduce byte usage', async () => {
    const input = fixture();
    const result = await compactCharacterCanonicalTurnExcerptsOfflineV1({
      ...input,
      selectedMessageIds: input.canonicalTurns.map(x => x.messageId),
      maximumEpisodeBytes: 5000,
    });
    expect(result.disposition).toBe('not_beneficial');
    expect(result.privateEpisode).toBeNull();
  });

  it('fails closed when canonical source access is revoked before constructing excerpts', async () => {
    const input = fixture();
    const verifyCanonicalTurn = vi.fn(async ({ turn }: {
      turn: (typeof input.canonicalTurns)[number];
    }) => turn.messageId !== 'canonical-4');
    await expect(compactCharacterCanonicalTurnExcerptsOfflineV1({
      ...input,
      authority: { verifyCanonicalTurn },
    })).rejects.toMatchObject({ code: 'OFFLINE_EPISODE_SOURCE_HELD' });
    expect(verifyCanonicalTurn).toHaveBeenCalledTimes(4);
  });

  it('rechecks exact canonical source and current rights before offline episode reuse', async () => {
    const input = fixture();
    const original = await compactCharacterCanonicalTurnExcerptsOfflineV1(input);
    const privateEpisode = original.privateEpisode!;
    const refreshed = await revalidateCharacterCanonicalTurnEpisodeOfflineV1({
      expectedScope: scope,
      privateEpisode,
      canonicalTurns: input.canonicalTurns,
      authority: input.authority,
    });
    expect(refreshed.verbatimExcerptBody).toBe(privateEpisode.verbatimExcerptBody);
    expect(refreshed.sourceMessageIds).toEqual(privateEpisode.sourceMessageIds);
    expect(input.authority.verifyCanonicalTurn).toHaveBeenCalledTimes(12);
  });

  it('refuses replay after revocation, deletion, scope change or old-body tampering', async () => {
    const input = fixture();
    const original = await compactCharacterCanonicalTurnExcerptsOfflineV1(input);
    const privateEpisode = original.privateEpisode!;
    const revoked = {
      verifyCanonicalTurn: vi.fn(async ({ turn }: {
        turn: (typeof input.canonicalTurns)[number];
      }) => turn.messageId !== 'canonical-4'),
    };
    await expect(revalidateCharacterCanonicalTurnEpisodeOfflineV1({
      expectedScope: scope,
      privateEpisode,
      canonicalTurns: input.canonicalTurns,
      authority: revoked,
    })).rejects.toMatchObject({ code: 'OFFLINE_EPISODE_SOURCE_HELD' });

    await expect(revalidateCharacterCanonicalTurnEpisodeOfflineV1({
      expectedScope: scope,
      privateEpisode,
      canonicalTurns: input.canonicalTurns.filter(turn => turn.messageId !== 'canonical-3'),
      authority: input.authority,
    })).rejects.toMatchObject({ code: 'OFFLINE_EPISODE_SOURCE_HELD' });

    // A standalone spy must not inherit existing canonical-read call history.
    const wrongScopePort = vi.fn(async () => true);
    await expect(revalidateCharacterCanonicalTurnEpisodeOfflineV1({
      expectedScope: { ...scope, subjectId: 'foreign-subject' },
      privateEpisode,
      canonicalTurns: input.canonicalTurns,
      authority: { verifyCanonicalTurn: wrongScopePort },
    })).rejects.toMatchObject({ code: 'OFFLINE_EPISODE_SOURCE_HELD' });
    expect(wrongScopePort).not.toHaveBeenCalled();

    await expect(revalidateCharacterCanonicalTurnEpisodeOfflineV1({
      expectedScope: scope,
      privateEpisode: {
        ...privateEpisode,
        verbatimExcerptBody: privateEpisode.verbatimExcerptBody.replace(
          'Canonical utterance 4', 'A forged replacement',
        ),
      },
      canonicalTurns: input.canonicalTurns,
      authority: input.authority,
    })).rejects.toMatchObject({ code: 'OFFLINE_EPISODE_SOURCE_HELD' });
  });

  it('rejects missing protected evidence and foreign Character speakers', async () => {
    const input = fixture();
    await expect(compactCharacterCanonicalTurnExcerptsOfflineV1({
      ...input,
      selectedMessageIds: ['canonical-1', 'canonical-6'],
    })).rejects.toMatchObject({ code: 'OFFLINE_EPISODE_SOURCE_HELD' });
    const corrupted = [...input.canonicalTurns];
    corrupted[1] = { ...corrupted[1]!, speakerCharacterId: 'yeoul' };
    await expect(compactCharacterCanonicalTurnExcerptsOfflineV1({
      ...input,
      canonicalTurns: corrupted,
    })).rejects.toMatchObject({ code: 'OFFLINE_EPISODE_SOURCE_HELD' });
  });
});
