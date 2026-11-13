import { describe, expect, it, vi } from 'vitest';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  bindCharacterSharedMemoryAdmissionV1,
  createPostgresCharacterSharedMemoryReadPortV1,
  selectCharacterSharedMemoryForTurnV1,
  type CharacterSharedMemoryOwnerRowV1,
} from '../apps/api/src/character-shared-memory-context-v1.js';

const scope = { subjectId: 'owner-a', characterId: 'seyeon', threadId: 'thread-a' };
const turn = { text: '고양이 이야기 기억하시나요?', createdAt: '2026-11-09T06:30:00.000Z' };
const old = '2026-11-01T00:00:00.000Z';
const row: CharacterSharedMemoryOwnerRowV1 = {
  id: '11111111-1111-4111-8111-111111111111',
  text: '고양이 두 마리를 키워요.',
  createdAt: old, updatedAt: old,
};

describe('Member-owned shared memory source selection', () => {
  it('selects topical notes, preserves self-report authority and does not dump other notes', async () => {
    const port = { readOwnerSharedMemory: vi.fn(async () => [
      row, { ...row, id: '22222222-2222-4222-8222-222222222222', text: '매운 음식을 좋아해요' },
    ]) };
    const selected = await selectCharacterSharedMemoryForTurnV1({ scope, currentUserTurn: turn, port });
    expect(port.readOwnerSharedMemory).toHaveBeenCalledWith({
      subjectId: 'owner-a', currentTurnAt: turn.createdAt,
    });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.sourceRef).toContain(row.id);
    expect(selected[0]?.text).toContain('고양이 두 마리를 키워요.');
    expect(selected[0]?.text).toContain('"claimKind":"user_self_reported"');
    expect(JSON.stringify(selected)).not.toContain('매운 음식');
  });

  it('does not synthesize a memory when a topic is unrelated or the source was updated after the turn', async () => {
    const late = { ...row, updatedAt: '2026-11-10T00:00:00.000Z' };
    const recent = await selectCharacterSharedMemoryForTurnV1({
      scope, currentUserTurn: turn, port: { readOwnerSharedMemory: async () => [late] },
    });
    expect(recent).toEqual([]);
    const unrelated = await selectCharacterSharedMemoryForTurnV1({
      scope, currentUserTurn: { ...turn, text: '어떤 직업을 선택할까요?' },
      port: { readOwnerSharedMemory: async () => [row] },
    });
    expect(unrelated).toEqual([]);
  });

  it('fails closed on duplicate source identity and invalid timestamps', async () => {
    await expect(selectCharacterSharedMemoryForTurnV1({
      scope, currentUserTurn: turn,
      port: { readOwnerSharedMemory: async () => [row, row] },
    })).rejects.toMatchObject({ name: 'CharacterSharedMemoryContextHoldV1' });
    await expect(selectCharacterSharedMemoryForTurnV1({
      scope, currentUserTurn: turn,
      port: { readOwnerSharedMemory: async () => [{ ...row, updatedAt: 'not-a-time' }] },
    })).rejects.toMatchObject({ name: 'CharacterSharedMemoryContextHoldV1' });
  });

  it('authorizes only exact pinned text under the exact Member/Character/thread scope', async () => {
    const selected = await selectCharacterSharedMemoryForTurnV1({
      scope, currentUserTurn: turn,
      port: { readOwnerSharedMemory: async () => [row] },
    });
    const baseAdmission = { admit: vi.fn(async () => true) };
    const admission = bindCharacterSharedMemoryAdmissionV1({
      scope, sources: selected, baseAdmission,
    });
    const segment = { layer: 'shared_user_memory' as const,
      sourceRef: selected[0]!.sourceRef, text: selected[0]!.text };
    expect(await admission.admit({ scope, segment })).toBe(true);
    expect(await admission.admit({ scope: { ...scope, characterId: 'baekheon' }, segment })).toBe(false);
    expect(await admission.admit({ scope, segment: { ...segment, text: 'forged memory' } })).toBe(false);
    expect(baseAdmission.admit).not.toHaveBeenCalled();
  });

  it('uses bounded owner and turn inputs in the existing database transaction', async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const query: PostgresTransactionQueryV1['query'] =
      async <Row = Record<string, unknown>>(sql: string, values: readonly unknown[] = []) => {
        calls.push({ sql, values });
        return { rows: [row] as unknown as readonly Row[] };
      };
    const port = createPostgresCharacterSharedMemoryReadPortV1({ query });
    expect(await port.readOwnerSharedMemory({
      subjectId: 'owner-a', currentTurnAt: turn.createdAt,
    })).toEqual([row]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.values).toEqual(['owner-a', turn.createdAt]);
    expect(calls[0]?.sql).toContain('where subject_id = $1::uuid and updated_at <= $2::timestamptz');
  });
});
